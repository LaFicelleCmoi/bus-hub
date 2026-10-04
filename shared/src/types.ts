// Types partagés entre l'API (server) et le front (web).

export type LatLon = [lat: number, lon: number];

export interface Line {
  id: string;
  shortName: string;
  longName: string;
  color: string; // "#RRGGBB"
  textColor: string;
  type: number; // route_type GTFS
  directions: string[]; // libellés des sens 0 et 1
}

export interface LinePattern {
  directionId: number;
  headsign: string;
  stops: StopRef[];
  shape: LatLon[];
  tripCount: number;
}

export interface LineDetail extends Line {
  patterns: LinePattern[];
}

export interface NetworkShape {
  lineId: string;
  color: string;
  /** Tracé du parcours principal de chaque sens */
  paths: LatLon[][];
}

export interface StopRef {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

/** Une « station » regroupe les quais (stop_id) d'un même arrêt. */
export interface Station {
  id: string;
  name: string;
  city: string;
  lat: number;
  lon: number;
  wheelchair: boolean;
  lineIds: string[];
  platformIds: string[];
}

export interface NearbyStation extends Station {
  distance: number; // mètres
}

export type DepartureSource = "realtime" | "scheduled";

export interface Departure {
  tripId: string;
  lineId: string;
  lineShortName: string;
  lineColor: string;
  lineTextColor: string;
  headsign: string;
  stopId: string;
  /** Heure théorique (ISO) */
  aimed: string;
  /** Heure prévue en temps réel (ISO), si connue */
  expected: string | null;
  delaySeconds: number | null;
  source: DepartureSource;
  isTerminus: boolean;
}

export interface DeparturesResponse {
  station: Station;
  departures: Departure[];
  realtime: RealtimeInfo;
  generatedAt: string;
}

export interface Vehicle {
  tripId: string;
  lineId: string;
  lineShortName: string;
  lineColor: string;
  lineTextColor: string;
  headsign: string;
  directionId: number;
  lat: number;
  lon: number;
  bearing: number | null;
  /** "estimated" : position calculée depuis les horaires théoriques */
  source: "gps" | "estimated";
  nextStopName: string | null;
  nextStopAt: string | null;
  progress: number; // 0..1 sur la course
}

export interface VehiclesResponse {
  vehicles: Vehicle[];
  generatedAt: string;
}

export interface TimetableResponse {
  lineId: string;
  date: string; // YYYY-MM-DD
  directionId: number;
  headsign: string;
  stops: StopRef[];
  /** Une ligne par course, une colonne par arrêt ("HH:MM" ou null si non desservi) */
  trips: { tripId: string; times: (string | null)[] }[];
}

export type AlertScope = "network" | "nearby";

export interface Alert {
  id: string;
  scope: AlertScope;
  header: string;
  description: string;
  cause: string | null;
  effect: string | null;
  url: string | null;
  lineIds: string[];
  stopIds: string[];
  activePeriods: { start: string | null; end: string | null }[];
  isActive: boolean;
}

export interface AlertsResponse {
  alerts: Alert[];
  fetchedAt: string | null;
  error: string | null;
}

export type RealtimeState = "ok" | "degraded" | "unavailable" | "disabled";

export interface RealtimeInfo {
  state: RealtimeState;
  message: string;
  checkedAt: string | null;
}

export interface MetaResponse {
  network: string;
  feedVersion: string | null;
  feedStart: string | null;
  feedEnd: string | null;
  loadedAt: string;
  counts: { lines: number; stations: number; trips: number };
  bounds: [LatLon, LatLon];
  realtime: {
    siri: RealtimeInfo & { stopMonitoring: RealtimeState; quotaPerMinute: number };
    alerts: { state: RealtimeState; fetchedAt: string | null };
  };
  sources: { name: string; url: string; license: string }[];
}
