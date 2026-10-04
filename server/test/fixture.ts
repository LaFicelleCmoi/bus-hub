import { GtfsStore, type GtfsFiles } from "../src/gtfs/store.ts";
import { parseCsv } from "../src/gtfs/csv.ts";

const csv = (s: string) => parseCsv(s.trim().replace(/^ +/gm, ""));

/**
 * Mini réseau : ligne 01 Gare → Centre → Paluds, deux quais « Gare » sous deux stations
 * parentes homonymes (cas réel du GTFS d'Aubagne), une course après minuit (24:50 → 25:10).
 */
export function fixtureFiles(): GtfsFiles {
  return {
    "routes.txt": csv(`
      route_id,route_short_name,route_long_name,route_type,route_color,route_text_color,direction0_name,direction1_name
      AUB-01,01,"Gare - Paluds, par le centre",3,FFDD00,000000,Paluds,Gare
      AUB-02,2,Navette,3,,,,
    `),
    "stops.txt": csv(`
      stop_id,stop_code,stop_name,stop_lat,stop_lon,location_type,parent_station,wheelchair_boarding,city_name
      AUB-P1,,Gare,43.2958,5.5662,1,,0,Aubagne
      AUB-P2,,Gare,43.2954,5.5646,1,,1,Aubagne
      AUB-G1,G1,Gare,43.2958,5.5662,0,AUB-P1,0,Aubagne
      AUB-G2,G2,Gare,43.2954,5.5646,0,AUB-P2,1,Aubagne
      AUB-C,C,Centre,43.2920,5.5700,0,,0,Aubagne
      AUB-Z,Z,Paluds,43.2900,5.6000,0,,0,Aubagne
      AUB-X,X,Gare,43.3500,5.7000,0,,0,Roquevaire
    `),
    "calendar.txt": csv(`
      service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date
      WEEK,1,1,1,1,1,0,0,20261001,20261231
      SUN,0,0,0,0,0,0,1,20261001,20261231
    `),
    "calendar_dates.txt": csv(`
      service_id,date,exception_type
      WEEK,20261111,2
      SUN,20261111,1
    `),
    "trips.txt": csv(`
      route_id,service_id,trip_id,trip_headsign,direction_id,shape_id
      AUB-01,WEEK,AUB-100,Paluds,0,SH1
      AUB-01,WEEK,AUB-101,Paluds,0,SH1
      AUB-01,WEEK,AUB-102,Paluds,0,SH1
      AUB-01,SUN,AUB-200,Gare,1,
      AUB-02,WEEK,AUB-300,Navette,0,
    `),
    "stop_times.txt": csv(`
      trip_id,arrival_time,departure_time,stop_id,stop_sequence,pickup_type,drop_off_type
      AUB-100,08:00:00,08:00:00,AUB-G1,1,0,0
      AUB-100,08:10:00,08:12:00,AUB-C,2,0,0
      AUB-100,08:30:00,08:30:00,AUB-Z,3,0,0
      AUB-101,09:00:00,09:00:00,AUB-G1,1,0,0
      AUB-101,,,AUB-C,2,0,0
      AUB-101,09:20:00,09:20:00,AUB-Z,3,0,0
      AUB-102,24:50:00,24:50:00,AUB-G1,1,0,0
      AUB-102,25:00:00,25:00:00,AUB-C,2,0,0
      AUB-102,25:10:00,25:10:00,AUB-Z,3,0,0
      AUB-200,10:00:00,10:00:00,AUB-Z,1,0,0
      AUB-200,10:30:00,10:30:00,AUB-G2,2,0,0
      AUB-300,07:00:00,07:00:00,AUB-G2,1,0,0
      AUB-300,07:05:00,07:05:00,AUB-X,2,0,0
    `),
    "shapes.txt": csv(`
      shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence
      SH1,43.2958,5.5662,1
      SH1,43.2920,5.5700,2
      SH1,43.2900,5.6000,3
    `),
    "feed_info.txt": csv(`
      feed_publisher_name,feed_version,feed_start_date,feed_end_date
      Test,v1,20261001,20261231
    `),
  };
}

export const fixtureStore = () => new GtfsStore(fixtureFiles());

/** Lundi 5 octobre 2026, à l'heure de Paris (UTC+2) */
export const paris = (hhmm: string, day = "2026-10-05") => Date.parse(`${day}T${hhmm}:00+02:00`);
