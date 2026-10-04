import { useMemo, useState } from "react";
import { CircleMarker, Polyline, Tooltip } from "react-leaflet";
import { Link, useParams, useSearchParams } from "react-router";
import type { LineDetail, LinePattern } from "@bus-hub/shared";
import { AlertCard } from "../components/AlertCard";
import { Icon } from "../components/Icon";
import { LineBadge } from "../components/LineBadge";
import { BaseMap, FitBounds } from "../components/map/BaseMap";
import { STATION_DOT } from "../components/map/StationLayer";
import { VehicleLayer } from "../components/map/VehicleLayer";
import { Empty, ErrorState, Loading } from "../components/States";
import { useAlerts, useLine, useStations, useTimetable, useVehicles } from "../lib/api";
import { addDaysIso, formatDay, todayIso } from "../lib/time";

export function LinePage() {
  const { id = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = params.get("vue") === "horaires" ? "horaires" : "parcours";
  const direction = params.get("sens") === "1" ? 1 : 0;
  const { data: line, isLoading, error, refetch } = useLine(id);
  const { data: alerts } = useAlerts();

  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    next.set(k, v);
    setParams(next, { replace: true });
  };

  if (isLoading) return <Loading />;
  if (error || !line) return <ErrorState error={error ?? new Error("Ligne introuvable")} onRetry={() => refetch()} />;

  const hasDir = (d: number) => line.patterns.some((p) => p.directionId === d);
  const dir = hasDir(direction) ? direction : line.patterns[0]?.directionId ?? 0;
  const lineAlerts = alerts?.alerts.filter((a) => a.lineIds.includes(line.id)) ?? [];

  return (
    <div className="page page--wide">
      <header className="line-head" style={{ "--line": line.color } as React.CSSProperties}>
        <Link to="/lignes" className="icon-btn" aria-label="Retour aux lignes">
          <Icon name="back" />
        </Link>
        <LineBadge shortName={line.shortName} color={line.color} textColor={line.textColor} size="lg" />
        <div>
          <h1>Ligne {line.shortName}</h1>
          <p className="muted">{line.longName}</p>
        </div>
      </header>

      {lineAlerts.map((a) => (
        <AlertCard key={a.id} alert={a} collapsed />
      ))}

      <div className="official-links">
        <a href="https://lignes-agglo.fr/les-fiches-horaires/" target="_blank" rel="noreferrer noopener">
          <Icon name="file" size={16} /> Fiche horaire officielle
        </a>
        <a href="https://lignes-agglo.fr/calculer-votre-itineraire/" target="_blank" rel="noreferrer noopener">
          <Icon name="external" size={16} /> Itinéraire sur lignes-agglo.fr
        </a>
      </div>

      <div className="toolbar">
        <div className="segmented" role="tablist">
          <button role="tab" aria-selected={tab === "parcours"} className={tab === "parcours" ? "is-active" : ""} onClick={() => setParam("vue", "parcours")}>
            Parcours
          </button>
          <button role="tab" aria-selected={tab === "horaires"} className={tab === "horaires" ? "is-active" : ""} onClick={() => setParam("vue", "horaires")}>
            Horaires
          </button>
        </div>
        {hasDir(0) && hasDir(1) && (
          <button type="button" className="btn btn--ghost" onClick={() => setParam("sens", dir === 0 ? "1" : "0")}>
            <Icon name="swap" size={18} />
            Vers {headsignOf(line, dir === 0 ? 1 : 0)}
          </button>
        )}
      </div>

      {tab === "parcours" ? <RouteView line={line} direction={dir} /> : <TimetableView line={line} direction={dir} />}
    </div>
  );
}

function headsignOf(line: LineDetail, dir: number): string {
  return line.directions[dir] || line.patterns.find((p) => p.directionId === dir)?.headsign || `sens ${dir + 1}`;
}

