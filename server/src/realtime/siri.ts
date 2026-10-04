import { randomUUID } from "node:crypto";
import { XMLParser } from "fast-xml-parser";
import type { RealtimeInfo, RealtimeState } from "@bus-hub/shared";
import { config } from "../config.ts";
import { RateLimiter } from "./rateLimiter.ts";

/**
 * Client SIRI (SOAP) pour le flux temps réel de la Métropole AMP.
 *
 * Constat au 04/10/2026 sur AUB_TPE (serveur Navineo) avec RequestorRef « open-data » :
 *  - CheckStatus répond normalement ;
 *  - GetStopMonitoring / GetEstimatedTimetable / GetGeneralMessage renvoient une erreur serveur ;
 *  - GetVehicleMonitoring exige un VehicleRef (pas de liste globale des bus) ;
 *  - LinesDiscovery / StopPointsDiscovery expirent côté serveur.
 * Le client tente donc StopMonitoring, et se met en retrait (backoff) en cas d'échec pour
 * préserver le quota de 10-20 req/min. Dès que le flux fonctionnera, le temps réel apparaîtra
 * automatiquement dans le hub.
 */

export interface SiriStopVisit {
  lineRef: string;
  directionRef: string;
  destination: string;
  journeyRef: string;
  stopPointRef: string;
  aimedDeparture: string | null;
  expectedDeparture: string | null;
  aimedArrival: string | null;
  expectedArrival: string | null;
  vehicleRef: string | null;
  location: { lat: number; lon: number } | null;
  bearing: number | null;
}

const parser = new XMLParser({
  removeNSPrefix: true,
  ignoreAttributes: true,
  parseTagValue: false,
  isArray: (name) => name === "MonitoredStopVisit",
});

/** Recherche récursive de toutes les occurrences d'une clé dans l'arbre XML parsé. */
function findAll(node: unknown, key: string, out: unknown[] = []): unknown[] {
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (k === key) Array.isArray(v) ? out.push(...v) : out.push(v);
      else findAll(v, key, out);
    }
  }
  return out;
}

const text = (v: unknown): string => {
  if (v == null) return "";
  if (typeof v === "object") return text((v as Record<string, unknown>)["#text"] ?? Object.values(v)[0]);
  return String(v);
};

export function parseStopMonitoring(xml: string): SiriStopVisit[] {
  const doc = parser.parse(xml);
  const fault = findAll(doc, "faultstring")[0];
  if (fault) throw new Error(`SIRI fault : ${text(fault)}`);
  const err = findAll(doc, "ErrorText")[0];
  if (err) throw new Error(`SIRI erreur : ${text(err)}`);

  return findAll(doc, "MonitoredStopVisit").map((v) => {
    const mvj = ((v as Record<string, unknown>).MonitoredVehicleJourney ?? {}) as Record<string, any>;
    const call = (mvj.MonitoredCall ?? {}) as Record<string, unknown>;
    const loc = mvj.VehicleLocation as Record<string, unknown> | undefined;
    const lat = Number(text(loc?.Latitude));
    const lon = Number(text(loc?.Longitude));
    const opt = (x: unknown) => text(x) || null;
    return {
      lineRef: text(mvj.LineRef),
      directionRef: text(mvj.DirectionRef),
      destination: text(mvj.DestinationName),
      journeyRef: text(mvj.FramedVehicleJourneyRef?.DatedVehicleJourneyRef ?? mvj.VehicleJourneyRef),
      stopPointRef: text(call.StopPointRef),
      aimedDeparture: opt(call.AimedDepartureTime),
      expectedDeparture: opt(call.ExpectedDepartureTime),
      aimedArrival: opt(call.AimedArrivalTime),
      expectedArrival: opt(call.ExpectedArrivalTime),
      vehicleRef: opt(mvj.VehicleRef),
      location: Number.isFinite(lat) && Number.isFinite(lon) && lat !== 0 ? { lat, lon } : null,
      bearing: mvj.Bearing != null && text(mvj.Bearing) !== "" ? Number(text(mvj.Bearing)) : null,
    };
  });
}

const escapeXml = (s: string) => s.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);

function envelope(operation: string, inner: string, withServiceInfo: boolean): string {
  const ts = new Date().toISOString();
  const id = `bus-hub:${randomUUID()}`;
  const req = escapeXml(config.siri.requestorRef);
  const head = `<siri:RequestTimestamp>${ts}</siri:RequestTimestamp>`;
  const body = withServiceInfo
    ? `<ServiceRequestInfo>${head}<siri:RequestorRef>${req}</siri:RequestorRef><siri:MessageIdentifier>${id}</siri:MessageIdentifier></ServiceRequestInfo>` +
      `<Request>${head}<siri:MessageIdentifier>${id}</siri:MessageIdentifier>${inner}</Request>`
    : `<Request>${head}<siri:RequestorRef>${req}</siri:RequestorRef><siri:MessageIdentifier>${id}</siri:MessageIdentifier></Request>`;
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/"><S:Body>` +
    `<sw:${operation} xmlns:sw="http://wsdl.siri.org.uk" xmlns:siri="http://www.siri.org.uk/siri">${body}<RequestExtension/></sw:${operation}>` +
    `</S:Body></S:Envelope>`
  );
}

