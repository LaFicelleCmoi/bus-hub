import { AlertCard } from "../components/AlertCard";
import { Icon } from "../components/Icon";
import { Empty, ErrorState, Loading } from "../components/States";
import { useAlerts } from "../lib/api";
import { formatTime } from "../lib/time";

export function AlertsPage() {
  const { data, isLoading, error, refetch } = useAlerts();
  const official = data?.alerts.filter((a) => a.scope === "official") ?? [];
  const network = data?.alerts.filter((a) => a.scope === "network") ?? [];
  const nearby = data?.alerts.filter((a) => a.scope === "nearby") ?? [];

  return (
    <div className="page">
      <header className="page__head">
        <h1>Info trafic</h1>
        <p className="muted">
          {data?.official.fetchedAt ? `Infos officielles de lignes-agglo.fr, mises à jour à ${formatTime(data.official.fetchedAt)}` : " "}
        </p>
      </header>

      {isLoading && <Loading />}
      {error && <ErrorState error={error} onRetry={() => refetch()} />}

      {data && (
        <>
          <section className="section stack">
            <h2 className="section__title">Infos officielles du réseau</h2>
            {data.official.error && <ErrorState error={new Error(data.official.error)} onRetry={() => refetch()} />}
            {!data.official.error && official.length === 0 && <Empty icon="info">Aucune info trafic publiée par le réseau.</Empty>}
            {official.map((a) => (
              <AlertCard key={a.id} alert={a} />
            ))}
            <a className="btn btn--ghost" href="https://lignes-agglo.fr/infos-trafic/" target="_blank" rel="noreferrer noopener">
              Voir la page officielle Infos trafic
            </a>
          </section>

          {network.length > 0 && (
            <section className="section stack">
              <h2 className="section__title">Flux temps réel de la Métropole</h2>
              {network.map((a) => (
                <AlertCard key={a.id} alert={a} />
              ))}
            </section>
          )}

          {nearby.length > 0 && (
            <section className="section stack">
              <h2 className="section__title">Autres réseaux, secteur d'Aubagne</h2>
              {nearby.map((a) => (
                <AlertCard key={a.id} alert={a} collapsed />
              ))}
            </section>
          )}

          {data.error && (
            <p className="muted small note">
              <Icon name="info" size={14} /> Le flux d'alertes de la Métropole est momentanément inaccessible depuis ce serveur ; l'info officielle ci-dessus reste à jour.
            </p>
          )}
        </>
      )}
    </div>
  );
}
