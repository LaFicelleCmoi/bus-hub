import { useMemo, useState } from "react";
import { Link } from "react-router";
import { Icon } from "../components/Icon";
import { LineBadge } from "../components/LineBadge";
import { ErrorState, Loading } from "../components/States";
import { useLines, useVehicles } from "../lib/api";

/** Familles de lignes, d'après la nomenclature du réseau */
function family(shortName: string): string {
  if (/^\d+$/.test(shortName)) return "Lignes urbaines et interurbaines";
  if (/^\d+S$/i.test(shortName)) return "Lignes scolaires";
  return "Navettes, tram-bus et services spéciaux";
}

export function LinesPage() {
  const { data: lines, isLoading, error, refetch } = useLines();
  const { data: vehicles } = useVehicles();
  const [q, setQ] = useState("");

  const running = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of vehicles?.vehicles ?? []) m.set(v.lineId, (m.get(v.lineId) ?? 0) + 1);
    return m;
  }, [vehicles]);

  const groups = useMemo(() => {
    const nq = q.trim().toLowerCase();
    const filtered = (lines ?? []).filter((l) => !nq || `${l.shortName} ${l.longName} ${l.directions.join(" ")}`.toLowerCase().includes(nq));
    const g = new Map<string, typeof filtered>();
    for (const l of filtered) {
      const f = family(l.shortName);
      g.set(f, [...(g.get(f) ?? []), l]);
    }
    return [...g];
  }, [lines, q]);

  return (
    <div className="page">
      <header className="page__head">
        <h1>Lignes</h1>
        <p className="muted">{lines ? `${lines.length} lignes sur le réseau` : " "}</p>
      </header>

      <label className="search">
        <Icon name="search" />
        <input type="search" placeholder="Numéro, destination…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filtrer les lignes" />
      </label>

      {isLoading && <Loading />}
      {error && <ErrorState error={error} onRetry={() => refetch()} />}

      {groups.map(([name, ls]) => (
        <section key={name} className="section">
          <h2 className="section__title">{name}</h2>
          <ul className="line-grid">
            {ls.map((l) => (
              <li key={l.id}>
                <Link to={`/lignes/${encodeURIComponent(l.id)}`} className="line-card" style={{ "--line": l.color } as React.CSSProperties}>
                  <LineBadge shortName={l.shortName} color={l.color} textColor={l.textColor} size="lg" />
                  <div className="line-card__body">
                    <span className="line-card__dirs">
                      {l.directions.filter(Boolean).join(" ⇄ ") || l.longName}
                    </span>
                    <span className="line-card__name">{l.longName}</span>
                    {running.get(l.id) ? (
                      <span className="line-card__live">
                        <Icon name="bus" size={14} /> {running.get(l.id)} en circulation
                      </span>
                    ) : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
