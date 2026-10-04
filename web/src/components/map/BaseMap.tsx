import { useEffect, type ReactNode } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import L, { type LatLngBoundsExpression, type LatLngExpression } from "leaflet";
import "leaflet/dist/leaflet.css";
import { GoogleTiles, useGoogleSession } from "./GoogleTiles";

// Repli si aucune clé Google Maps n'est configurée (ou si Google refuse la clé)
const TILE_URL = import.meta.env.VITE_TILE_URL ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION =
  import.meta.env.VITE_TILE_ATTRIBUTION ?? '&copy; <a href="https://www.openstreetmap.org/copyright">contributeurs OpenStreetMap</a>';

/** Centre d'Aubagne, utilisé avant le chargement des données */
export const AUBAGNE: LatLngExpression = [43.2927, 5.5708];

export function BaseMap({ children, className, center = AUBAGNE, zoom = 13 }: { children?: ReactNode; className?: string; center?: LatLngExpression; zoom?: number }) {
  return (
    <MapContainer center={center} zoom={zoom} className={`map ${className ?? ""}`} zoomControl={false} attributionControl preferCanvas>
      <BaseTiles />
      <ZoomControl />
      {children}
    </MapContainer>
  );
}

/** Google Maps si une clé est configurée, sinon OpenStreetMap. */
function BaseTiles() {
  const g = useGoogleSession();
  if (g.session) return <GoogleTiles session={g.session} dark={g.dark} />;
  if (g.pending) return null; // évite d'afficher OSM une fraction de seconde
  return <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} maxZoom={19} className="map-tiles" />;
}

function ZoomControl() {
  const map = useMap();
  useEffect(() => {
    const ctl = L.control.zoom({ position: "bottomright", zoomInTitle: "Zoomer", zoomOutTitle: "Dézoomer" }).addTo(map);
    return () => {
      ctl.remove();
    };
  }, [map]);
  return null;
}

/** Ajuste la vue sur des bornes à chaque changement de `fitKey`. */
export function FitBounds({ bounds, fitKey, maxZoom = 16 }: { bounds: LatLngBoundsExpression | null; fitKey: string; maxZoom?: number }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) map.fitBounds(bounds, { padding: [32, 32], maxZoom });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, fitKey]);
  return null;
}

/** Recentre la carte sur un point (géolocalisation…). */
export function FlyTo({ to, zoom = 16 }: { to: [number, number] | null; zoom?: number }) {
  const map = useMap();
  useEffect(() => {
    if (to) map.flyTo(to, zoom, { duration: 0.8 });
  }, [map, to, zoom]);
  return null;
}
