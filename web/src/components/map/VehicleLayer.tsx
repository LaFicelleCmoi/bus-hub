import { useMemo } from "react";
import { Marker, Popup } from "react-leaflet";
import L from "leaflet";
import { Link } from "react-router";
import type { Vehicle } from "@bus-hub/shared";
import { formatTime } from "../../lib/time";
import { LineBadge } from "../LineBadge";

const iconCache = new Map<string, L.DivIcon>();

function vehicleIcon(v: Vehicle, dimmed: boolean): L.DivIcon {
  const bearing = v.bearing === null ? null : Math.round(v.bearing / 10) * 10;
  const key = `${v.lineShortName}|${v.lineColor}|${v.lineTextColor}|${bearing}|${v.source}|${dimmed}`;
  let icon = iconCache.get(key);
  if (!icon) {
    const esc = v.lineShortName.replace(/[<>&"]/g, "");
    const arrow = bearing === null ? "" : `<span class="vehicle__arrow" style="transform: rotate(${bearing}deg)"></span>`;
    icon = L.divIcon({
      className: "vehicle-icon",
      html: `<div class="vehicle ${v.source === "gps" ? "vehicle--gps" : ""} ${dimmed ? "vehicle--dimmed" : ""}" style="--c:${v.lineColor};--t:${v.lineTextColor}">${arrow}<span class="vehicle__label">${esc}</span></div>`,
      iconSize: [34, 34],
      iconAnchor: [17, 17],
      popupAnchor: [0, -16],
    });
    iconCache.set(key, icon);
  }
  return icon;
}

export function VehicleLayer({ vehicles, highlightLine }: { vehicles: Vehicle[]; highlightLine?: string | null }) {
  const sorted = useMemo(
    // Les bus de la ligne mise en avant sont dessinés au-dessus
    () => [...vehicles].sort((a, b) => Number(a.lineId === highlightLine) - Number(b.lineId === highlightLine)),
    [vehicles, highlightLine],
  );
  return (
    <>
      {sorted.map((v) => {
        const dimmed = !!highlightLine && v.lineId !== highlightLine;
        return (
          <Marker key={v.tripId} position={[v.lat, v.lon]} icon={vehicleIcon(v, dimmed)} zIndexOffset={dimmed ? 0 : 1000} keyboard={false}>
            <Popup>
              <div className="popup">
                <div className="popup__title">
                  <LineBadge shortName={v.lineShortName} color={v.lineColor} textColor={v.lineTextColor} size="sm" />
                  <strong>→ {v.headsign}</strong>
                </div>
                {v.nextStopName && v.nextStopAt && (
                  <p>
                    Prochain arrêt : <strong>{v.nextStopName}</strong> ({formatTime(v.nextStopAt)})
                  </p>
                )}
                <div className="progress" aria-label={`Course effectuée à ${Math.round(v.progress * 100)} %`}>
                  <span style={{ width: `${v.progress * 100}%`, background: v.lineColor }} />
                </div>
                <p className="muted small">{v.source === "gps" ? "Position GPS temps réel" : "Position estimée d'après les horaires théoriques"}</p>
                <Link to={`/lignes/${encodeURIComponent(v.lineId)}`}>Voir la ligne</Link>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </>
  );
}
