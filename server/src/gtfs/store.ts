import type { LatLon, Line, LinePattern, Station, StopRef } from "@bus-hub/shared";
import { normalize } from "../util/text.ts";
import { haversine, Polyline } from "./geo.ts";
import { parseGtfsTime, weekdayOf, type ServiceDate } from "./time.ts";

const STATION_MERGE_RADIUS = 400;

export type GtfsFiles = Record<string, Record<string, string>[]>;

export interface Stop {
  id: string;
  code: string;
  name: string;
  lat: number;
  lon: number;
  stationId: string;
  city: string;
  wheelchair: boolean;
}

export interface StopTime {
  stopId: string;
  arr: number; // secondes depuis l'origine du jour de service
  dep: number;
  pickup: boolean;
  dropOff: boolean;
  headsign: string;
}

export interface Trip {
  id: string;
  routeId: string;
  serviceId: string;
  headsign: string;
  directionId: number;
  shapeId: string;
  stopTimes: StopTime[];
  patternKey: string;
}

export interface Pattern {
  key: string;
  routeId: string;
  directionId: number;
  headsign: string;
  stopIds: string[];
  tripIds: string[];
  polyline: Polyline;
  /** Distance le long du tracé de chaque arrêt du parcours */
  stopDistances: number[];
}

interface Calendar {
  days: boolean[];
  start: string;
  end: string;
}

export interface FeedInfo {
  version: string | null;
  start: string | null;
  end: string | null;
}

/** Index en mémoire du GTFS : le réseau d'Aubagne tient en quelques Mo. */
export class GtfsStore {
  readonly lines = new Map<string, Line>();
  readonly stops = new Map<string, Stop>();
  readonly stations = new Map<string, Station>();
  readonly trips = new Map<string, Trip>();
  readonly patterns = new Map<string, Pattern>();
  /** stop_id → liste (trip, index dans stopTimes) */
  readonly stopIndex = new Map<string, { trip: Trip; idx: number }[]>();
  readonly feed: FeedInfo;
  readonly bounds: [LatLon, LatLon];

  private readonly calendars = new Map<string, Calendar>();
  private readonly exceptions = new Map<string, Map<ServiceDate, boolean>>();
  private readonly activeCache = new Map<ServiceDate, Set<string>>();

