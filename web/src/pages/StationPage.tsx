import { useMemo, useState } from "react";
import { CircleMarker } from "react-leaflet";
import { Link, useParams } from "react-router";
import { AlertCard } from "../components/AlertCard";
import { DepartureList } from "../components/DepartureList";
import { FavoriteButton } from "../components/FavoriteButton";
import { Icon } from "../components/Icon";
import { LineBadge, useLineMap } from "../components/LineBadge";
import { BaseMap } from "../components/map/BaseMap";
import { RealtimeStatus } from "../components/RealtimeStatus";
import { Empty, ErrorState, Loading } from "../components/States";
import { useAlerts, useDepartures } from "../lib/api";
import { formatTime } from "../lib/time";

export function StationPage() {
  const { id = "" } = useParams();
  const { data, isLoading, error, refetch, dataUpdatedAt, isFetching } = useDepartures(id, 40);
  const { data: alerts } = useAlerts();
  const lineMap = useLineMap();
  const [lineFilter, setLineFilter] = useState<string | null>(null);

  const departures = useMemo(
    () => (data?.departures ?? []).filter((d) => !lineFilter || d.lineId === lineFilter),
    [data, lineFilter],
  );

  if (isLoading) return <Loading label="Recherche des prochains départs…" />;
  if (error || !data) return <ErrorState error={error ?? new Error("Arrêt introuvable")} onRetry={() => refetch()} />;

  const { station } = data;
  const stationAlerts = alerts?.alerts.filter((a) => a.isActive && (a.lineIds.some((l) => station.lineIds.includes(l)) || a.stopIds.some((s) => station.platformIds.includes(s)))) ?? [];
  const live = data.departures.some((d) => d.source === "realtime");

  return (
    <div className="page page--wide">
      <header className="station-head">
        <Link to="/arrets" className="icon-btn" aria-label="Retour aux arrêts">
          <Icon name="back" />
        </Link>
        <div className="station-head__title">
          <h1>{station.name}</h1>
          <p className="muted">
            {station.city}
            {station.wheelchair && (
              <>
                {" · "}
                <Icon name="wheelchair" size={14} /> accessible
              </>
            )}
          </p>
        </div>
        <FavoriteButton id={station.id} />
      </header>

      <div className="station-layout">
        <section className="board" aria-labelledby="board-title">
          <div className="board__head">
            <h2 id="board-title">Prochains départs</h2>
            <RealtimeStatus info={data.realtime} live={live} />
          </div>

          <div className="chips" role="listbox" aria-label="Filtrer par ligne">
            <button type="button" className={`chip ${!lineFilter ? "is-active" : ""}`} onClick={() => setLineFilter(null)}>
              Toutes
            </button>
            {station.lineIds.map((lid) => {
              const l = lineMap.get(lid);
              if (!l) return null;
              return (
                <button key={lid} type="button" className={`chip chip--line ${lineFilter === lid ? "is-active" : ""}`} onClick={() => setLineFilter(lineFilter === lid ? null : lid)}>
                  <LineBadge shortName={l.shortName} color={l.color} textColor={l.textColor} size="sm" />
                </button>
              );
            })}
          </div>

          {departures.length > 0 ? <DepartureList departures={departures} /> : <Empty icon="clock">Aucun départ prévu dans les prochaines 24 heures{lineFilter ? " pour cette ligne" : ""}.</Empty>}

          <p className="muted small board__foot">
            {isFetching ? "Actualisation…" : `Mis à jour à ${formatTime(dataUpdatedAt)}`} · actualisation automatique toutes les 30 s.
            {!live && " Horaires théoriques : le temps réel n'est pas disponible pour cet arrêt."}
          </p>
        </section>

        <aside className="station-side">
          <BaseMap className="map--card map--small" center={[station.lat, station.lon]} zoom={17}>
            <CircleMarker center={[station.lat, station.lon]} radius={9} pathOptions={{ className: "station-dot station-dot--big", weight: 3 }} />
          </BaseMap>
          <a className="btn btn--ghost" href={`https://www.openstreetmap.org/directions?to=${station.lat}%2C${station.lon}`} target="_blank" rel="noreferrer noopener">
            Itinéraire à pied jusqu'à l'arrêt
          </a>
          {stationAlerts.length > 0 && (
            <div className="stack">
              <h2 className="section__title">Info trafic</h2>
              {stationAlerts.map((a) => (
                <AlertCard key={a.id} alert={a} collapsed />
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
