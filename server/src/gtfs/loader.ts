import fs from "node:fs/promises";
import path from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import { config } from "../config.ts";
import { parseCsv } from "./csv.ts";
import { GtfsStore, type GtfsFiles } from "./store.ts";

const FILES = ["agency.txt", "routes.txt", "stops.txt", "trips.txt", "stop_times.txt", "calendar.txt", "calendar_dates.txt", "shapes.txt", "feed_info.txt"];

type Log = { info: (msg: string) => void; warn: (msg: string) => void };

export function parseGtfsZip(zip: Uint8Array): GtfsStore {
  const entries = unzipSync(zip, { filter: (f) => FILES.includes(path.basename(f.name)) });
  const files: GtfsFiles = {};
  for (const [name, data] of Object.entries(entries)) files[path.basename(name)] = parseCsv(strFromU8(data));
  if (!files["stops.txt"] || !files["trips.txt"] || !files["stop_times.txt"]) {
    throw new Error("Archive GTFS incomplète (stops/trips/stop_times manquants)");
  }
  return new GtfsStore(files);
}

async function download(url: string): Promise<Uint8Array> {
  const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`Téléchargement GTFS : HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * Charge le GTFS depuis le cache disque s'il est récent, sinon le télécharge.
 * Si le téléchargement échoue, on se rabat sur le cache même périmé.
 */
export async function loadGtfs(log: Log, force = false): Promise<GtfsStore> {
  const file = path.join(config.dataDir, "gtfs.zip");
  await fs.mkdir(config.dataDir, { recursive: true });

  const stat = await fs.stat(file).catch(() => null);
  const fresh = stat && Date.now() - stat.mtimeMs < config.gtfs.refreshHours * 3600_000;

  if (!force && fresh) {
    log.info(`GTFS : lecture du cache ${file}`);
    return parseGtfsZip(await fs.readFile(file));
  }

  try {
    log.info(`GTFS : téléchargement depuis ${config.gtfs.url}`);
    const zip = await download(config.gtfs.url);
    const store = parseGtfsZip(zip); // valide avant d'écraser le cache
    await fs.writeFile(`${file}.tmp`, zip);
    await fs.rename(`${file}.tmp`, file);
    return store;
  } catch (err) {
    if (!stat) throw err;
    log.warn(`GTFS : échec du téléchargement (${(err as Error).message}), utilisation du cache existant`);
    return parseGtfsZip(await fs.readFile(file));
  }
}
