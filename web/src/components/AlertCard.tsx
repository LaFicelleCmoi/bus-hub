import type { Alert } from "@bus-hub/shared";
import { formatDateTime, formatDay } from "../lib/time";
import { Icon } from "./Icon";
import { LineBadges } from "./LineBadge";

const EFFECTS: Record<string, string> = {
  NO_SERVICE: "Service interrompu",
  REDUCED_SERVICE: "Service réduit",
  SIGNIFICANT_DELAYS: "Retards importants",
  DETOUR: "Déviation",
  ADDITIONAL_SERVICE: "Service renforcé",
  MODIFIED_SERVICE: "Service modifié",
  STOP_MOVED: "Arrêt déplacé",
  NO_EFFECT: "Information",
  ACCESSIBILITY_ISSUE: "Accessibilité",
};

function period(p: Alert["activePeriods"][number]): string {
  if (p.start && p.end) return `du ${formatDateTime(p.start)} au ${formatDateTime(p.end)}`;
  if (p.start) return `à partir du ${formatDateTime(p.start)}`;
  if (p.end) return `jusqu'au ${formatDateTime(p.end)}`;
  return "";
}

const SCOPE_LABEL: Record<Alert["scope"], string> = {
  official: "Officiel · lignes-agglo.fr",
  network: "Lignes de l'Agglo · flux Métropole",
  nearby: "Réseau voisin, secteur d'Aubagne",
};

export function AlertCard({ alert, collapsed = false }: { alert: Alert; collapsed?: boolean }) {
  const effect = alert.effect ? EFFECTS[alert.effect] : null;
  return (
    <article className={`alert-card ${alert.scope === "official" ? "alert-card--official" : ""} ${alert.isActive ? "" : "alert-card--upcoming"}`}>
      <header className="alert-card__head">
        <Icon name="alert" />
        <div>
          <h3>{alert.header || "Perturbation"}</h3>
          <p className="alert-card__tags">
            {effect && <span className="tag">{effect}</span>}
            <span className={`tag ${alert.scope === "official" ? "tag--official" : "tag--muted"}`}>{SCOPE_LABEL[alert.scope]}</span>
            {alert.publishedAt && <span className="tag tag--muted">Publié le {formatDay(alert.publishedAt)}</span>}
            {!alert.isActive && <span className="tag tag--muted">À venir / terminée</span>}
          </p>
        </div>
      </header>
      {alert.lineIds.length > 0 && <LineBadges ids={alert.lineIds} link />}
      {!collapsed && alert.description && <p className="alert-card__desc">{alert.description}</p>}
      {collapsed && alert.description && (
        <details>
          <summary>Détails</summary>
          <p className="alert-card__desc">{alert.description}</p>
        </details>
      )}
      {alert.activePeriods.length > 0 && <p className="alert-card__period">{alert.activePeriods.map(period).filter(Boolean).join(" · ")}</p>}
      {alert.url && (
        <a href={alert.url} target="_blank" rel="noreferrer noopener">
          {alert.scope === "official" ? "Lire sur lignes-agglo.fr" : "En savoir plus"}
        </a>
      )}
    </article>
  );
}
