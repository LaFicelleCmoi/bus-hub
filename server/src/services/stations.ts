import type { NearbyStation, Station } from "@bus-hub/shared";
import type { GtfsStore } from "../gtfs/store.ts";
import { haversine } from "../gtfs/geo.ts";
import { normalize } from "../util/text.ts";

export function searchStations(store: GtfsStore, q: string, limit = 20): Station[] {
  const nq = normalize(q);
  if (!nq) return [];
  const words = nq.split(" ");
  const scored: { st: Station; score: number }[] = [];
  for (const st of store.stations.values()) {
    const name = normalize(st.name);
    const full = `${name} ${normalize(st.city)}`;
    if (!words.every((w) => full.includes(w))) continue;
    let score = 0;
    if (name === nq) score += 100;
    if (name.startsWith(nq)) score += 50;
    if (name.split(" ").some((w) => w.startsWith(words[0]!))) score += 20;
    score += st.lineIds.length; // les gros arrêts d'abord
    scored.push({ st, score });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.st.name.localeCompare(b.st.name, "fr"))
    .slice(0, limit)
    .map((x) => x.st);
}

export function nearbyStations(store: GtfsStore, lat: number, lon: number, radius = 800, limit = 10): NearbyStation[] {
  const out: NearbyStation[] = [];
  for (const st of store.stations.values()) {
    const distance = Math.round(haversine([lat, lon], [st.lat, st.lon]));
    if (distance <= radius) out.push({ ...st, distance });
  }
  return out.sort((a, b) => a.distance - b.distance).slice(0, limit);
}
