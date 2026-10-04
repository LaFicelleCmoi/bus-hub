import { useMemo } from "react";
import { Circle, Marker } from "react-leaflet";
import L from "leaflet";
import type { GeoPosition } from "../../hooks/useGeolocation";

/** Marqueur « vous êtes ici » : point bleu pulsé, cône d'orientation et cercle de précision. */
export function UserLocation({ pos }: { pos: GeoPosition }) {
  const heading = pos.heading === null ? null : Math.round(pos.heading / 5) * 5;
  const icon = useMemo(
    () =>
      L.divIcon({
        className: "me-icon",
        html:
          `<div class="me">` +
          (heading === null ? "" : `<span class="me__cone" style="transform: rotate(${heading}deg)"></span>`) +
          `<span class="me__pulse"></span><span class="me__dot"></span></div>`,
        iconSize: [44, 44],
        iconAnchor: [22, 22],
      }),
    [heading],
  );

  return (
    <>
      {pos.accuracy > 15 && pos.accuracy < 2000 && (
        <Circle
          center={[pos.lat, pos.lon]}
          radius={pos.accuracy}
          interactive={false}
          pathOptions={{ color: "#1a73e8", weight: 1, opacity: 0.35, fillColor: "#1a73e8", fillOpacity: 0.1 }}
        />
      )}
      <Marker position={[pos.lat, pos.lon]} icon={icon} interactive={false} keyboard={false} zIndexOffset={2000} title="Votre position" />
    </>
  );
}
