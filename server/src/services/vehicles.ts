import type { Vehicle } from "@bus-hub/shared";
import type { GtfsStore, Trip } from "../gtfs/store.ts";
import { addDays, serviceDateOf, serviceDayOrigin } from "../gtfs/time.ts";

interface GpsFix {
  lat: number;
  lon: number;
  bearing: number | null;
  at: number;
}

/** Dernières positions GPS remontées par le SIRI (quand il en fournit), par course. */
export class GpsCache {
  private readonly fixes = new Map<string, GpsFix>();
  private readonly maxAgeMs: number;

  constructor(maxAgeMs = 120_000) {
    this.maxAgeMs = maxAgeMs;
  }

  set(tripId: string, fix: Omit<GpsFix, "at">, now = Date.now()): void {
    this.fixes.set(tripId, { ...fix, at: now });
  }

  get(tripId: string, now = Date.now()): GpsFix | undefined {
    const f = this.fixes.get(tripId);
    if (f && now - f.at > this.maxAgeMs) {
      this.fixes.delete(tripId);
      return undefined;
    }
    return f;
  }
}

/** Position théorique d'une course à `t` secondes depuis l'origine de son jour de service. */
export function positionOnTrip(store: GtfsStore, trip: Trip, t: number) {
  const sts = trip.stopTimes;
  const first = sts[0]!.dep;
  const last = sts[sts.length - 1]!.arr;
  if (t < first || t > last) return null;

  const pattern = store.patterns.get(trip.patternKey)!;
  // Dernier arrêt atteint
  let i = 0;
  while (i < sts.length - 1 && sts[i + 1]!.arr <= t) i++;
  const cur = sts[i]!;

  let dist: number;
  let nextIdx: number;
  if (t <= cur.dep || i === sts.length - 1) {
    dist = pattern.stopDistances[i]!;
    nextIdx = i; // à quai
  } else {
    const next = sts[i + 1]!;
    const span = next.arr - cur.dep;
    const f = span > 0 ? (t - cur.dep) / span : 1;
    const d0 = pattern.stopDistances[i]!;
    const d1 = Math.max(d0, pattern.stopDistances[i + 1]!);
    dist = d0 + (d1 - d0) * f;
    nextIdx = i + 1;
  }
  const { point, bearing } = pattern.polyline.at(dist);
  return { point, bearing, nextIdx, progress: last > first ? (t - first) / (last - first) : 0 };
}

export function estimateVehicles(store: GtfsStore, gps: GpsCache, now: number, lineId?: string): Vehicle[] {
  const today = serviceDateOf(now);
  const out: Vehicle[] = [];
  for (const date of [addDays(today, -1), today]) {
    const services = store.activeServices(date);
    const origin = serviceDayOrigin(date);
    const t = (now - origin) / 1000;
    for (const trip of store.trips.values()) {
      if (lineId && trip.routeId !== lineId) continue;
      if (!services.has(trip.serviceId)) continue;
      const pos = positionOnTrip(store, trip, t);
      if (!pos) continue;
      const line = store.lines.get(trip.routeId);
      const nextSt = trip.stopTimes[pos.nextIdx]!;
      const fix = gps.get(trip.id, now);
      out.push({
        tripId: trip.id,
        lineId: trip.routeId,
        lineShortName: line?.shortName ?? trip.routeId,
        lineColor: line?.color ?? "#1d4ed8",
        lineTextColor: line?.textColor ?? "#ffffff",
        headsign: trip.headsign,
        directionId: trip.directionId,
        lat: fix?.lat ?? pos.point[0],
        lon: fix?.lon ?? pos.point[1],
        bearing: fix ? fix.bearing : pos.bearing,
        source: fix ? "gps" : "estimated",
        nextStopName: store.stops.get(nextSt.stopId)?.name ?? null,
        nextStopAt: new Date(origin + nextSt.arr * 1000).toISOString(),
        progress: Math.round(pos.progress * 1000) / 1000,
      });
    }
  }
  return out;
}
