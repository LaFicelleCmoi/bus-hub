import Fastify from "fastify";
import { registerApi } from "./api.ts";
import { config } from "./config.ts";
import { loadGtfs } from "./gtfs/loader.ts";
import type { GtfsStore } from "./gtfs/store.ts";
import { AlertsService } from "./realtime/alerts.ts";
import { OfficialSiteService } from "./realtime/official.ts";
import { SiriClient } from "./realtime/siri.ts";

const log = {
  info: (m: string) => console.log(`[bus-hub] ${m}`),
  warn: (m: string) => console.warn(`[bus-hub] ${m}`),
};

let store: GtfsStore | undefined;
let loadedAt = new Date();
let loading: Promise<GtfsStore> | null = null;

/**
 * Charge le GTFS une seule fois, même si plusieurs requêtes arrivent pendant le chargement.
 * En cas d'échec (démarrage à froid sans réseau…), la requête suivante retente.
 */
function ensureStore(): Promise<GtfsStore> {
  if (store) return Promise.resolve(store);
  loading ??= loadGtfs(log)
    .then((s) => {
      store = s;
      loadedAt = new Date();
      log.info(`GTFS chargé : ${s.lines.size} lignes, ${s.stations.size} arrêts, ${s.trips.size} courses (version ${s.feed.version ?? "?"})`);
      return s;
    })
    .finally(() => {
      loading = null;
    });
  return loading;
}
ensureStore().catch((e) => log.warn(`Chargement initial du GTFS impossible : ${(e as Error).message}`));

const siri = new SiriClient();
const alerts = new AlertsService();
alerts.start();
const official = new OfficialSiteService();
official.start();
void siri.checkStatus();
setInterval(() => void siri.checkStatus(), 5 * 60_000).unref();

// Rechargement périodique du GTFS, sans interruption de service
setInterval(async () => {
  try {
    store = await loadGtfs(log, true);
    loadedAt = new Date();
    log.info("GTFS rechargé");
  } catch (e) {
    log.warn(`Rechargement GTFS impossible : ${(e as Error).message}`);
  }
}, config.gtfs.refreshHours * 3600_000).unref();

// L'instance Fastify est créée ici : la détection Vercel cherche le fichier d'entrée qui importe fastify
const app = Fastify({ logger: config.production });
await registerApi(app, { store: () => store!, loadedAt: () => loadedAt, siri, alerts, official });
// Les routes de données attendent la fin du chargement du GTFS
app.addHook("onRequest", async (req) => {
  if (req.url.startsWith("/api/") && !req.url.startsWith("/api/health")) await ensureStore();
});

// Pas de `await` : sur Vercel, listen() est intercepté par le runtime et ne se résout pas
app.listen({ port: config.port, host: config.host }).then(
  () => log.info(`API prête sur http://localhost:${config.port}`),
  (e: Error) => {
    log.warn(`Démarrage impossible : ${e.message}`);
    process.exit(1);
  },
);

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, async () => {
    alerts.stop();
    official.stop();
    await app.close();
    process.exit(0);
  });
}
