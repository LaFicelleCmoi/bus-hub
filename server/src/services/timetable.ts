import type { TimetableResponse } from "@bus-hub/shared";
import type { GtfsStore } from "../gtfs/store.ts";
import { formatGtfsTime, serviceDateToIso, type ServiceDate } from "../gtfs/time.ts";

/**
 * Fusionne plusieurs séquences d'arrêts en une seule liste ordonnée de colonnes :
 * chaque arrêt inconnu est inséré juste après le dernier arrêt connu qui le précède.
 */
export function mergeStopSequences(seqs: string[][]): string[] {
  const cols: string[] = [];
  for (const seq of seqs) {
    let insertAt = 0;
    for (const id of seq) {
      const pos = cols.indexOf(id);
      if (pos >= 0) {
        insertAt = Math.max(insertAt, pos + 1);
      } else {
        cols.splice(insertAt, 0, id);
        insertAt++;
      }
    }
  }
  return cols;
}

export function getTimetable(store: GtfsStore, lineId: string, date: ServiceDate, directionId: number): TimetableResponse | null {
  const line = store.lines.get(lineId);
  if (!line) return null;

  const services = store.activeServices(date);
  const patterns = store.linePatterns(lineId).filter((p) => p.directionId === directionId);
  const trips = patterns
    .flatMap((p) => p.tripIds.map((id) => store.trips.get(id)!))
    .filter((t) => t && services.has(t.serviceId))
    .sort((a, b) => a.stopTimes[0]!.dep - b.stopTimes[0]!.dep);

  // Les parcours effectivement circulés ce jour-là, du plus fréquent au moins fréquent
  const used = patterns.filter((p) => trips.some((t) => t.patternKey === p.key));
  const columns = mergeStopSequences((used.length ? used : patterns.slice(0, 1)).map((p) => p.stopIds));
  const colIndex = new Map(columns.map((id, i) => [id, i]));

  return {
    lineId,
    date: serviceDateToIso(date),
    directionId,
    headsign: used[0]?.headsign ?? patterns[0]?.headsign ?? line.directions[directionId] ?? "",
    stops: columns.map((id) => store.stopRef(id)),
    trips: trips.map((t) => {
      const times: (string | null)[] = columns.map(() => null);
      for (const st of t.stopTimes) {
        const i = colIndex.get(st.stopId);
        if (i !== undefined && times[i] === null) times[i] = formatGtfsTime(st.dep);
      }
      return { tripId: t.id, times };
    }),
  };
}
