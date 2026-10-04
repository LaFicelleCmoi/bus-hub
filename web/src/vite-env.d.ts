/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Clé Google Maps Platform (Map Tiles API activée, restreinte aux domaines du site) */
  readonly VITE_GOOGLE_MAPS_API_KEY?: string;
  readonly VITE_TILE_URL?: string;
  readonly VITE_TILE_ATTRIBUTION?: string;
}
