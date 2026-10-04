import { buildApp } from "./app.ts";
import { config } from "./config.ts";
import { loadGtfs } from "./gtfs/loader.ts";
import type { GtfsStore } from "./gtfs/store.ts";
import { AlertsService } from "./realtime/alerts.ts";
import { SiriClient } from "./realtime/siri.ts";

const log = {
  info: (m: string) => console.log(`[bus-hub] ${m}`),
  warn: (m: string) => console.warn(`[bus-hub] ${m}`),
};

let store: GtfsStore = await loadGtfs(log);
let loadedAt = new Date();
log.info(`GTFS chargé : ${store.lines.size} lignes, ${store.stations.size} arrêts, ${store.trips.size} courses (version ${store.feed.version ?? "?"})`);

const siri = new SiriClient();
const alerts = new AlertsService();
alerts.start();
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

const app = await buildApp({ store: () => store, loadedAt: () => loadedAt, siri, alerts }, { logger: config.production });
await app.listen({ port: config.port, host: config.host });
log.info(`API prête sur http://localhost:${config.port}`);

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, async () => {
    alerts.stop();
    await app.close();
    process.exit(0);
  });
}
