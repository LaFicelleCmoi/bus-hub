import { useEffect, useState, useSyncExternalStore } from "react";
import { TileLayer, useMap, useMapEvents } from "react-leaflet";
import { useQuery } from "@tanstack/react-query";

/**
 * Fond de carte Google Maps via la Map Tiles API officielle (tuiles 2D).
 * https://developers.google.com/maps/documentation/tile/2d-tiles-overview
 *
 * Exigences de Google respectées ici :
 *  - session obtenue par createSession (valable ~2 semaines, réutilisée) ;
 *  - logo Google Maps officiel, non modifié, sur la carte ;
 *  - attribution des données (copyright) renvoyée par l'endpoint viewport, mise à jour au déplacement ;
 *  - tuiles non retouchées : le mode sombre passe par un style Google, pas par un filtre CSS.
 */

export const GOOGLE_MAPS_KEY: string | undefined = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || undefined;

const API = "https://tile.googleapis.com";

type Session = { session: string; expiry: number };

/** Style « nuit » appliqué côté Google pour le mode sombre */
const DARK_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#1d2c4d" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8ec3b9" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1a3646" }] },
  { featureType: "administrative.country", elementType: "geometry.stroke", stylers: [{ color: "#4b6878" }] },
  { featureType: "landscape.man_made", elementType: "geometry.stroke", stylers: [{ color: "#334e87" }] },
  { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: "#023e58" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#283d6a" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#6f9ba5" }] },
  { featureType: "poi.park", elementType: "geometry.fill", stylers: [{ color: "#023e58" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#304a7d" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#98a5be" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#2c6675" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#255763" }] },
  { featureType: "transit", elementType: "labels.text.fill", stylers: [{ color: "#98a5be" }] },
  { featureType: "transit.line", elementType: "geometry.fill", stylers: [{ color: "#283d6a" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0e1626" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#4e6d70" }] },
];

const darkQuery = typeof window !== "undefined" ? window.matchMedia("(prefers-color-scheme: dark)") : null;
const subscribeDark = (cb: () => void) => {
  darkQuery?.addEventListener("change", cb);
  return () => darkQuery?.removeEventListener("change", cb);
};
const useDarkMode = () => useSyncExternalStore(subscribeDark, () => darkQuery?.matches ?? false);

function readCachedSession(cacheKey: string): Session | null {
  try {
    const s = JSON.parse(localStorage.getItem(cacheKey) ?? "null") as Session | null;
    // Marge d'une journée avant l'expiration
    return s && s.expiry * 1000 - Date.now() > 86_400_000 ? s : null;
  } catch {
    return null;
  }
}

async function createSession(dark: boolean): Promise<Session> {
  const cacheKey = `bus-hub:gmaps-session:${dark ? "dark" : "light"}`;
  const cached = readCachedSession(cacheKey);
  if (cached) return cached;
  const res = await fetch(`${API}/v1/createSession?key=${encodeURIComponent(GOOGLE_MAPS_KEY!)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mapType: "roadmap",
      language: "fr-FR",
      region: "FR",
      scale: "scaleFactor2x",
      highDpi: true,
      ...(dark ? { styles: DARK_STYLE } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Google Maps : session refusée (HTTP ${res.status})`);
  const body = (await res.json()) as { session: string; expiry: string | number };
  const session = { session: body.session, expiry: Number(body.expiry) };
  try {
    localStorage.setItem(cacheKey, JSON.stringify(session));
  } catch {
    // stockage indisponible : nouvelle session au prochain chargement
  }
  return session;
}

/** Renvoie la session Google, ou `failed` si la clé est absente ou refusée (repli sur OSM). */
export function useGoogleSession() {
  const dark = useDarkMode();
  const q = useQuery({
    queryKey: ["gmaps-session", dark],
    queryFn: () => createSession(dark),
    enabled: !!GOOGLE_MAPS_KEY,
    staleTime: Infinity,
    retry: 1,
  });
  return { session: q.data?.session ?? null, dark, failed: !GOOGLE_MAPS_KEY || q.isError, pending: q.isPending && !!GOOGLE_MAPS_KEY };
}

export function GoogleTiles({ session, dark }: { session: string; dark: boolean }) {
  const key = encodeURIComponent(GOOGLE_MAPS_KEY!);
  return (
    <>
      <TileLayer
        key={session}
        url={`${API}/v1/2dtiles/{z}/{x}/{y}?session=${session}&key=${key}`}
        tileSize={256}
        maxZoom={21}
        maxNativeZoom={21}
        className="map-tiles--google"
      />
      <GoogleAttribution session={session} />
      <img
        className="gmaps-logo"
        src={dark ? "/google-maps/logo-dark-outline.svg" : "/google-maps/logo-light-outline.svg"}
        alt="Google Maps"
        width={84}
        height={18}
        draggable={false}
      />
    </>
  );
}

/** Attribution des données cartographiques, demandée à Google pour la vue courante. */
function GoogleAttribution({ session }: { session: string }) {
  const map = useMap();
  const [copyright, setCopyright] = useState("");
  const [tick, setTick] = useState(0);
  useMapEvents({ moveend: () => setTick((t) => t + 1) });

  useEffect(() => {
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      const b = map.getBounds();
      const params = new URLSearchParams({
        session,
        key: GOOGLE_MAPS_KEY!,
        zoom: String(Math.round(map.getZoom())),
        north: String(b.getNorth()),
        south: String(b.getSouth()),
        east: String(b.getEast()),
        west: String(b.getWest()),
      });
      try {
        const res = await fetch(`${API}/tile/v1/viewport?${params}`, { signal: ctrl.signal });
        if (res.ok) setCopyright(((await res.json()) as { copyright?: string }).copyright ?? "");
      } catch {
        // on garde la dernière attribution connue
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [map, session, tick]);

  useEffect(() => {
    const ctl = map.attributionControl;
    // Texte fourni par Google (ex. « Données cartographiques ©2026 Google »), affiché tel quel
    const text = copyright || "© Google";
    ctl.addAttribution(text);
    return () => {
      ctl.removeAttribution(text);
    };
  }, [map, copyright]);

  return null;
}
