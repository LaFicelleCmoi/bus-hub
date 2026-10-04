import os from "node:os";
import path from "node:path";

const env = process.env;
const int = (v: string | undefined, d: number) => (v && !Number.isNaN(Number(v)) ? Number(v) : d);

const root = path.resolve(import.meta.dirname, "..");

export const config = {
  port: int(env.PORT, 3001),
  host: env.HOST ?? "0.0.0.0",
  production: env.NODE_ENV === "production",
  timezone: "Europe/Paris",
  // Sur Vercel, seul /tmp est accessible en écriture
  dataDir: env.DATA_DIR ?? (env.VERCEL ? path.join(os.tmpdir(), "bus-hub") : path.join(root, "data")),
  webDist: path.resolve(root, "../web/dist"),

  gtfs: {
    // Lien stable data.gouv.fr vers le GTFS « Agglobus – Les lignes de l'agglo »
    url: env.GTFS_URL ?? "https://www.data.gouv.fr/api/1/datasets/r/cde22673-d7e4-4cbd-837f-3c8bd9fb2f9b",
    refreshHours: int(env.GTFS_REFRESH_HOURS, 24),
    /** Préfixe des identifiants du réseau dans le GTFS et le flux d'alertes */
    networkPrefix: "AUB-",
  },

  siri: {
    enabled: env.SIRI_ENABLED !== "false",
    endpoint: env.SIRI_ENDPOINT ?? "https://siri.lametropolemobilite.fr/AUB_TPE",
    requestorRef: env.SIRI_REQUESTOR_REF ?? "open-data",
    // La Métropole limite à 10-20 requêtes/minute : on reste sous le plancher.
    maxRequestsPerMinute: int(env.SIRI_MAX_RPM, 8),
    stopMonitoringTtlMs: int(env.SIRI_SM_TTL_MS, 45_000),
    timeoutMs: int(env.SIRI_TIMEOUT_MS, 15_000),
    /** Gabarit de MonitoringRef, {code} = stop_code GTFS, {id} = stop_id sans préfixe */
    stopRefTemplate: env.SIRI_STOP_REF_TEMPLATE ?? "AUB:StopPoint:BP:{id}:LOC",
    /** Après un échec, durée pendant laquelle on n'insiste plus (préserve le quota) */
    backoffMs: int(env.SIRI_BACKOFF_MS, 10 * 60_000),
  },

  official: {
    // Site officiel du réseau : info trafic et plans
    baseUrl: env.OFFICIAL_SITE_URL ?? "https://lignes-agglo.fr",
    refreshMs: int(env.OFFICIAL_REFRESH_MS, 10 * 60_000),
    maxPosts: int(env.OFFICIAL_MAX_POSTS, 20),
  },

  alerts: {
    url: env.ALERTS_URL ?? "https://api-mobilite.rbgl.fr/api/v1/mamp/getServiceAlerts",
    refreshMs: int(env.ALERTS_REFRESH_MS, 120_000),
    /** Communes desservies : sert à repérer les alertes des réseaux voisins qui concernent le territoire */
    keywords: ["Aubagne", "Gémenos", "Roquevaire", "Auriol", "La Penne", "Cuges", "Peypin", "Cadolive", "Saint-Zacharie", "Belcodène", "La Bouilladisse", "La Destrousse", "Saint-Savournin", "Paluds", "Palud"],
  },
};
