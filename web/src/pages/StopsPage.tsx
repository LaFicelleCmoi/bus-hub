import { useDeferredValue, useMemo, useState } from "react";
import { Link } from "react-router";
import { DepartureList } from "../components/DepartureList";
import { Icon } from "../components/Icon";
import { StationItem } from "../components/StationItem";
import { Empty, ErrorState, Loading } from "../components/States";
import { useFavorites } from "../hooks/useFavorites";
import { useGeolocation } from "../hooks/useGeolocation";
import { useDepartures, useNearby, useStationSearch, useStations } from "../lib/api";

export function StopsPage() {
  const [q, setQ] = useState("");
  const query = useDeferredValue(q.trim());
  const search = useStationSearch(query);
  const geo = useGeolocation();
  const nearby = useNearby(geo.pos);
  const { ids: favIds } = useFavorites();

  return (
    <div className="page">
      <header className="page__head">
        <h1>Arrêts</h1>
        <p className="muted">Prochains passages à un arrêt du réseau</p>
      </header>

      <div className="search-row">
        <label className="search">
          <Icon name="search" />
          <input type="search" placeholder="Nom d'arrêt ou commune…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher un arrêt" autoFocus />
        </label>
        <button type="button" className="btn btn--primary" onClick={geo.locate} disabled={geo.status === "loading"}>
          <Icon name="locate" size={18} />
          <span>Autour de moi</span>
        </button>
      </div>

      {query.length >= 2 ? (
        <section className="section">
          <h2 className="section__title">Résultats</h2>
          {search.isLoading && <Loading />}
          {search.error && <ErrorState error={search.error} />}
          {search.data && search.data.length === 0 && <Empty icon="search">Aucun arrêt ne correspond à « {query} ».</Empty>}
          <ul className="list">{search.data?.map((s) => <StationItem key={s.id} station={s} />)}</ul>
        </section>
      ) : (
        <>
          {(geo.status !== "idle" || nearby.data) && (
            <section className="section">
              <h2 className="section__title">À proximité</h2>
              {(geo.status === "loading" || nearby.isLoading) && <Loading label="Localisation…" />}
              {geo.error && <Empty icon="locate">{geo.error}</Empty>}
              {nearby.data && nearby.data.length === 0 && <Empty icon="stop">Aucun arrêt du réseau à moins d'1 km.</Empty>}
              <ul className="list">{nearby.data?.map((s) => <StationItem key={s.id} station={s} distance={s.distance} />)}</ul>
            </section>
          )}

          <section className="section">
            <h2 className="section__title">Mes arrêts favoris</h2>
            {favIds.length === 0 ? (
              <Empty icon="star">Ajoutez un arrêt en favori avec l'étoile pour retrouver ses départs ici.</Empty>
            ) : (
              <div className="fav-grid">
                {favIds.map((id) => (
                  <FavoriteBoard key={id} id={id} />
                ))}
              </div>
            )}
          </section>

          <PopularStations />
        </>
      )}
    </div>
  );
}

function FavoriteBoard({ id }: { id: string }) {
  const { data, error } = useDepartures(id, 4);
  if (error) return null; // arrêt supprimé du GTFS : on l'ignore
  return (
    <article className="card">
      <Link to={`/arrets/${encodeURIComponent(id)}`} className="card__title">
        <Icon name="star" filled size={16} className="star" />
        {data?.station.name ?? "…"}
        <span className="muted small">{data?.station.city}</span>
      </Link>
      {data ? data.departures.length ? <DepartureList departures={data.departures} compact /> : <p className="muted small">Pas de départ prévu.</p> : <Loading />}
    </article>
  );
}

function PopularStations() {
  const { data } = useStations();
  const top = useMemo(() => [...(data ?? [])].sort((a, b) => b.lineIds.length - a.lineIds.length).slice(0, 6), [data]);
  if (!top.length) return null;
  return (
    <section className="section">
      <h2 className="section__title">Pôles d'échanges</h2>
      <ul className="list">
        {top.map((s) => (
          <StationItem key={s.id} station={s} />
        ))}
      </ul>
    </section>
  );
}
