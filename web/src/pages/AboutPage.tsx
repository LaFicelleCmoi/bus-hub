import type { RealtimeState } from "@bus-hub/shared";
import { ErrorState, Loading } from "../components/States";
import { useMeta } from "../lib/api";
import { formatDateTime, gtfsDateLabel } from "../lib/time";

const STATE_LABEL: Record<RealtimeState, string> = {
  ok: "Opérationnel",
  degraded: "Partiel",
  unavailable: "Indisponible",
  disabled: "Désactivé",
};

export function AboutPage() {
  const { data: meta, isLoading, error } = useMeta();
  if (isLoading) return <Loading />;
  if (error || !meta) return <ErrorState error={error} />;
  const siri = meta.realtime.siri;

  return (
    <div className="page">
      <header className="page__head">
        <h1>À propos</h1>
        <p className="muted">{meta.network}</p>
      </header>

      <section className="section">
        <h2 className="section__title">État des données</h2>
        <dl className="kv">
          <dt>Horaires théoriques (GTFS)</dt>
          <dd>
            Version {meta.feedVersion ?? "?"}, valable du {gtfsDateLabel(meta.feedStart)} au {gtfsDateLabel(meta.feedEnd)}
            <br />
            <span className="muted small">
              {meta.counts.lines} lignes · {meta.counts.stations} arrêts · {meta.counts.trips} courses · chargé le {formatDateTime(meta.loadedAt)}
            </span>
          </dd>
          <dt>Temps réel (SIRI)</dt>
          <dd>
            <span className={`dot dot--${siri.state}`} /> {STATE_LABEL[siri.state]}. {siri.message}
            <br />
            <span className="muted small">
              Prochains passages : {STATE_LABEL[siri.stopMonitoring]} · quota local {siri.quotaPerMinute} requêtes/min
              {siri.checkedAt && ` · vérifié le ${formatDateTime(siri.checkedAt)}`}
            </span>
          </dd>
          <dt>Info trafic (GTFS-RT)</dt>
          <dd>
            <span className={`dot dot--${meta.realtime.alerts.state}`} /> {STATE_LABEL[meta.realtime.alerts.state]}
            {meta.realtime.alerts.fetchedAt && <span className="muted small"> · mis à jour le {formatDateTime(meta.realtime.alerts.fetchedAt)}</span>}
          </dd>
        </dl>
      </section>

      <section className="section prose">
        <h2 className="section__title">Comment ça marche</h2>
        <p>
          Les horaires viennent du jeu de données GTFS « Agglobus – Les lignes de l'agglo », publié par la Métropole Aix-Marseille-Provence sur le Point d'Accès National. Il est rechargé automatiquement chaque jour.
        </p>
        <p>
          Les <strong>positions des bus</strong> sur la carte sont <strong>estimées</strong> : chaque course en cours est placée sur son tracé, au prorata de l'heure entre deux arrêts. Le flux SIRI d'Aubagne ne fournit pas aujourd'hui la liste des véhicules, qui exige un identifiant de bus.
        </p>
        <p>
          Les <strong>prochains départs</strong> passent automatiquement en temps réel (icône <em>ondes</em>, retard affiché) dès que le serveur SIRI renvoie les passages d'un arrêt. Sinon, l'horaire théorique s'affiche. Le serveur limite les appels à 10 à 20 par minute : le hub met les réponses en cache et ne dépasse pas {siri.quotaPerMinute} requêtes par minute.
        </p>
      </section>

      <section className="section">
        <h2 className="section__title">Sources et licences</h2>
        <ul className="list list--plain">
          {meta.sources.map((s) => (
            <li key={s.name}>
              <a href={s.url} target="_blank" rel="noreferrer noopener">
                {s.name}
              </a>{" "}
              <span className="muted small">({s.license})</span>
            </li>
          ))}
        </ul>
        <p className="muted small">Application non officielle. Les données sont fournies sans garantie : en cas de doute, consultez le site officiel lignes-agglo.fr.</p>
      </section>
    </div>
  );
}