function RouteView({ line, direction }: { line: LineDetail; direction: number }) {
  const patterns = line.patterns.filter((p) => p.directionId === direction);
  const [variant, setVariant] = useState(0);
  const pattern: LinePattern | undefined = patterns[variant] ?? patterns[0];
  const { data: vehicles } = useVehicles(line.id);
  const { data: stations } = useStations();

  // Rattache chaque quai à sa station (pour les liens vers les prochains départs)
  const stationOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of stations ?? []) for (const p of s.platformIds) m.set(p, s.id);
    return m;
  }, [stations]);

  if (!pattern) return <Empty>Aucun parcours dans ce sens.</Empty>;
  const dirVehicles = (vehicles?.vehicles ?? []).filter((v) => v.directionId === direction);

  return (
    <div className="line-layout">
      <div className="line-layout__map">
        <BaseMap className="map--card">
          <FitBounds bounds={pattern.shape} fitKey={`${line.id}-${direction}-${variant}`} />
          <Polyline positions={pattern.shape} pathOptions={{ color: line.color, weight: 6, opacity: 0.9 }} />
          {pattern.stops.map((s, i) => (
            <CircleMarker key={`${s.id}-${i}`} center={[s.lat, s.lon]} radius={5} pathOptions={STATION_DOT}>
              <Tooltip direction="top">{s.name}</Tooltip>
            </CircleMarker>
          ))}
          <VehicleLayer vehicles={dirVehicles} />
        </BaseMap>
        <p className="muted small">
          {dirVehicles.length > 0 ? `${dirVehicles.length} bus en circulation dans ce sens (positions estimées).` : "Aucun bus en circulation dans ce sens actuellement."}
        </p>
      </div>

      <div className="line-layout__stops">
        <h2 className="section__title">
          Vers {pattern.headsign} · {pattern.stops.length} arrêts
        </h2>
        {patterns.length > 1 && (
          <label className="select">
            <span className="sr-only">Variante de parcours</span>
            <select value={variant} onChange={(e) => setVariant(Number(e.target.value))}>
              {patterns.map((p, i) => (
                <option key={i} value={i}>
                  {i === 0 ? "Parcours principal" : `Variante ${i}`} : {p.stops[0]?.name} → {p.stops[p.stops.length - 1]?.name} ({p.tripCount} courses)
                </option>
              ))}
            </select>
          </label>
        )}
        <ol className="stop-line" style={{ "--line": line.color } as React.CSSProperties}>
          {pattern.stops.map((s, i) => {
            const stationId = stationOf.get(s.id);
            const busHere = dirVehicles.filter((v) => v.nextStopName === s.name).length;
            return (
              <li key={`${s.id}-${i}`} className={i === 0 || i === pattern.stops.length - 1 ? "is-terminus" : ""}>
                {stationId ? <Link to={`/arrets/${encodeURIComponent(stationId)}`}>{s.name}</Link> : <span>{s.name}</span>}
                {busHere > 0 && (
                  <span className="stop-line__bus" title="Bus en approche (estimé)">
                    <Icon name="bus" size={14} />
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

function TimetableView({ line, direction }: { line: LineDetail; direction: number }) {
  const [date, setDate] = useState(todayIso());
  const { data, isLoading, error, isFetching } = useTimetable(line.id, date, direction);

  return (
    <div>
      <div className="toolbar">
        <button type="button" className="icon-btn" onClick={() => setDate(addDaysIso(date, -1))} aria-label="Jour précédent">
          <Icon name="back" />
        </button>
        <label className="date-input">
          <span className="sr-only">Date</span>
          <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </label>
        <button type="button" className="icon-btn" onClick={() => setDate(addDaysIso(date, 1))} aria-label="Jour suivant">
          <Icon name="chevron" />
        </button>
        {date !== todayIso() && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setDate(todayIso())}>
            Aujourd'hui
          </button>
        )}
        {isFetching && <span className="spinner" aria-label="Chargement" />}
      </div>
      <p className="muted">
        {formatDay(`${date}T12:00:00`)} · vers {data?.headsign ?? "…"}
      </p>

      {isLoading && <Loading />}
      {error && <ErrorState error={error} />}
      {data && data.trips.length === 0 && <Empty icon="clock">Pas de circulation ce jour-là dans ce sens.</Empty>}
      {data && data.trips.length > 0 && (
        <div className="timetable-wrap" tabIndex={0} aria-label="Grille horaire, défilable">
          <table className="timetable">
            <thead>
              <tr>
                <th scope="col">Arrêt</th>
                {data.trips.map((t, i) => (
                  <th key={t.tripId} scope="col">
                    Course {i + 1}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.stops.map((s, row) => (
                <tr key={`${s.id}-${row}`}>
                  <th scope="row">{s.name}</th>
                  {data.trips.map((t) => (
                    <td key={t.tripId}>{t.times[row] ?? "|"}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
