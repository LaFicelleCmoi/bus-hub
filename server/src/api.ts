import fs from "node:fs";
import path from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import compress from "@fastify/compress";
import fastifyStatic from "@fastify/static";
import type { LineDetail, MetaResponse, NetworkShape, VehiclesResponse } from "@bus-hub/shared";
import { config } from "./config.ts";
import type { GtfsStore } from "./gtfs/store.ts";
import { isoToServiceDate, serviceDateOf } from "./gtfs/time.ts";
import type { AlertsService } from "./realtime/alerts.ts";
import type { SiriClient } from "./realtime/siri.ts";
import { getDepartures } from "./services/departures.ts";
import { nearbyStations, searchStations } from "./services/stations.ts";
import { getTimetable } from "./services/timetable.ts";
import { estimateVehicles, GpsCache } from "./services/vehicles.ts";

export interface AppDeps {
  /** Accès au store courant (il est remplacé à chaque rechargement du GTFS) */
  store: () => GtfsStore;
  loadedAt: () => Date;
  siri: SiriClient;
  alerts: AlertsService;
  now?: () => number;
}

const notFound = (what: string) => ({ error: `${what} introuvable` });

/** Instance Fastify prête à l'emploi (utilisée par les tests). */
export async function buildApp(deps: AppDeps, opts: { logger?: boolean } = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: opts.logger ?? false });
  await registerApi(app, deps);
  return app;
}

/** Enregistre les routes de l'API (et le front compilé s'il existe) sur une instance Fastify. */
export async function registerApi(app: FastifyInstance, deps: AppDeps): Promise<void> {
  const now = deps.now ?? Date.now;
  const gps = new GpsCache();

  await app.register(compress);

  app.addHook("onSend", async (req, reply) => {
    if (req.url.startsWith("/api/")) reply.header("Cache-Control", "no-store");
  });

  app.get("/api/health", async () => ({ ok: true }));

  app.get("/api/meta", async (): Promise<MetaResponse> => {
    const s = deps.store();
    return {
      network: "Lignes de l'Agglo – Pays d'Aubagne et de l'Étoile",
      feedVersion: s.feed.version,
      feedStart: s.feed.start,
      feedEnd: s.feed.end,
      loadedAt: deps.loadedAt().toISOString(),
      counts: { lines: s.sortedLines().length, stations: s.stations.size, trips: s.trips.size },
      bounds: s.bounds,
      realtime: {
        siri: deps.siri.info(),
        alerts: { state: deps.alerts.state, fetchedAt: deps.alerts.lastFetch },
      },
      sources: [
        {
          name: "GTFS Agglobus – Les lignes de l'agglo (Métropole Aix-Marseille-Provence)",
          url: "https://transport.data.gouv.fr/datasets/reseaux-de-transports-en-commun-de-la-metropole-daix-marseille-provence-et-des-bouches-du-rhone/",
          license: "Licence Ouverte 2.0",
        },
        { name: "SIRI temps réel – Lignes de l'Agglo Aubagne", url: "https://transport.data.gouv.fr/resources/83941", license: "Licence Ouverte 2.0" },
        { name: "GTFS-RT Service Alerts – Métropole AMP", url: "https://transport.data.gouv.fr/datasets/reseaux-de-transports-en-commun-de-la-metropole-daix-marseille-provence-et-des-bouches-du-rhone/", license: "Licence Ouverte 2.0" },
        { name: "Fond de carte © contributeurs OpenStreetMap", url: "https://www.openstreetmap.org/copyright", license: "ODbL" },
      ],
    };
  });

  // --- Lignes
  app.get("/api/lines", async () => deps.store().sortedLines());

  app.get("/api/shapes", async (): Promise<NetworkShape[]> => {
    const s = deps.store();
    return s.sortedLines().map((line) => {
      const main = [0, 1].map((dir) => s.linePatterns(line.id).find((p) => p.directionId === dir)).filter((p) => p !== undefined);
      return { lineId: line.id, color: line.color, paths: main.map((p) => s.toLinePattern(p).shape) };
    });
  });

  app.get<{ Params: { id: string } }>("/api/lines/:id", async (req, reply) => {
    const s = deps.store();
    const line = s.lines.get(req.params.id);
    if (!line) return reply.code(404).send(notFound("Ligne"));
    const detail: LineDetail = { ...line, patterns: s.linePatterns(line.id).map((p) => s.toLinePattern(p)) };
    return detail;
  });

  app.get<{ Params: { id: string }; Querystring: { date?: string; direction?: string } }>("/api/lines/:id/timetable", async (req, reply) => {
    const date = req.query.date ? isoToServiceDate(req.query.date) : serviceDateOf(now());
    if (!date) return reply.code(400).send({ error: "Paramètre date attendu au format AAAA-MM-JJ" });
    const tt = getTimetable(deps.store(), req.params.id, date, req.query.direction === "1" ? 1 : 0);
    return tt ?? reply.code(404).send(notFound("Ligne"));
  });

  // --- Arrêts
  app.get<{ Querystring: { q?: string } }>("/api/stations", async (req) => {
    const s = deps.store();
    if (req.query.q) return searchStations(s, req.query.q);
    return [...s.stations.values()];
  });

  app.get<{ Querystring: { lat?: string; lon?: string; radius?: string } }>("/api/stations/nearby", async (req, reply) => {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return reply.code(400).send({ error: "lat et lon requis" });
    const radius = Math.min(Number(req.query.radius) || 800, 5000);
    return nearbyStations(deps.store(), lat, lon, radius);
  });

  app.get<{ Params: { id: string } }>("/api/stations/:id", async (req, reply) => {
    const st = deps.store().stations.get(req.params.id);
    return st ?? reply.code(404).send(notFound("Arrêt"));
  });

  app.get<{ Params: { id: string }; Querystring: { limit?: string } }>("/api/stations/:id/departures", async (req, reply) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 60);
    const res = await getDepartures(deps.store(), deps.siri, gps, req.params.id, now(), limit);
    return res ?? reply.code(404).send(notFound("Arrêt"));
  });

  // --- Véhicules
  app.get<{ Querystring: { line?: string } }>("/api/vehicles", async (req): Promise<VehiclesResponse> => {
    const t = now();
    return { vehicles: estimateVehicles(deps.store(), gps, t, req.query.line || undefined), generatedAt: new Date(t).toISOString() };
  });

  // --- Alertes
  app.get("/api/alerts", async () => deps.alerts.response());

  // --- Front compilé (production)
  if (fs.existsSync(config.webDist)) {
    await app.register(fastifyStatic, {
      root: config.webDist,
      // Les fichiers hachés de Vite peuvent être mis en cache indéfiniment
      setHeaders: (res, filePath) => {
        if (filePath.includes(`${path.sep}assets${path.sep}`)) res.header("Cache-Control", "public, max-age=31536000, immutable");
      },
    });
    app.setNotFoundHandler((req, reply) => {
      const url = req.url.split("?")[0]!;
      if (url.startsWith("/api/")) return reply.code(404).send({ error: "Route inconnue" });
      // Fichier absent (asset d'un ancien build…) : vrai 404, pas la page HTML
      if (path.extname(url)) return reply.code(404).send("Not found");
      return reply.header("Cache-Control", "no-cache").sendFile("index.html"); // routage côté client
    });
  }
}
