import { useMemo } from "react";
import { Link } from "react-router";
import type { Line } from "@bus-hub/shared";
import { useLines } from "../lib/api";

type BadgeProps = {
  shortName: string;
  color: string;
  textColor: string;
  size?: "sm" | "md" | "lg";
  to?: string;
  title?: string;
};

export function LineBadge({ shortName, color, textColor, size = "md", to, title }: BadgeProps) {
  const style = { background: color, color: textColor };
  const cls = `line-badge line-badge--${size}`;
  const label = title ?? `Ligne ${shortName}`;
  return to ? (
    <Link to={to} className={cls} style={style} title={label} aria-label={label}>
      {shortName}
    </Link>
  ) : (
    <span className={cls} style={style} title={label} aria-label={label}>
      {shortName}
    </span>
  );
}

/** Dictionnaire id → ligne, partagé via le cache react-query. */
export function useLineMap(): Map<string, Line> {
  const { data } = useLines();
  return useMemo(() => new Map((data ?? []).map((l) => [l.id, l])), [data]);
}

export function LineBadges({ ids, size = "sm", link = false }: { ids: string[]; size?: BadgeProps["size"]; link?: boolean }) {
  const lines = useLineMap();
  return (
    <span className="line-badges">
      {ids.map((id) => {
        const l = lines.get(id);
        if (!l) return null;
        return <LineBadge key={id} shortName={l.shortName} color={l.color} textColor={l.textColor} size={size} to={link ? `/lignes/${encodeURIComponent(id)}` : undefined} />;
      })}
    </span>
  );
}
