import { Link } from "react-router";
import type { Station } from "@bus-hub/shared";
import { distanceLabel } from "../lib/time";
import { Icon } from "./Icon";
import { LineBadges } from "./LineBadge";

export function StationItem({ station, distance }: { station: Station; distance?: number }) {
  return (
    <li>
      <Link to={`/arrets/${encodeURIComponent(station.id)}`} className="station-item">
        <div className="station-item__body">
          <span className="station-item__name">
            {station.name}
            {station.wheelchair && <Icon name="wheelchair" size={14} className="muted" />}
          </span>
          <span className="station-item__city">
            {station.city}
            {distance !== undefined && ` · ${distanceLabel(distance)}`}
          </span>
          <LineBadges ids={station.lineIds} />
        </div>
        <Icon name="chevron" className="muted" />
      </Link>
    </li>
  );
}
