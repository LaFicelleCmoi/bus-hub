import type { Departure, DeparturesResponse } from "@bus-hub/shared";
import { config } from "../config.ts";
import type { GtfsStore, Trip } from "../gtfs/store.ts";
import { addDays, serviceDateOf, serviceDayOrigin } from "../gtfs/time.ts";
import type { SiriClient, SiriStopVisit } from "../realtime/siri.ts";
import type { GpsCache } from "./vehicles.ts";

const REALTIME_WAIT_MS = 2500;

interface Scheduled {
  trip: Trip;
  idx: number;
  aimedMs: number;
}

/** Départs théoriques à une liste de quais, sur la fenêtre [from, to]. */
export function scheduledDepartures(store: GtfsStore, stopIds: string[], from: number, to: number): Scheduled[] {
  const today = serviceDateOf(from);
  // La veille couvre les horaires > 24:00, le lendemain les départs proches de minuit
  const dates = [addDays(today, -1), today, addDays(today, 1)];
  const out: Scheduled[] = [];
  for (const date of dates) {
    const services = store.activeServices(date);
    const origin = serviceDayOrigin(date);
    for (const stopId of stopIds) {
      for (const { trip, idx } of store.stopIndex.get(stopId) ?? []) {
        if (!services.has(trip.serviceId)) continue;
        const st = trip.stopTimes[idx]!;
        if (!st.pickup || idx === trip.stopTimes.length - 1) continue; // pas de montée / terminus
        const aimedMs = origin + st.dep * 1000;
        if (aimedMs >= from && aimedMs <= to) out.push({ trip, idx, aimedMs });
      }
    }
  }
  return out.sort((a, b) => a.aimedMs - b.aimedMs);
}

function toDeparture(store: GtfsStore, s: Scheduled): Departure {
  const line = store.lines.get(s.trip.routeId);
  const st = s.trip.stopTimes[s.idx]!;
  const last = s.trip.stopTimes[s.trip.stopTimes.length - 1]!;
  return {
    tripId: s.trip.id,
    lineId: s.trip.routeId,
    lineShortName: line?.shortName ?? s.trip.routeId,
    lineColor: line?.color ?? "#1d4ed8",
    lineTextColor: line?.textColor ?? "#ffffff",
    headsign: st.headsign || s.trip.headsign || store.stops.get(last.stopId)?.name || "",
    stopId: st.stopId,
    aimed: new Date(s.aimedMs).toISOString(),
    expected: null,
    delaySeconds: null,
    source: "scheduled",
    isTerminus: false,
  };
}

const bareTripId = (id: string) => (id.startsWith(config.gtfs.networkPrefix) ? id.slice(config.gtfs.networkPrefix.length) : id);

/** Associe un passage SIRI à un départ théorique : par numéro de course, sinon par ligne + heure. */
export function matchVisit(dep: Departure, visits: SiriStopVisit[]): SiriStopVisit | undefined {
  const course = bareTripId(dep.tripId);
  const byJourney = visits.find((v) => v.journeyRef && (v.journeyRef === course || v.journeyRef.split(":").includes(course)));
  if (byJourney) return byJourney;
  const aimed = Date.parse(dep.aimed);
  const lineToken = dep.lineShortName.toLowerCase();
  return visits.find((v) => {
    const parts = v.lineRef.toLowerCase().split(/[:\-_]/);
    if (!parts.includes(lineToken) && !parts.includes(lineToken.replace(/^0+/, ""))) return false;
    const vAimed = Date.parse(v.aimedDeparture ?? v.aimedArrival ?? "");
    return Number.isFinite(vAimed) && Math.abs(vAimed - aimed) <= 90_000;
  });
}

export async function getDepartures(
  store: GtfsStore,
  siri: SiriClient,
  gps: GpsCache,
  stationId: string,
  now: number,
  limit = 20,
): Promise<DeparturesResponse | null> {
  const station = store.stations.get(stationId);
  if (!station) return null;

  // On garde 2 minutes de passé : un bus en retard peut encore passer
  const sched = scheduledDepartures(store, station.platformIds, now - 120_000, now + 24 * 3600_000).slice(0, limit * 2);
  const deps = sched.map((s) => toDeparture(store, s));

  // Temps réel : une requête SIRI par quai concerné (au plus 3, pour le quota)
  const platforms = [...new Set(deps.slice(0, limit).map((d) => d.stopId))].slice(0, 3);
  const results = await Promise.all(
    platforms.map(async (id) => {
      const stop = store.stops.get(id)!;
      // On n'attend pas le SIRI au-delà de REALTIME_WAIT_MS : la requête continue en arrière-plan
      // et alimente le cache pour le prochain rafraîchissement.
      const visits = await Promise.race([
        siri.stopMonitoring(siri.monitoringRef(stop)),
        new Promise<null>((r) => setTimeout(r, REALTIME_WAIT_MS, null)),
      ]);
      return [id, visits] as const;
    }),
  );
  for (const [stopId, visits] of results) {
    if (!visits?.length) continue;
    for (const dep of deps) {
      if (dep.stopId !== stopId) continue;
      const v = matchVisit(dep, visits);
      if (!v) continue;
      const expected = v.expectedDeparture ?? v.expectedArrival;
      if (expected) {
        dep.expected = new Date(expected).toISOString();
        dep.delaySeconds = Math.round((Date.parse(expected) - Date.parse(dep.aimed)) / 1000);
        dep.source = "realtime";
      }
      if (v.location) gps.set(dep.tripId, { ...v.location, bearing: v.bearing }, now);
    }
  }

  const effective = (d: Departure) => Date.parse(d.expected ?? d.aimed);
  const departures = deps
    .filter((d) => effective(d) >= now - (d.source === "realtime" ? 30_000 : 60_000))
    .sort((a, b) => effective(a) - effective(b))
    .slice(0, limit);

  return { station, departures, realtime: siri.info(), generatedAt: new Date(now).toISOString() };
}
