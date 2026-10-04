import { describe, expect, it } from "vitest";
import GtfsRealtimeBindings from "gtfs-realtime-bindings";
import { mapAlerts } from "../src/realtime/alerts.ts";
import { RateLimiter } from "../src/realtime/rateLimiter.ts";
import { parseStopMonitoring } from "../src/realtime/siri.ts";

const { transit_realtime } = GtfsRealtimeBindings;

describe("RateLimiter", () => {
  it("limite le nombre de requêtes sur une fenêtre glissante", () => {
    let t = 0;
    const rl = new RateLimiter(2, 60_000, () => t);
    expect(rl.tryTake()).toBe(true);
    expect(rl.tryTake()).toBe(true);
    expect(rl.tryTake()).toBe(false);
    t = 60_001;
    expect(rl.remaining).toBe(2);
  });
});

describe("parseStopMonitoring", () => {
  it("extrait les passages d'une réponse SOAP SIRI", () => {
    const xml = `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>
      <ns1:GetStopMonitoringResponse xmlns:ns1="http://wsdl.siri.org.uk" xmlns:s="http://www.siri.org.uk/siri"><Answer>
      <s:StopMonitoringDelivery><s:MonitoredStopVisit><s:MonitoredVehicleJourney>
        <s:LineRef>AUB:Line::01:LOC</s:LineRef>
        <s:FramedVehicleJourneyRef><s:DataFrameRef>x</s:DataFrameRef><s:DatedVehicleJourneyRef>AUB:VehicleJourney::100:LOC</s:DatedVehicleJourneyRef></s:FramedVehicleJourneyRef>
        <s:DestinationName>Paluds</s:DestinationName>
        <s:VehicleLocation><s:Longitude>5.57</s:Longitude><s:Latitude>43.29</s:Latitude></s:VehicleLocation>
        <s:Bearing>120</s:Bearing>
        <s:MonitoredCall><s:StopPointRef>AUB:StopPoint:BP:G1:LOC</s:StopPointRef>
          <s:AimedDepartureTime>2026-10-05T08:00:00+02:00</s:AimedDepartureTime>
          <s:ExpectedDepartureTime>2026-10-05T08:03:00+02:00</s:ExpectedDepartureTime>
        </s:MonitoredCall>
      </s:MonitoredVehicleJourney></s:MonitoredStopVisit></s:StopMonitoringDelivery></Answer></ns1:GetStopMonitoringResponse>
      </soap:Body></soap:Envelope>`;
    expect(parseStopMonitoring(xml)).toEqual([
      {
        lineRef: "AUB:Line::01:LOC",
        directionRef: "",
        destination: "Paluds",
        journeyRef: "AUB:VehicleJourney::100:LOC",
        stopPointRef: "AUB:StopPoint:BP:G1:LOC",
        aimedDeparture: "2026-10-05T08:00:00+02:00",
        expectedDeparture: "2026-10-05T08:03:00+02:00",
        aimedArrival: null,
        expectedArrival: null,
        vehicleRef: null,
        location: { lat: 43.29, lon: 5.57 },
        bearing: 120,
      },
    ]);
  });

  it("remonte les fautes SOAP (cas réel du serveur d'Aubagne)", () => {
    const xml = `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><soap:Fault><faultcode>soap:Server</faultcode><faultstring>Cannot invoke "x" because "key" is null</faultstring></soap:Fault></soap:Body></soap:Envelope>`;
    expect(() => parseStopMonitoring(xml)).toThrow(/SIRI fault/);
  });
});

describe("mapAlerts", () => {
  const feed = transit_realtime.FeedMessage.create({
    header: { gtfsRealtimeVersion: "2.0" },
    entity: [
      {
        id: "a1",
        alert: {
          informedEntity: [{ routeId: "AUB-01" }],
          headerText: { translation: [{ text: "Ligne 01 déviée", language: "fr" }] },
          effect: transit_realtime.Alert.Effect.DETOUR,
          activePeriod: [{ start: 1_000, end: 2_000_000_000 }],
        },
      },
      {
        id: "a2",
        alert: {
          informedEntity: [{ routeId: "C13-68" }],
          headerText: { translation: [{ text: "Travaux", language: "fr" }] },
          descriptionText: { translation: [{ text: "ZI des Paluds à Aubagne", language: "fr" }] },
          activePeriod: [{ start: 1_000, end: 2_000 }],
        },
      },
      { id: "a3", alert: { informedEntity: [{ routeId: "RTM-T1" }], headerText: { translation: [{ text: "Marseille" }] } } },
    ],
  });

  it("garde les alertes du réseau et celles des réseaux voisins qui concernent le territoire", () => {
    const alerts = mapAlerts(feed, Date.parse("2026-10-05T08:00:00Z"));
    expect(alerts.map((a) => [a.id, a.scope, a.isActive])).toEqual([
      ["a1", "network", true],
      ["a2", "nearby", false],
    ]);
    expect(alerts[0]).toMatchObject({ lineIds: ["AUB-01"], effect: "DETOUR", header: "Ligne 01 déviée" });
  });
});
