import { Link } from "react-router";
import type { Departure } from "@bus-hub/shared";
import { useNow } from "../hooks/useNow";
import { delayLabel, formatTime, waitLabel } from "../lib/time";
import { Icon } from "./Icon";
import { LineBadge } from "./LineBadge";

export function DepartureList({ departures, compact = false }: { departures: Departure[]; compact?: boolean }) {
  const now = useNow(10_000);
  return (
    <ol className={`departures ${compact ? "departures--compact" : ""}`}>
      {departures.map((d) => {
        const at = d.expected ?? d.aimed;
        const wait = waitLabel(at, now);
        const delay = delayLabel(d.delaySeconds);
        const live = d.source === "realtime";
        return (
          <li key={`${d.tripId}-${d.stopId}`} className="departure">
            <Link to={`/lignes/${encodeURIComponent(d.lineId)}`} className="departure__line" aria-label={`Ligne ${d.lineShortName}`}>
              <LineBadge shortName={d.lineShortName} color={d.lineColor} textColor={d.lineTextColor} />
            </Link>
            <div className="departure__dest">
              <span className="departure__headsign">{d.headsign}</span>
              <span className="departure__meta">
                {formatTime(at)}
                {live && delay && <span className={`delay ${d.delaySeconds! > 60 ? "delay--late" : ""}`}>{delay}</span>}
                {live && d.delaySeconds !== null && Math.abs(d.delaySeconds) >= 60 && <s className="aimed">{formatTime(d.aimed)}</s>}
              </span>
            </div>
            <div className={`departure__wait ${wait.imminent ? "is-imminent" : ""} ${live ? "is-live" : ""}`}>
              {live && <Icon name="live" size={14} className="live-icon" />}
              <span className="departure__wait-main">{wait.main}</span>
              {wait.unit && <span className="departure__wait-unit">{wait.unit}</span>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
