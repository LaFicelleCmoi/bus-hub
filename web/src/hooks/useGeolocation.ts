import { useCallback, useState } from "react";

type GeoState =
  | { status: "idle" | "loading"; pos: null; error: null }
  | { status: "ok"; pos: { lat: number; lon: number }; error: null }
  | { status: "error"; pos: null; error: string };

export function useGeolocation() {
  const [state, setState] = useState<GeoState>({ status: "idle", pos: null, error: null });

  const locate = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setState({ status: "error", pos: null, error: "La géolocalisation n'est pas disponible sur cet appareil." });
      return;
    }
    setState({ status: "loading", pos: null, error: null });
    navigator.geolocation.getCurrentPosition(
      (p) => setState({ status: "ok", pos: { lat: p.coords.latitude, lon: p.coords.longitude }, error: null }),
      (e) =>
        setState({
          status: "error",
          pos: null,
          error: e.code === e.PERMISSION_DENIED ? "Autorisez la localisation pour trouver les arrêts proches." : "Position introuvable pour le moment.",
        }),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }, []);

  return { ...state, locate };
}
