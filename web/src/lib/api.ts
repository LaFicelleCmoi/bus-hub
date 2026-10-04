import { useQuery, keepPreviousData } from "@tanstack/react-query";
import type {
  AlertsResponse,
  DeparturesResponse,
  Line,
  LineDetail,
  MetaResponse,
  NearbyStation,
  NetworkShape,
  OfficialResponse,
  Station,
  TimetableResponse,
  VehiclesResponse,
} from "@bus-hub/shared";

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    // Notre API renvoie { error: "texte" } ; la plateforme Vercel { error: { code, message } }
    const err = body?.error;
    const detail = typeof err === "string" ? err : typeof err?.message === "string" ? err.message : null;
    throw new ApiError(res.status, detail ?? (res.status >= 500 ? `Le serveur est indisponible (erreur ${res.status}).` : `Erreur ${res.status}`));
  }
  return res.json() as Promise<T>;
}

const STATIC = { staleTime: 10 * 60_000 };
const enc = encodeURIComponent;

export const useMeta = () => useQuery({ queryKey: ["meta"], queryFn: () => get<MetaResponse>("/meta"), refetchInterval: 60_000 });

export const useLines = () => useQuery({ queryKey: ["lines"], queryFn: () => get<Line[]>("/lines"), ...STATIC });

export const useLine = (id: string) => useQuery({ queryKey: ["line", id], queryFn: () => get<LineDetail>(`/lines/${enc(id)}`), ...STATIC });

export const useShapes = () => useQuery({ queryKey: ["shapes"], queryFn: () => get<NetworkShape[]>("/shapes"), ...STATIC });

export const useTimetable = (id: string, date: string, direction: number) =>
  useQuery({
    queryKey: ["timetable", id, date, direction],
    queryFn: () => get<TimetableResponse>(`/lines/${enc(id)}/timetable?date=${date}&direction=${direction}`),
    placeholderData: keepPreviousData,
    ...STATIC,
  });

export const useStations = () => useQuery({ queryKey: ["stations"], queryFn: () => get<Station[]>("/stations"), ...STATIC });

export const useStation = (id: string) => useQuery({ queryKey: ["station", id], queryFn: () => get<Station>(`/stations/${enc(id)}`), ...STATIC });

export const useStationSearch = (q: string) =>
  useQuery({
    queryKey: ["search", q],
    queryFn: () => get<Station[]>(`/stations?q=${enc(q)}`),
    enabled: q.trim().length >= 2,
    placeholderData: keepPreviousData,
    ...STATIC,
  });

export const useNearby = (pos: { lat: number; lon: number } | null) =>
  useQuery({
    queryKey: ["nearby", pos?.lat.toFixed(4), pos?.lon.toFixed(4)],
    queryFn: () => get<NearbyStation[]>(`/stations/nearby?lat=${pos!.lat}&lon=${pos!.lon}&radius=1000`),
    enabled: pos !== null,
  });

export const useDepartures = (id: string, limit = 20) =>
  useQuery({
    queryKey: ["departures", id, limit],
    queryFn: () => get<DeparturesResponse>(`/stations/${enc(id)}/departures?limit=${limit}`),
    refetchInterval: 30_000,
    placeholderData: keepPreviousData,
  });

export const useVehicles = (lineId?: string) =>
  useQuery({
    queryKey: ["vehicles", lineId ?? "all"],
    queryFn: () => get<VehiclesResponse>(`/vehicles${lineId ? `?line=${enc(lineId)}` : ""}`),
    refetchInterval: 10_000,
    placeholderData: keepPreviousData,
  });

export const useAlerts = () => useQuery({ queryKey: ["alerts"], queryFn: () => get<AlertsResponse>("/alerts"), refetchInterval: 120_000 });

export const useOfficial = () => useQuery({ queryKey: ["official"], queryFn: () => get<OfficialResponse>("/official"), staleTime: 10 * 60_000 });
