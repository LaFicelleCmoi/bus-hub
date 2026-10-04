import { useCallback, useSyncExternalStore } from "react";

const KEY = "bus-hub:favorites";
const listeners = new Set<() => void>();

function read(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

let snapshot = read();

function write(ids: string[]) {
  snapshot = ids;
  try {
    localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    // stockage indisponible (navigation privée) : les favoris restent en mémoire
  }
  listeners.forEach((l) => l());
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) {
      snapshot = read();
      listeners.forEach((l) => l());
    }
  });
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Arrêts favoris, stockés dans le navigateur et synchronisés entre onglets. */
export function useFavorites() {
  const ids = useSyncExternalStore(subscribe, () => snapshot);
  const toggle = useCallback((id: string) => {
    write(snapshot.includes(id) ? snapshot.filter((x) => x !== id) : [...snapshot, id]);
  }, []);
  return { ids, isFavorite: (id: string) => ids.includes(id), toggle };
}
