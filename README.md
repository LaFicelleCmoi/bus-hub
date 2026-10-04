# Bus Hub Aubagne

Hub du réseau **Lignes de l'Agglo** (Pays d'Aubagne et de l'Étoile). On y trouve la carte des bus en circulation, les prochains départs à chaque arrêt, les fiches horaires, les parcours des lignes, l'info trafic et les arrêts favoris.

Le projet est en TypeScript de bout en bout : une API **Fastify** (Node ≥ 23.6, exécutée sans build grâce au *type stripping* natif) et un front **React 19 + Vite + Leaflet + TanStack Query**. Les types sont partagés entre les deux.

```
shared/   types communs API ↔ front
server/   API : chargement GTFS, client SIRI, alertes GTFS-RT, calculs
web/      application React
```

## Démarrage

```bash
npm install
npm run dev        # API sur :3001 + front sur http://localhost:5173
```

Au premier lancement, l'API télécharge le GTFS (≈ 600 Ko) et le met en cache dans `server/data/`. Elle le recharge ensuite toutes les 24 h.

```bash
npm test           # tests de l'API (vitest)
npm run typecheck
npm run build && npm start   # production : l'API sert aussi le front sur :3001
```

Avec Docker :

```bash
docker build -t bus-hub . && docker run -p 3001:3001 -v bus-hub-data:/data bus-hub
```

La configuration se fait par variables d'environnement : voir [.env.example](.env.example).

### Vercel

[vercel.json](vercel.json) déploie le dépôt comme un seul projet Vercel à deux services :

- `server` : l'API Fastify, exécutée comme Vercel Function et publique sous `/api/*` ;
- `web` : le front Vite en statique, sur toutes les autres routes, avec un fallback vers `index.html`.

Pour tester les deux ensemble en local :

```bash
vercel dev -L
```

Sur Vercel, le GTFS est mis en cache dans `/tmp` et rechargé à chaque démarrage à froid. Les caches (SIRI, alertes) sont propres à chaque instance.

## Fonctionnalités

| Écran | Contenu |
|---|---|
| **Carte** | Tracés de toutes les lignes, arrêts (à partir du zoom 14), bus en circulation rafraîchis toutes les 10 s, filtre par ligne, géolocalisation |
| **Arrêts** | Recherche (sans accents, par nom ou commune), arrêts autour de moi, favoris avec leurs prochains départs, pôles d'échanges |
| **Arrêt** | Tableau des départs avec compte à rebours, filtre par ligne, temps réel s'il est disponible, accessibilité, info trafic des lignes desservies |
| **Lignes** | Lignes classées par famille (régulières, scolaires, navettes) et nombre de bus en circulation |
| **Ligne** | Carte du parcours, liste des arrêts, variantes, changement de sens, fiche horaire du jour choisi |
| **Info trafic** | Infos trafic officielles de lignes-agglo.fr rattachées aux lignes, puis flux de la Métropole et réseaux voisins |
| **Réseau** | Contact officiel, plans officiels (PDF), services du site lignes-agglo.fr, état des flux, sources et licences |

## API

| Route | Description |
|---|---|
| `GET /api/meta` | Version du GTFS, comptages, état du temps réel, sources |
| `GET /api/lines` · `/api/lines/:id` | Lignes ; détail avec parcours, arrêts et tracés |
| `GET /api/lines/:id/timetable?date=AAAA-MM-JJ&direction=0` | Fiche horaire (courses × arrêts) |
| `GET /api/shapes` | Tracés de tout le réseau, pour la carte |
| `GET /api/stations?q=` · `/api/stations/nearby?lat=&lon=&radius=` · `/api/stations/:id` | Arrêts |
| `GET /api/stations/:id/departures?limit=` | Prochains départs (théoriques, enrichis en temps réel si disponible) |
| `GET /api/vehicles?line=` | Bus en circulation |
| `GET /api/alerts` | Info trafic (officielle puis Métropole) |
| `GET /api/official` | Plans, liens et contact officiels du réseau |

## Sources de données et limites

Toutes les sources sont sous **Licence Ouverte 2.0** (Métropole Aix-Marseille-Provence, via [transport.data.gouv.fr](https://transport.data.gouv.fr/datasets/reseaux-de-transports-en-commun-de-la-metropole-daix-marseille-provence-et-des-bouches-du-rhone/)).

- **Horaires théoriques** : GTFS « Agglobus – Les lignes de l'agglo ». Le GTFS crée parfois un arrêt parent par quai, par exemple 12 quais « Gare » à Aubagne. Le hub regroupe donc les arrêts de même nom, dans la même commune, situés à moins de 400 m.
- **Temps réel** : flux SIRI `https://siri.lametropolemobilite.fr/AUB_TPE`, avec la clé `open-data` et un quota de 10 à 20 requêtes par minute. Résultat des tests du 04/10/2026 :
  - `CheckStatus` répond ;
  - `GetStopMonitoring`, `GetEstimatedTimetable` et `GetGeneralMessage` renvoient une erreur serveur (SOAP fault Navineo) ou expirent ;
  - `GetVehicleMonitoring` exige un `VehicleRef`, il n'y a donc pas de liste globale des bus ;
  - `LinesDiscovery` et `StopPointsDiscovery` expirent.

  Le hub essaie quand même `StopMonitoring` :
  - en cas d'échec, il fait une pause de 10 min pour ménager le quota ;
  - il ne dépasse jamais 8 requêtes par minute ;
  - il n'attend pas le SIRI plus de 2,5 s avant d'afficher les horaires théoriques.

  Dès que le flux répondra, les départs passeront en temps réel (retard, heure prévue) sans modification. Les positions GPS éventuellement présentes dans les réponses seront aussi utilisées sur la carte. Le format des identifiants d'arrêt se règle avec `SIRI_STOP_REF_TEMPLATE`.
- **Positions des bus** : en l'absence de GPS, elles sont **estimées**. Chaque course en cours est placée sur son tracé, au prorata de l'heure entre deux arrêts. L'application le signale à l'utilisateur.
- **Contenus officiels du réseau** : l'info trafic, les plans PDF et les liens de services viennent du site officiel [lignes-agglo.fr](https://lignes-agglo.fr/). Le site n'a pas d'API : le hub lit ses pages publiques toutes les 10 minutes et renvoie toujours vers l'article d'origine.
- **Info trafic** : flux GTFS-RT Service Alerts de la Métropole (`api-mobilite.rbgl.fr`). Ce flux est hébergé par un tiers et non par la Métropole elle-même.
- **Fond de carte** : Google Maps, via la Map Tiles API officielle (tuiles 2D, avec le logo et l'attribution exigés par Google), si `VITE_GOOGLE_MAPS_API_KEY` est défini au build. Pour obtenir la clé :
  1. Dans Google Cloud, activer la **Map Tiles API** (un compte de facturation est requis).
  2. Créer une clé API, restreinte aux référents HTTP du site (`https://bus-hub-rab3.vercel.app/*`, `http://localhost:5173/*`) et à la seule Map Tiles API.
  3. La déclarer dans les variables d'environnement Vercel, puis redéployer.

  Sans clé, ou si Google la refuse, la carte revient automatiquement sur OpenStreetMap (`VITE_TILE_URL` pour un autre fournisseur).

Cette application n'est pas officielle. Pour toute information faisant foi, référez-vous à [lignes-agglo.fr](https://lignes-agglo.fr/).
