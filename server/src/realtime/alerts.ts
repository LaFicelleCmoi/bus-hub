import GtfsRealtimeBindings from "gtfs-realtime-bindings";
import type { Alert, AlertsResponse, RealtimeState } from "@bus-hub/shared";
import { config } from "../config.ts";

const { transit_realtime } = GtfsRealtimeBindings;
type FeedMessage = ReturnType<typeof transit_realtime.FeedMessage.decode>;

type Translated = { translation?: { text?: string | null; language?: string | null }[] | null } | null | undefined;

const tr = (t: Translated): string => {
  const list = t?.translation ?? [];
  return (list.find((x) => x.language === "fr") ?? list[0])?.text ?? "";
};

const enumName = (e: Record<string, unknown>, v: unknown): string | null => {
  if (v == null) return null;
  if (typeof v === "string") return v;
  const name = Object.entries(e).find(([, n]) => n === v)?.[0];
  return name ?? null;
};

const toNum = (v: unknown): number | null => {
  if (v == null) return null;
  const n = Number(typeof v === "object" ? String(v) : v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Convertit un flux GTFS-RT Service Alerts en alertes du réseau d'Aubagne (et alentours). */
export function mapAlerts(feed: FeedMessage, now = Date.now()): Alert[] {
  const prefix = config.gtfs.networkPrefix;
  const keywords = config.alerts.keywords.map((k) => k.toLowerCase());
  const out: Alert[] = [];

  for (const e of feed.entity) {
    const a = e.alert;
    if (!a) continue;
    const informed = a.informedEntity ?? [];
    const routeIds = informed.map((i) => i.routeId ?? "").filter(Boolean);
    const stopIds = informed.map((i) => i.stopId ?? "").filter(Boolean);
    const header = tr(a.headerText);
    const description = tr(a.descriptionText);

    const isNetwork =
      routeIds.some((r) => r.startsWith(prefix)) ||
      stopIds.some((s) => s.startsWith(prefix)) ||
      informed.some((i) => i.agencyId && `${i.agencyId}-` === prefix);
    const haystack = `${header}\n${description}`.toLowerCase();
    const isNearby = !isNetwork && keywords.some((k) => haystack.includes(k.toLowerCase()));
    if (!isNetwork && !isNearby) continue;

    const periods = (a.activePeriod ?? []).map((p) => ({ start: toNum(p.start), end: toNum(p.end) }));
    const nowS = now / 1000;
    const isActive = periods.length === 0 || periods.some((p) => (p.start ?? 0) <= nowS && (p.end ?? Infinity) >= nowS);

    out.push({
      id: e.id,
      scope: isNetwork ? "network" : "nearby",
      header,
      description,
      cause: enumName(transit_realtime.Alert.Cause as unknown as Record<string, unknown>, a.cause),
      effect: enumName(transit_realtime.Alert.Effect as unknown as Record<string, unknown>, a.effect),
      url: tr(a.url) || null,
      lineIds: routeIds.filter((r) => r.startsWith(prefix)),
      stopIds: stopIds.filter((s) => s.startsWith(prefix)),
      activePeriods: periods.map((p) => ({
        start: p.start ? new Date(p.start * 1000).toISOString() : null,
        end: p.end ? new Date(p.end * 1000).toISOString() : null,
      })),
      isActive,
    });
  }

  return out.sort((x, y) => Number(y.isActive) - Number(x.isActive) || (x.scope === y.scope ? 0 : x.scope === "network" ? -1 : 1));
}

export class AlertsService {
  private alerts: Alert[] = [];
  private fetchedAt: string | null = null;
  private error: string | null = null;
  private timer: NodeJS.Timeout | null = null;

  get state(): RealtimeState {
    return this.error ? (this.fetchedAt ? "degraded" : "unavailable") : this.fetchedAt ? "ok" : "degraded";
  }

  get lastFetch(): string | null {
    return this.fetchedAt;
  }

  async refresh(): Promise<void> {
    try {
      const res = await fetch(config.alerts.url, { signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const feed = transit_realtime.FeedMessage.decode(new Uint8Array(await res.arrayBuffer()));
      this.alerts = mapAlerts(feed);
      this.fetchedAt = new Date().toISOString();
      this.error = null;
    } catch (e) {
      this.error = `Flux d'alertes indisponible : ${(e as Error).message}`;
    }
  }

  start(): void {
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), config.alerts.refreshMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  response(): AlertsResponse {
    return { alerts: this.alerts, fetchedAt: this.fetchedAt, error: this.error };
  }

  forLine(lineId: string): Alert[] {
    return this.alerts.filter((a) => a.lineIds.includes(lineId));
  }
}
