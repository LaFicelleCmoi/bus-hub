import { describe, expect, it } from "vitest";
import { parseCsv } from "../src/gtfs/csv.ts";
import { Polyline } from "../src/gtfs/geo.ts";
import { addDays, parseGtfsTime, serviceDateOf, serviceDayOrigin, weekdayOf } from "../src/gtfs/time.ts";
import { fixtureStore } from "./fixture.ts";

describe("parseCsv", () => {
  it("gère guillemets, virgules, sauts de ligne, CRLF et BOM", () => {
    const rows = parseCsv('﻿a,b,c\r\n1,"x, ""y""",3\r\n2,"multi\nligne",\r\n');
    expect(rows).toEqual([
      { a: "1", b: 'x, "y"', c: "3" },
      { a: "2", b: "multi\nligne", c: "" },
    ]);
  });
});

describe("temps", () => {
  it("parse les horaires GTFS au-delà de 24 h", () => {
    expect(parseGtfsTime("25:10:00")).toBe(90600);
    expect(parseGtfsTime("")).toBeNaN();
  });

  it("calcule l'origine du jour de service, y compris au changement d'heure", () => {
    // Jour normal (UTC+2) : origine = minuit local
    expect(new Date(serviceDayOrigin("20261005")).toISOString()).toBe("2026-10-04T22:00:00.000Z");
    // Passage à l'heure d'hiver le 25/10/2026 : « midi moins 12 h » = 23:00 locale la veille (heure d'été)
    expect(new Date(serviceDayOrigin("20261025")).toISOString()).toBe("2026-10-24T23:00:00.000Z");
    // Le lendemain, UTC+1
    expect(new Date(serviceDayOrigin("20261026")).toISOString()).toBe("2026-10-25T23:00:00.000Z");
  });

  it("donne la date et le jour de la semaine à Paris", () => {
    expect(serviceDateOf(Date.parse("2026-10-04T22:30:00Z"))).toBe("20261005"); // 00:30 à Paris
    expect(weekdayOf("20261005")).toBe(0); // lundi
    expect(addDays("20261231", 1)).toBe("20270101");
  });
});

describe("Polyline", () => {
  const line = new Polyline([
    [43.0, 5.0],
    [43.0, 5.01],
    [43.01, 5.01],
  ]);

  it("interpole un point au milieu du tracé", () => {
    const { point } = line.at(line.cumulative[1]! / 2);
    expect(point[0]).toBeCloseTo(43.0, 6);
    expect(point[1]).toBeCloseTo(5.005, 6);
  });

  it("projette les arrêts de façon monotone", () => {
    const d = line.projectSequence([
      [43.0, 5.0],
      [43.0001, 5.01],
      [43.01, 5.01],
    ]);
    expect(d[0]).toBe(0);
    // L'arrêt est 11 m au nord du coude : il se projette sur le second segment
    expect(Math.abs(d[1]! - line.cumulative[1]!)).toBeLessThan(15);
    expect(d[2]!).toBeCloseTo(line.length, 0);
  });
});

describe("GtfsStore", () => {
  const store = fixtureStore();

  it("fusionne les stations homonymes proches, pas celles d'une autre commune", () => {
    const gares = [...store.stations.values()].filter((s) => s.name === "Gare");
    expect(gares).toHaveLength(2);
    const aubagne = gares.find((s) => s.city === "Aubagne")!;
    expect(aubagne.id).toBe("AUB-P1");
    expect(aubagne.platformIds.sort()).toEqual(["AUB-G1", "AUB-G2"]);
    expect(aubagne.wheelchair).toBe(true);
    expect(aubagne.lineIds).toEqual(["AUB-01", "AUB-02"]);
  });

  it("applique calendrier et exceptions", () => {
    expect(store.isServiceActive("WEEK", "20261005")).toBe(true);
    expect(store.isServiceActive("WEEK", "20261010")).toBe(false); // samedi
    expect(store.isServiceActive("WEEK", "20261111")).toBe(false); // férié supprimé
    expect(store.isServiceActive("SUN", "20261111")).toBe(true); // service du dimanche ajouté
  });

  it("interpole les horaires manquants", () => {
    const st = store.trips.get("AUB-101")!.stopTimes[1]!;
    expect(st.dep).toBe(parseGtfsTime("09:10:00"));
  });

  it("trie les lignes de façon naturelle et regroupe les parcours", () => {
    expect(store.sortedLines().map((l) => l.shortName)).toEqual(["01", "2"]);
    const patterns = store.linePatterns("AUB-01");
    expect(patterns.map((p) => [p.directionId, p.tripIds.length])).toEqual([
      [0, 3],
      [1, 1],
    ]);
    expect(store.lines.get("AUB-02")!.color).toBe("#1d4ed8");
  });
});
