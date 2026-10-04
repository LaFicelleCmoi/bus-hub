import { useMemo } from "react";
import { Polyline } from "react-leaflet";
import { useSearchParams } from "react-router";
import { BaseMap, FitBounds, FlyTo } from "../components/map/BaseMap";
import { StationLayer } from "../components/map/StationLayer";
import { UserLocation } from "../components/map/UserLocation";
import { VehicleLayer } from "../components/map/VehicleLayer";
import { Icon } from "../components/Icon";
import { LineBadge } from "../components/LineBadge";
import { RealtimeStatus } from "../components/RealtimeStatus";
import { useGeolocation } from "../hooks/useGeolocation";
import { useLines, useMeta, useShapes, useStations, useVehicles } from "../lib/api";

export function MapPage() {
  const [params, setParams] = useSearchParams();
  const selected = params.get("ligne");
  const { data: meta } = useMeta();
  const { data: lines } = useLines();
  const { data: shapes } = useShapes();
  const { data: stations } = useStations();
  const { data: vehiclesRes } = useVehicles();
  const geo = useGeolocation({ watch: true });

  const vehicles = vehiclesRes?.vehicles ?? [];
  const runningByLine = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of vehicles) m.set(v.lineId, (m.get(v.lineId) ?? 0) + 1);
    return m;
  }, [vehicles]);

  const visibleVehicles = selected ? vehicles.filter((v) => v.lineId === selected) : vehicles;
  const selectedShape = shapes?.find((s) => s.lineId === selected);
  const selectedBounds = selectedShape ? (selectedShape.paths.flat() as [number, number][]) : null;

  const select = (id: string | null) => setParams(id ? { ligne: id } : {}, { replace: true });

  return (
    <div className="map-page">
      <BaseMap className="map--full">
        {meta && <FitBounds bounds={meta.bounds} fitKey="network" maxZoom={13} />}
        {selectedBounds && selectedBounds.length > 0 && <FitBounds bounds={selectedBounds} fitKey={`line-${selected}`} />}
        <FlyTo to={geo.pos ? [geo.pos.lat, geo.pos.lon] : null} trigger={geo.requestId} />

        {shapes?.map((s) => {
          const isSel = s.lineId === selected;
          const dim = !!selected && !isSel;
          return s.paths.map((path, i) => (
            <Polyline
              key={`${s.lineId}-${i}`}
              positions={path}
              pathOptions={{ color: s.color, weight: isSel ? 6 : 3, opacity: dim ? 0.12 : isSel ? 0.95 : 0.55, className: "line-path" }}
              eventHandlers={{ click: () => select(s.lineId) }}
            />
          ));
        })}

        {stations && <StationLayer stations={stations} highlight={selected} />}
        <VehicleLayer vehicles={visibleVehicles} highlightLine={selected} />
        {geo.pos && <UserLocation pos={geo.pos} />}
      </BaseMap>

      <section className="map-panel" aria-label="Filtres de la carte">
        <div className="map-panel__head">
          <div>
            <h1 className="map-panel__title">Bus en circulation</h1>
            <p className="map-panel__sub">
              <strong>{visibleVehicles.length}</strong> bus {selected ? "sur cette ligne" : "sur le réseau"}
            </p>
          </div>
          <RealtimeStatus info={meta?.realtime.siri} live={vehicles.some((v) => v.source === "gps")} />
        </div>
        <div className="chips" role="listbox" aria-label="Choisir une ligne">
          <button type="button" role="option" aria-selected={!selected} className={`chip ${!selected ? "is-active" : ""}`} onClick={() => select(null)}>
            Toutes
          </button>
          {lines?.map((l) => (
            <button
              key={l.id}
              type="button"
              role="option"
              aria-selected={selected === l.id}
              className={`chip chip--line ${selected === l.id ? "is-active" : ""}`}
              onClick={() => select(selected === l.id ? null : l.id)}
              title={l.longName}
            >
              <LineBadge shortName={l.shortName} color={l.color} textColor={l.textColor} size="sm" />
              {runningByLine.get(l.id) ? <span className="chip__count">{runningByLine.get(l.id)}</span> : null}
            </button>
          ))}
        </div>
        <p className="map-panel__note">
          <Icon name="info" size={14} /> Positions estimées à partir des horaires théoriques : le flux officiel ne publie pas encore la position GPS des bus.
        </p>
      </section>

      <button type="button" className={`fab ${geo.status === "ok" ? "fab--active" : ""}`} onClick={geo.locate} title="Me localiser" aria-label="Me localiser">
        {geo.status === "loading" ? <span className="spinner" /> : <Icon name="locate" />}
      </button>
      {geo.error && (
        <p className="toast" role="alert">
          {geo.error}
        </p>
      )}
    </div>
  );
}