export class SiriClient {
  private readonly limiter = new RateLimiter(config.siri.maxRequestsPerMinute);
  private readonly smCache = new Map<string, { at: number; visits: SiriStopVisit[] }>();
  private readonly inflight = new Map<string, Promise<SiriStopVisit[] | null>>();

  private serverState: RealtimeState = config.siri.enabled ? "degraded" : "disabled";
  private serverMessage = config.siri.enabled ? "Vérification du flux SIRI en cours" : "Temps réel désactivé";
  private checkedAt: string | null = null;

  smState: RealtimeState = config.siri.enabled ? "degraded" : "disabled";
  private smBackoffUntil = 0;
  private smLastError: string | null = null;

  private async post(operation: string, xml: string): Promise<string> {
    if (!this.limiter.tryTake()) throw new Error("Quota SIRI local atteint, requête différée");
    const res = await fetch(config.siri.endpoint, {
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: operation },
      body: xml,
      signal: AbortSignal.timeout(config.siri.timeoutMs),
    });
    const body = await res.text();
    if (!res.ok && !body.includes("Envelope")) throw new Error(`SIRI HTTP ${res.status}`);
    return body;
  }

  async checkStatus(): Promise<void> {
    if (!config.siri.enabled) return;
    try {
      const xml = await this.post("CheckStatus", envelope("CheckStatus", "", false));
      const ok = /<(?:\w+:)?Status>\s*true\s*</.test(xml);
      this.serverState = ok ? "ok" : "unavailable";
      this.serverMessage = ok ? "Serveur SIRI joignable" : "Le serveur SIRI signale un dysfonctionnement";
    } catch (e) {
      this.serverState = "unavailable";
      this.serverMessage = `Serveur SIRI injoignable : ${(e as Error).message}`;
    }
    this.checkedAt = new Date().toISOString();
  }

  info(): RealtimeInfo & { stopMonitoring: RealtimeState; quotaPerMinute: number } {
    let state = this.serverState;
    let message = this.serverMessage;
    if (state === "ok" && this.smState !== "ok") {
      state = "degraded";
      message = `Serveur SIRI joignable, mais les prochains passages en temps réel ne sont pas fournis${this.smLastError ? ` (${this.smLastError})` : ""}. Horaires théoriques affichés.`;
    }
    return { state, message, checkedAt: this.checkedAt, stopMonitoring: this.smState, quotaPerMinute: config.siri.maxRequestsPerMinute };
  }

  monitoringRef(stop: { id: string; code: string }): string {
    const bare = stop.id.startsWith(config.gtfs.networkPrefix) ? stop.id.slice(config.gtfs.networkPrefix.length) : stop.id;
    return config.siri.stopRefTemplate.replaceAll("{id}", bare).replaceAll("{code}", stop.code || bare);
  }

  /**
   * Prochains passages temps réel à un arrêt. Retourne `null` si le temps réel n'est pas
   * disponible (backoff, quota, erreur) : l'appelant affiche alors l'horaire théorique.
   */
  async stopMonitoring(ref: string): Promise<SiriStopVisit[] | null> {
    if (!config.siri.enabled) return null;
    const cached = this.smCache.get(ref);
    if (cached && Date.now() - cached.at < config.siri.stopMonitoringTtlMs) return cached.visits;
    if (Date.now() < this.smBackoffUntil) return cached?.visits ?? null;

    let p = this.inflight.get(ref);
    if (!p) {
      p = this.fetchStopMonitoring(ref).finally(() => this.inflight.delete(ref));
      this.inflight.set(ref, p);
    }
    return p;
  }

  private async fetchStopMonitoring(ref: string): Promise<SiriStopVisit[] | null> {
    const inner = `<siri:MonitoringRef>${escapeXml(ref)}</siri:MonitoringRef><siri:StopVisitTypes>all</siri:StopVisitTypes>`;
    try {
      const xml = await this.post("GetStopMonitoring", envelope("GetStopMonitoring", inner, true));
      const visits = parseStopMonitoring(xml);
      this.smState = "ok";
      this.smLastError = null;
      this.smCache.set(ref, { at: Date.now(), visits });
      if (this.smCache.size > 2000) this.smCache.clear();
      return visits;
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.startsWith("Quota")) return this.smCache.get(ref)?.visits ?? null;
      this.smState = "unavailable";
      this.smLastError = msg.length > 140 ? `${msg.slice(0, 140)}…` : msg;
      this.smBackoffUntil = Date.now() + config.siri.backoffMs;
      return null;
    }
  }
}
