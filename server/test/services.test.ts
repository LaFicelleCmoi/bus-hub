import { describe, expect, it } from "vitest";
import type { Departure } from "@bus-hub/shared";
import { matchVisit, scheduledDepartures } from "../src/services/departures.ts";
import { nearbyStations, searchStations } from "../src/services/stations.ts";
import { getTimetable, mergeStopSequences } from "../src/services/timetable.ts";
import { estimateVehicles, GpsCache } from "../src/services/vehicles.ts";
import type { SiriStopVisit } from "../src/realtime/siri.ts";
import { fixtureStore, paris } from "./fixture.ts";

const store = fixtureStore();

describe("départs théoriques", () => {
  it("liste les départs à venir sur tous les quais, sans les terminus", () => {
    const deps = scheduledDepartures(store, ["AUB-G1", "AUB-G2"], paris("06:00"), paris("12:00"));
    expect(deps.map((d) => d.trip.id)).toEqual(["AUB-300", "AUB-100", "AUB-101"]); // AUB-200 termine à G2
  });

  it("retrouve les courses de la veille après minuit (horaires > 24:00)", () => {
    // Mardi 6/10 à 00:55 → course du lundi 5/10 qui passe au Centre à 25:00
    const deps = scheduledDepartures(store, ["AUB-C"], paris("00:55", "2026-10-06"), paris("01:30", "2026-10-06"));
    expect(deps).toHaveLength(1);
    expect(deps[0]!.trip.id).toBe("AUB-102");
    expect(new Date(deps[0]!.aimedMs).toISOString()).toBe("2026-10-05T23:00:00.000Z"); // 01:00 à Paris
  });
});

describe("rapprochement SIRI", () => {
  const dep = {
    tripId: "AUB-100",
    lineShortName: "01",
    aimed: new Date(paris("08:00")).toISOString(),
  } as Departure;
  const visit = (v: Partial<SiriStopVisit>): SiriStopVisit => ({
    lineRef: "",
    directionRef: "",
    destination: "",
    journeyRef: "",
    stopPointRef: "",
    aimedDeparture: null,
    expectedDeparture: null,
    aimedArrival: null,
    expectedArrival: null,
    vehicleRef: null,
    location: null,
    bearing: null,
    ...v,
  });

  it("par numéro de course", () => {
    const v = visit({ journeyRef: "AUB:VehicleJourney::100:LOC" });
    expect(matchVisit(dep, [visit({}), v])).toBe(v);
  });

  it("par ligne et heure théorique proche", () => {
    const v = visit({ lineRef: "AUB:Line::01:LOC", aimedDeparture: "2026-10-05T08:01:00+02:00" });
    const far = visit({ lineRef: "AUB:Line::01:LOC", aimedDeparture: "2026-10-05T08:30:00+02:00" });
    const other = visit({ lineRef: "AUB:Line::02:LOC", aimedDeparture: "2026-10-05T08:00:00+02:00" });
    expect(matchVisit(dep, [far, other, v])).toBe(v);
    expect(matchVisit(dep, [far, other])).toBeUndefined();
  });
});

describe("véhicules estimés", () => {
  it("place le bus entre deux arrêts au prorata du temps", () => {
    const vs = estimateVehicles(store, new GpsCache(), paris("08:21"), "AUB-01");
    expect(vs).toHaveLength(1);
    const v = vs[0]!;
    expect(v.tripId).toBe("AUB-100");
    expect(v.source).toBe("estimated");
    expect(v.nextStopName).toBe("Paluds");
    // À mi-chemin entre Centre (5.57) et Paluds (5.60)
    expect(v.lon).toBeCloseTo(5.585, 2);
    expect(v.progress).toBeCloseTo(0.7, 2);
  });

  it("laisse le bus à quai pendant l'arrêt", () => {
    const v = estimateVehicles(store, new GpsCache(), paris("08:11"), "AUB-01")[0]!;
    expect(v.lat).toBeCloseTo(43.292, 4);
    expect(v.nextStopName).toBe("Centre");
  });

  it("préfère une position GPS récente", () => {
    const gps = new GpsCache();
    gps.set("AUB-100", { lat: 43.3, lon: 5.6, bearing: 90 }, paris("08:04"));
    const v = estimateVehicles(store, gps, paris("08:05"), "AUB-01")[0]!;
    expect(v).toMatchObject({ source: "gps", lat: 43.3, lon: 5.6, bearing: 90 });
  });

  it("ignore une position GPS périmée", () => {
    const gps = new GpsCache();
    gps.set("AUB-100", { lat: 43.3, lon: 5.6, bearing: 90 }, paris("07:58"));
    expect(estimateVehicles(store, gps, paris("08:05"), "AUB-01")[0]!.source).toBe("estimated");
  });

  it("n'affiche rien hors service", () => {
    expect(estimateVehicles(store, new GpsCache(), paris("12:00"))).toEqual([]);
  });
});

describe("fiche horaire", () => {
  it("fusionne les séquences d'arrêts (un arrêt inconnu suit le dernier arrêt connu)", () => {
    expect(mergeStopSequences([["A", "B", "D"], ["A", "C", "D", "E"], ["X", "A"]])).toEqual(["X", "A", "C", "B", "D", "E"]);
  });

  it("produit une grille course × arrêt pour une date", () => {
    const tt = getTimetable(store, "AUB-01", "20261005", 0)!;
    expect(tt.stops.map((s) => s.name)).toEqual(["Gare", "Centre", "Paluds"]);
    expect(tt.trips.map((t) => t.times)).toEqual([
      ["08:00", "08:12", "08:30"],
      ["09:00", "09:10", "09:20"],
      ["00:50", "01:00", "01:10"],
    ]);
    expect(getTimetable(store, "AUB-01", "20261010", 0)!.trips).toEqual([]);
  });
});

describe("recherche d'arrêts", () => {
  it("ignore accents et casse, et classe par pertinence", () => {
    expect(searchStations(store, "palud")[0]!.name).toBe("Paluds");
    expect(searchStations(store, "GARE roquevaire").map((s) => s.city)).toEqual(["Roquevaire"]);
  });

  it("trouve les arrêts proches", () => {
    const res = nearbyStations(store, 43.2921, 5.5701, 300);
    expect(res.map((s) => s.name)).toEqual(["Centre"]);
    expect(res[0]!.distance).toBeLessThan(20);
  });
});