  constructor(files: GtfsFiles) {
    const f = (name: string) => files[name] ?? [];

    // --- Lignes
    for (const r of f("routes.txt")) {
      this.lines.set(r.route_id!, {
        id: r.route_id!,
        shortName: r.route_short_name || r.route_id!,
        longName: r.route_long_name ?? "",
        color: `#${(r.route_color || "1d4ed8").padStart(6, "0")}`,
        textColor: `#${(r.route_text_color || "ffffff").padStart(6, "0")}`,
        type: Number(r.route_type ?? 3),
        directions: [r.direction0_name ?? "", r.direction1_name ?? ""],
      });
    }

    // --- Arrêts et stations
    // Le GTFS crée souvent plusieurs stations parentes homonymes pour un même pôle
    // (ex. « Gare » à Aubagne : un parent par quai). On les fusionne quand elles portent
    // le même nom, dans la même commune, à moins de STATION_MERGE_RADIUS mètres.
    const rawStops = f("stops.txt");
    const parents = new Map(rawStops.filter((s) => s.location_type === "1").map((s) => [s.stop_id!, s]));
    for (const s of rawStops) {
      if (s.location_type && s.location_type !== "0") continue;
      const parent = s.parent_station ? parents.get(s.parent_station) : undefined;
      this.stops.set(s.stop_id!, {
        id: s.stop_id!,
        code: s.stop_code ?? "",
        name: parent?.stop_name || s.stop_name || "",
        lat: Number(s.stop_lat),
        lon: Number(s.stop_lon),
        stationId: parent?.stop_id ?? s.stop_id!,
        city: s.city_name || parent?.city_name || "",
        wheelchair: s.wheelchair_boarding === "1" || parent?.wheelchair_boarding === "1",
      });
    }
    this.buildStations();

    // --- Calendriers
    for (const c of f("calendar.txt")) {
      this.calendars.set(c.service_id!, {
        days: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map((d) => c[d] === "1"),
        start: c.start_date!,
        end: c.end_date!,
      });
    }
    for (const c of f("calendar_dates.txt")) {
      let m = this.exceptions.get(c.service_id!);
      if (!m) this.exceptions.set(c.service_id!, (m = new Map()));
      m.set(c.date!, c.exception_type === "1");
    }

    // --- Courses et horaires
    for (const t of f("trips.txt")) {
      this.trips.set(t.trip_id!, {
        id: t.trip_id!,
        routeId: t.route_id!,
        serviceId: t.service_id!,
        headsign: t.trip_headsign ?? "",
        directionId: Number(t.direction_id || 0),
        shapeId: t.shape_id ?? "",
        stopTimes: [],
        patternKey: "",
      });
    }
    const seqs = new Map<string, number[]>();
    for (const st of f("stop_times.txt")) {
      const trip = this.trips.get(st.trip_id!);
      if (!trip || !this.stops.has(st.stop_id!)) continue;
      let arr = parseGtfsTime(st.arrival_time!);
      let dep = parseGtfsTime(st.departure_time!);
      if (Number.isNaN(arr)) arr = dep;
      if (Number.isNaN(dep)) dep = arr;
      trip.stopTimes.push({
        stopId: st.stop_id!,
        arr,
        dep,
        pickup: st.pickup_type !== "1",
        dropOff: st.drop_off_type !== "1",
        headsign: st.stop_headsign ?? "",
      });
      let s = seqs.get(trip.id);
      if (!s) seqs.set(trip.id, (s = []));
      s.push(Number(st.stop_sequence));
    }
    for (const trip of this.trips.values()) {
      const s = seqs.get(trip.id);
      if (s) {
        const order = trip.stopTimes.map((_, i) => i).sort((a, b) => s[a]! - s[b]!);
        trip.stopTimes = order.map((i) => trip.stopTimes[i]!);
      }
      interpolateMissingTimes(trip.stopTimes);
      if (trip.stopTimes.length < 2) this.trips.delete(trip.id);
    }

    // --- Tracés
    const shapePts = new Map<string, { seq: number; p: LatLon }[]>();
    for (const s of f("shapes.txt")) {
      let arr = shapePts.get(s.shape_id!);
      if (!arr) shapePts.set(s.shape_id!, (arr = []));
      arr.push({ seq: Number(s.shape_pt_sequence), p: [Number(s.shape_pt_lat), Number(s.shape_pt_lon)] });
    }
    const shapes = new Map<string, LatLon[]>();
    for (const [id, pts] of shapePts) shapes.set(id, pts.sort((a, b) => a.seq - b.seq).map((x) => x.p));

    // --- Parcours types (patterns), index par arrêt, lignes par station
    const stationLines = new Map<string, Set<string>>();
    for (const trip of this.trips.values()) {
      const stopIds = trip.stopTimes.map((s) => s.stopId);
      const key = `${trip.routeId}|${trip.directionId}|${trip.shapeId}|${stopIds.join(",")}`;
      trip.patternKey = key;
      let p = this.patterns.get(key);
      if (!p) {
        const stopPts = stopIds.map((id) => this.stopLatLon(id));
        const shape = shapes.get(trip.shapeId);
        const polyline = new Polyline(shape && shape.length > 1 ? shape : stopPts);
        p = {
          key,
          routeId: trip.routeId,
          directionId: trip.directionId,
          headsign: trip.headsign || this.stops.get(stopIds[stopIds.length - 1]!)?.name || "",
          stopIds,
          tripIds: [],
          polyline,
          stopDistances: polyline.projectSequence(stopPts),
        };
        this.patterns.set(key, p);
      }
      p.tripIds.push(trip.id);

      trip.stopTimes.forEach((st, idx) => {
        let list = this.stopIndex.get(st.stopId);
        if (!list) this.stopIndex.set(st.stopId, (list = []));
        list.push({ trip, idx });
        const stationId = this.stops.get(st.stopId)!.stationId;
        let set = stationLines.get(stationId);
        if (!set) stationLines.set(stationId, (set = new Set()));
        set.add(trip.routeId);
      });
    }
    for (const st of this.stations.values()) {
      st.lineIds = this.sortLineIds([...(stationLines.get(st.id) ?? [])]);
    }
    // Les stations sans aucune desserte n'ont pas d'intérêt pour l'usager
    for (const [id, st] of this.stations) if (st.lineIds.length === 0) this.stations.delete(id);

    // --- Méta
    const fi = f("feed_info.txt")[0];
    this.feed = { version: fi?.feed_version || null, start: fi?.feed_start_date || null, end: fi?.feed_end_date || null };
    let minLat = 90, minLon = 180, maxLat = -90, maxLon = -180;
    for (const s of this.stations.values()) {
      minLat = Math.min(minLat, s.lat); maxLat = Math.max(maxLat, s.lat);
      minLon = Math.min(minLon, s.lon); maxLon = Math.max(maxLon, s.lon);
    }
    this.bounds = [[minLat, minLon], [maxLat, maxLon]];
  }

