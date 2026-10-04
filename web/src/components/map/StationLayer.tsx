import { useState } from "react";
import { CircleMarker, Popup, useMapEvents } from "react-leaflet";
import { Link } from "react-router";
import type { Station } from "@bus-hub/shared";
import { LineBadges } from "../LineBadge";

/** Style des points d'arrêt. Couleurs en dur : avec preferCanvas, Leaflet ignore les classes CSS. */
export const STATION_DOT = { color: "#334155", weight: 2, fillColor: "#ffffff", fillOpacity: 1 } as const;

/** Arrêts du réseau ; masqués aux petits zooms pour garder la carte lisible. */
export function StationLayer({ stations, minZoom = 14, highlight }: { stations: Station[]; minZoom?: number; highlight?: string | null }) {
  const [zoom, setZoom] = useState<number | null>(null);
  const map = useMapEvents({ zoomend: () => setZoom(map.getZoom()) });
  const z = zoom ?? map.getZoom();
  if (z < minZoom) return null;

  return (
    <>
      {stations.map((s) => {
        const active = !highlight || s.lineIds.includes(highlight);
        return (
          <CircleMarker
            key={s.id}
            center={[s.lat, s.lon]}
            radius={z >= 16 ? 7 : 5}
            pathOptions={{ ...STATION_DOT, opacity: active ? 1 : 0.3, fillOpacity: active ? 1 : 0.3 }}
          >
            <Popup>
              <div className="popup">
                <strong>{s.name}</strong>
                <span className="muted small"> · {s.city}</span>
                <LineBadges ids={s.lineIds} />
                <Link to={`/arrets/${encodeURIComponent(s.id)}`} className="btn btn--primary btn--sm">
                  Prochains départs
                </Link>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </>
  );
}
