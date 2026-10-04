import { config } from "../config.ts";

/** Date de service au format GTFS : "YYYYMMDD" */
export type ServiceDate = string;

const partsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: config.timezone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function zonedParts(ms: number) {
  const p: Record<string, number> = {};
  for (const { type, value } of partsFormatter.formatToParts(new Date(ms))) {
    if (type !== "literal") p[type] = Number(value);
  }
  return p as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}

/** Décalage (ms) entre l'heure locale du fuseau du réseau et UTC à l'instant donné. */
function offsetAt(ms: number): number {
  const p = zonedParts(ms);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** Convertit une heure locale (fuseau du réseau) en timestamp UTC. */
export function zonedToEpoch(y: number, m: number, d: number, h = 0, mi = 0, s = 0): number {
  const guess = Date.UTC(y, m - 1, d, h, mi, s);
  const first = guess - offsetAt(guess);
  // Second passage pour les instants proches d'un changement d'heure
  return guess - offsetAt(first);
}

export function parseServiceDate(date: ServiceDate): { y: number; m: number; d: number } {
  return { y: Number(date.slice(0, 4)), m: Number(date.slice(4, 6)), d: Number(date.slice(6, 8)) };
}

/**
 * Origine du jour de service GTFS : « midi moins 12 h » en heure locale.
 * Les horaires GTFS (y compris > 24:00:00) se comptent depuis cet instant,
 * ce qui reste juste les jours de changement d'heure.
 */
export function serviceDayOrigin(date: ServiceDate): number {
  const { y, m, d } = parseServiceDate(date);
  return zonedToEpoch(y, m, d, 12) - 12 * 3600_000;
}

export function serviceDateOf(ms: number): ServiceDate {
  const p = zonedParts(ms);
  return `${p.year}${String(p.month).padStart(2, "0")}${String(p.day).padStart(2, "0")}`;
}

export function addDays(date: ServiceDate, n: number): ServiceDate {
  const { y, m, d } = parseServiceDate(date);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}${String(t.getUTCMonth() + 1).padStart(2, "0")}${String(t.getUTCDate()).padStart(2, "0")}`;
}

/** 0 = lundi … 6 = dimanche */
export function weekdayOf(date: ServiceDate): number {
  const { y, m, d } = parseServiceDate(date);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/** "25:10:00" → 90600 secondes. Retourne NaN si le champ est vide. */
export function parseGtfsTime(t: string): number {
  if (!t) return NaN;
  const [h, m, s] = t.split(":").map(Number);
  return (h ?? 0) * 3600 + (m ?? 0) * 60 + (s ?? 0);
}

export function formatGtfsTime(sec: number): string {
  const h = Math.floor(sec / 3600) % 24;
  const m = Math.floor((sec % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "2026-10-04" → "20261004" */
export function isoToServiceDate(iso: string): ServiceDate | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.replaceAll("-", "") : null;
}

export function serviceDateToIso(date: ServiceDate): string {
  return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
}