  private buildStations(): void {
    // Regroupement initial par station parente
    const groups = new Map<string, Stop[]>();
    for (const stop of this.stops.values()) {
      let g = groups.get(stop.stationId);
      if (!g) groups.set(stop.stationId, (g = []));
      g.push(stop);
    }
    // Fusion des groupes homonymes proches (union-find)
    // Les identifiants de stations parentes (plus stables) passent devant ceux de quais isolés
    const isParent = (id: string) => groups.get(id)!.some((s) => s.id !== id);
    const ids = [...groups.keys()].sort((a, b) => Number(isParent(b)) - Number(isParent(a)) || a.localeCompare(b));
    const root = new Map(ids.map((id) => [id, id]));
    const find = (id: string): string => {
      let r = id;
      while (root.get(r) !== r) r = root.get(r)!;
      root.set(id, r);
      return r;
    };
    const center = (g: Stop[]): LatLon => [g.reduce((a, s) => a + s.lat, 0) / g.length, g.reduce((a, s) => a + s.lon, 0) / g.length];
    const byName = new Map<string, string[]>();
    for (const id of ids) {
      const s = groups.get(id)![0]!;
      const key = `${normalize(s.name)}|${normalize(s.city)}`;
      let l = byName.get(key);
      if (!l) byName.set(key, (l = []));
      l.push(id);
    }
    for (const same of byName.values()) {
      for (let i = 0; i < same.length; i++) {
        for (let j = i + 1; j < same.length; j++) {
          if (haversine(center(groups.get(same[i]!)!), center(groups.get(same[j]!)!)) <= STATION_MERGE_RADIUS) {
            const a = find(same[i]!), b = find(same[j]!);
            if (a !== b) root.set(b, a);
          }
        }
      }
    }
    for (const id of ids) {
      const stationId = find(id);
      for (const stop of groups.get(id)!) {
        stop.stationId = stationId;
        let st = this.stations.get(stationId);
        if (!st) {
          st = { id: stationId, name: stop.name, city: stop.city, lat: 0, lon: 0, wheelchair: false, lineIds: [], platformIds: [] };
          this.stations.set(stationId, st);
        }
        st.platformIds.push(stop.id);
        st.wheelchair ||= stop.wheelchair;
      }
    }
    for (const st of this.stations.values()) {
      const [lat, lon] = center(st.platformIds.map((id) => this.stops.get(id)!));
      st.lat = Math.round(lat * 1e6) / 1e6;
      st.lon = Math.round(lon * 1e6) / 1e6;
    }
  }

  stopLatLon(id: string): LatLon {
    const s = this.stops.get(id);
    return s ? [s.lat, s.lon] : [0, 0];
  }

  stopRef(id: string): StopRef {
    const s = this.stops.get(id);
    return { id, name: s?.name ?? id, lat: s?.lat ?? 0, lon: s?.lon ?? 0 };
  }

  /** Tri naturel des lignes : 1, 2, 10, A, B… */
  sortLineIds(ids: string[]): string[] {
    const name = (id: string) => this.lines.get(id)?.shortName ?? id;
    return ids.sort((a, b) => name(a).localeCompare(name(b), "fr", { numeric: true }));
  }

  sortedLines(): Line[] {
    return this.sortLineIds([...this.lines.keys()])
      .map((id) => this.lines.get(id)!)
      .filter((l) => this.linePatterns(l.id).length > 0);
  }

  isServiceActive(serviceId: string, date: ServiceDate): boolean {
    const ex = this.exceptions.get(serviceId)?.get(date);
    if (ex !== undefined) return ex;
    const c = this.calendars.get(serviceId);
    if (!c || date < c.start || date > c.end) return false;
    return c.days[weekdayOf(date)] ?? false;
  }

  activeServices(date: ServiceDate): Set<string> {
    let set = this.activeCache.get(date);
    if (!set) {
      set = new Set();
      const ids = new Set([...this.calendars.keys(), ...this.exceptions.keys()]);
      for (const id of ids) if (this.isServiceActive(id, date)) set.add(id);
      if (this.activeCache.size > 30) this.activeCache.clear();
      this.activeCache.set(date, set);
    }
    return set;
  }

  /** Parcours d'une ligne, du plus fréquent au moins fréquent. */
  linePatterns(routeId: string): Pattern[] {
    return [...this.patterns.values()]
      .filter((p) => p.routeId === routeId)
      .sort((a, b) => a.directionId - b.directionId || b.tripIds.length - a.tripIds.length);
  }

  toLinePattern(p: Pattern): LinePattern {
    return {
      directionId: p.directionId,
      headsign: p.headsign,
      stops: p.stopIds.map((id) => this.stopRef(id)),
      shape: simplify(p.polyline.points, 0.00003),
      tripCount: p.tripIds.length,
    };
  }
}

/** Interpole les horaires manquants entre deux points de passage connus. */
function interpolateMissingTimes(sts: StopTime[]): void {
  let last = -1;
  for (let i = 0; i < sts.length; i++) {
    if (Number.isNaN(sts[i]!.dep)) continue;
    if (last >= 0 && i - last > 1) {
      const a = sts[last]!.dep;
      const b = sts[i]!.arr;
      for (let k = last + 1; k < i; k++) {
        const t = Math.round(a + ((b - a) * (k - last)) / (i - last));
        sts[k]!.arr = sts[k]!.dep = t;
      }
    }
    last = i;
  }
}

/** Simplification Douglas-Peucker (tolérance en degrés) pour alléger les tracés envoyés au front. */
export function simplify(points: LatLon[], tol: number): LatLon[] {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    const a = points[s]!, b = points[e]!;
    const dx = b[1] - a[1], dy = b[0] - a[0];
    const len = Math.hypot(dx, dy) || 1e-12;
    let maxD = 0, idx = -1;
    for (let i = s + 1; i < e; i++) {
      const p = points[i]!;
      const d = Math.abs(dy * (p[1] - a[1]) - dx * (p[0] - a[0])) / len;
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > tol && idx > 0) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return points.filter((_, i) => keep[i]);
}
