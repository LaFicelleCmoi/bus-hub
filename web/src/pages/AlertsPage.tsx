import { AlertCard } from "../components/AlertCard";
import { Empty, ErrorState, Loading } from "../components/States";
import { useAlerts } from "../lib/api";
import { formatTime } from "../lib/time";

export function AlertsPage() {
  const { data, isLoading, error, refetch } = useAlerts();
  const network = data?.alerts.filter((a) => a.scope === "network") ?? [];
  const nearby = data?.alerts.filter((a) => a.scope === "nearby") ?? [];

  return (
    <div className="page">
      <header className="page__head">
        <h1>Info trafic</h1>
        <p className="muted">{data?.fetchedAt ? `Mise à jour à ${formatTime(data.fetchedAt)}` : " "}</p>
      </header>

      {isLoading && <Loading />}
      {error && <ErrorState error={error} onRetry={() => refetch()} />}
      {data?.error && <ErrorState error={new Error(data.error)} />}

      {data && (
        <>
          <section className="section stack">
            <h2 className="section__title">Lignes de l'Agglo</h2>
            {network.length === 0 ? <Empty icon="info">Aucune perturbation signalée sur le réseau.</Empty> : network.map((a) => <AlertCard key={a.id} alert={a} />)}
          </section>
          {nearby.length > 0 && (
            <section className="section stack">
              <h2 className="section__title">Autres réseaux, secteur d'Aubagne</h2>
              {nearby.map((a) => (
                <AlertCard key={a.id} alert={a} collapsed />
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
