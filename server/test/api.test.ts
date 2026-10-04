import { afterAll, describe, expect, it } from "vitest";
import type { DeparturesResponse, LineDetail, TimetableResponse, VehiclesResponse } from "@bus-hub/shared";
import { buildApp } from "../src/api.ts";
import { AlertsService } from "../src/realtime/alerts.ts";
import { OfficialSiteService } from "../src/realtime/official.ts";
import { SiriClient } from "../src/realtime/siri.ts";
import { fixtureStore, paris } from "./fixture.ts";

const store = fixtureStore();
const siri = new SiriClient();
// Désactive tout appel réseau pendant les tests
siri.stopMonitoring = async () => null;
const official = new OfficialSiteService();
official.ensureFresh = async () => {};
Object.defineProperty(official, "currentPosts", {
  get: () => [{ title: "Ligne 1 déviée", url: "https://lignes-agglo.fr/infostrafic/x/", publishedAt: null, lineCodes: ["1", "9"], description: "Travaux" }],
});

const app = await buildApp({
  store: () => store,
  loadedAt: () => new Date(0),
  siri,
  alerts: new AlertsService(),
  official,
  now: () => paris("07:55"),
});
afterAll(() => app.close());

const get = async <T>(url: string) => {
  const res = await app.inject({ method: "GET", url });
  return { status: res.statusCode, body: res.json() as T };
};

describe("API", () => {
  it("GET /api/lines", async () => {
    const { body } = await get<{ shortName: string }[]>("/api/lines");
    expect(body.map((l) => l.shortName)).toEqual(["01", "2"]);
  });

  it("GET /api/shapes renvoie un tracé par sens", async () => {
    const { body } = await get<{ lineId: string; paths: unknown[] }[]>("/api/shapes");
    expect(body.map((x) => [x.lineId, x.paths.length])).toEqual([
      ["AUB-01", 2],
      ["AUB-02", 1],
    ]);
  });

  it("GET /api/lines/:id renvoie parcours et tracés", async () => {
    const { body } = await get<LineDetail>("/api/lines/AUB-01");
    expect(body.patterns[0]!.stops.map((s) => s.name)).toEqual(["Gare", "Centre", "Paluds"]);
    expect(body.patterns[0]!.shape.length).toBeGreaterThanOrEqual(2);
  });

  it("GET /api/lines/:id/timetable valide la date", async () => {
    expect((await get("/api/lines/AUB-01/timetable?date=05-10-2026")).status).toBe(400);
    const { body } = await get<TimetableResponse>("/api/lines/AUB-01/timetable?date=2026-10-05&direction=0");
    expect(body.trips).toHaveLength(3);
  });

  it("GET /api/stations/:id/departures", async () => {
    const { body } = await get<DeparturesResponse>("/api/stations/AUB-P1/departures?limit=2");
    expect(body.departures.map((d) => [d.lineShortName, d.headsign, d.source])).toEqual([
      ["01", "Paluds", "scheduled"],
      ["01", "Paluds", "scheduled"],
    ]);
    expect(body.realtime.state).toBe("disabled");
  });

  it("GET /api/stations?q= et /nearby", async () => {
    expect((await get<unknown[]>("/api/stations?q=centre")).body).toHaveLength(1);
    expect((await get("/api/stations/nearby")).status).toBe(400);
  });

  it("GET /api/vehicles", async () => {
    const { body } = await get<VehiclesResponse>("/api/vehicles");
    expect(body.vehicles.map((v) => v.tripId)).toEqual([]); // 07:55 : la 300 est terminée, la 100 pas partie
  });

  it("GET /api/alerts place l'info trafic officielle en premier, rattachée aux lignes", async () => {
    const { body } = await get<{ alerts: { scope: string; lineIds: string[] }[] }>("/api/alerts");
    expect(body.alerts[0]).toMatchObject({ scope: "official", lineIds: ["AUB-01"] }); // « 1 » → ligne « 01 », « 9 » inconnue
  });

  it("GET /api/official renvoie liens et contact", async () => {
    const { body } = await get<{ links: unknown[]; contact: { phone: string } }>("/api/official");
    expect(body.links.length).toBeGreaterThan(5);
    expect(body.contact.phone).toBe("04 42 03 24 25");
  });

  it("404 propres", async () => {
    expect((await get("/api/lines/NOPE")).status).toBe(404);
    expect((await get("/api/stations/NOPE/departures")).status).toBe(404);
  });
});
