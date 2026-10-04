import type { RealtimeInfo } from "@bus-hub/shared";
import { Icon } from "./Icon";

const LABELS: Record<RealtimeInfo["state"], string> = {
  ok: "Temps réel actif",
  degraded: "Horaires théoriques",
  unavailable: "Horaires théoriques",
  disabled: "Horaires théoriques",
};

/** Pastille d'état du temps réel, avec l'explication en infobulle. */
export function RealtimeStatus({ info, live }: { info: RealtimeInfo | undefined; live?: boolean }) {
  if (!info) return null;
  const isLive = live ?? info.state === "ok";
  return (
    <span className={`rt-status ${isLive ? "rt-status--live" : ""}`} title={info.message}>
      <Icon name={isLive ? "live" : "clock"} size={16} />
      {isLive ? LABELS.ok : LABELS[info.state]}
    </span>
  );
}
