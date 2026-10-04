import { useEffect, useState } from "react";

/** Horloge qui se rafraîchit toutes les `intervalMs` (pour les comptes à rebours). */
export function useNow(intervalMs = 15_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
