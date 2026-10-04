import { useCallback, useEffect, useRef, useState } from "react";

export interface GeoPosition {
  lat: number;
  lon: number;
  /** Rayon de précision, en mètres */
  accuracy: number;
  /** Direction de déplacement en degrés (0 = nord), si l'appareil la fournit */
  heading: number | null;
}

type GeoState =
  | { status: "idle" | "loading"; pos: null; error: null }
  | { status: "ok"; pos: GeoPosition; error: null }
  | { status: "error"; pos: null; error: string };

/**
 * Position de l'utilisateur. Avec `watch`, la position est suivie en continu après le premier
 * appel à `locate()`. `requestId` change à chaque demande explicite (pour recentrer la carte
 * une seule fois, pas à chaque mise à jour du GPS).
 */
export function useGeolocation({ watch = false }: { watch?: boolean } = {}) {
  const [state, setState] = useState<GeoState>({ status: "idle", pos: null, error: null });
  const [requestId, setRequestId] = useState(0);
  const watchId = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
  }, []);

  useEffect(() => stop, [stop]);

  const locate = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setState({ status: "error", pos: null, error: "La géolocalisation n'est pas disponible sur cet appareil." });
      return;
    }
    setRequestId((n) => n + 1);
    setState((s) => (s.status === "ok" ? s : { status: "loading", pos: null, error: null }));

    const onPos = (p: GeolocationPosition) =>
      setState({
        status: "ok",
        pos: {
          lat: p.coords.latitude,
          lon: p.coords.longitude,
          accuracy: p.coords.accuracy,
          heading: p.coords.heading !== null && !Number.isNaN(p.coords.heading) && (p.coords.speed ?? 0) > 0.5 ? p.coords.heading : null,
        },
        error: null,
      });
    const onErr = (e: GeolocationPositionError) => {
      stop();
      setState({
        status: "error",
        pos: null,
        error: e.code === e.PERMISSION_DENIED ? "Autorisez la localisation pour trouver les arrêts proches." : "Position introuvable pour le moment.",
      });
    };
    const opts: PositionOptions = { enableHighAccuracy: true, timeout: 10_000, maximumAge: watch ? 5_000 : 60_000 };

    if (watch) {
      if (watchId.current === null) watchId.current = navigator.geolocation.watchPosition(onPos, onErr, opts);
    } else {
      navigator.geolocation.getCurrentPosition(onPos, onErr, opts);
    }
  }, [watch, stop]);

  return { ...state, requestId, locate };
}
