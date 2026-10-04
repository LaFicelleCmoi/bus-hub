import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

export function Loading({ label = "Chargement…" }: { label?: string }) {
  return (
    <div className="state" role="status">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="state state--error" role="alert">
      <Icon name="alert" />
      <span>{error instanceof Error ? error.message : "Une erreur est survenue."}</span>
      {onRetry && (
        <button type="button" className="btn btn--ghost" onClick={onRetry}>
          Réessayer
        </button>
      )}
    </div>
  );
}

export function Empty({ icon = "info", children }: { icon?: IconName; children: ReactNode }) {
  return (
    <div className="state state--empty">
      <Icon name={icon} />
      <span>{children}</span>
    </div>
  );
}
