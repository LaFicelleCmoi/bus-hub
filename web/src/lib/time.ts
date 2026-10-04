const TZ = "Europe/Paris";

const hm = new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" });
const dateTimeFmt = new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const isoDay = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });

export const formatTime = (iso: string | number) => hm.format(new Date(iso));
export const formatDay = (iso: string | number) => dayFmt.format(new Date(iso));
export const formatDateTime = (iso: string | number) => dateTimeFmt.format(new Date(iso));

/** Date du jour à Paris au format AAAA-MM-JJ */
export const todayIso = (now = Date.now()) => isoDay.format(new Date(now));

export function addDaysIso(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y!, m! - 1, d! + n));
  return t.toISOString().slice(0, 10);
}

/** "AAAAMMJJ" → Date lisible */
export const gtfsDateLabel = (d: string | null) => (d ? `${d.slice(6, 8)}/${d.slice(4, 6)}/${d.slice(0, 4)}` : "?");

/** Libellé d'attente : « à l'approche », « 4 min », ou l'heure au-delà d'une heure. */
export function waitLabel(iso: string, now: number): { main: string; unit: string; imminent: boolean } {
  const mins = Math.floor((Date.parse(iso) - now) / 60_000);
  if (mins <= 0) return { main: "À l'approche", unit: "", imminent: true };
  if (mins < 60) return { main: String(mins), unit: "min", imminent: mins <= 2 };
  return { main: formatTime(iso), unit: "", imminent: false };
}

export function delayLabel(seconds: number | null): string | null {
  if (seconds === null) return null;
  const m = Math.round(seconds / 60);
  if (m === 0) return "à l'heure";
  return m > 0 ? `+${m} min` : `${m} min`;
}

export function distanceLabel(m: number): string {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1).replace(".", ",")} km`;
}
