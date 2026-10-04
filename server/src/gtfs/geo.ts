import type { LatLon } from "@bus-hub/shared";

const R = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;

export function haversine(a: LatLon, b: LatLon): number {
  const dLat = rad(b[0] - a[0]);
  const dLon = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function bearing(a: LatLon, b: LatLon): number {
  const y = Math.sin(rad(b[1] - a[1])) * Math.cos(rad(b[0]));
  const x = Math.cos(rad(a[0])) * Math.sin(rad(b[0])) - Math.sin(rad(a[0])) * Math.cos(rad(b[0])) * Math.cos(rad(b[1] - a[1]));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Polyligne avec distances cumulées, pour interpoler une position le long d'un tracé. */
export class Polyline {
  readonly points: LatLon[];
  readonly cumulative: number[];

  constructor(points: LatLon[]) {
    this.points = points;
    this.cumulative = [0];
    for (let i = 1; i < points.length; i++) {
      this.cumulative.push(this.cumulative[i - 1]! + haversine(points[i - 1]!, points[i]!));
    }
  }

  get length(): number {
    return this.cumulative[this.cumulative.length - 1] ?? 0;
  }

  /** Point (et cap) à la distance `d` depuis le début du tracé. */
  at(d: number): { point: LatLon; bearing: number | null } {
    const pts = this.points;
    if (pts.length === 0) return { point: [0, 0], bearing: null };
    if (pts.length === 1 || d <= 0) return { point: pts[0]!, bearing: pts.length > 1 ? bearing(pts[0]!, pts[1]!) : null };
    if (d >= this.length) return { point: pts[pts.length - 1]!, bearing: bearing(pts[pts.length - 2]!, pts[pts.length - 1]!) };

    let lo = 0;
    let hi = this.cumulative.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.cumulative[mid]! <= d) lo = mid;
      else hi = mid;
    }
    const a = pts[lo]!;
    const b = pts[hi]!;
    const seg = this.cumulative[hi]! - this.cumulative[lo]!;
    const f = seg > 0 ? (d - this.cumulative[lo]!) / seg : 0;
    return { point: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], bearing: bearing(a, b) };
  }

  /**
   * Projette une suite de points (les arrêts, dans l'ordre) sur le tracé, en avançant
   * de façon monotone pour ne pas « accrocher » un passage antérieur du même tracé (boucles).
   */
  projectSequence(seq: LatLon[]): number[] {
    const out: number[] = [];
    let from = 0;
    const pts = this.points;
    for (const p of seq) {
      let best = Infinity;
      let bestDist = this.cumulative[from] ?? 0;
      let bestSeg = from;
      const cosLat = Math.cos(rad(p[0]));
      for (let i = from; i < pts.length - 1; i++) {
        const a = pts[i]!;
        const b = pts[i + 1]!;
        // Projection plane locale (équirectangulaire), largement suffisante à l'échelle d'un segment
        const ax = (a[1] - p[1]) * cosLat, ay = a[0] - p[0];
        const bx = (b[1] - p[1]) * cosLat, by = b[0] - p[0];
        const dx = bx - ax, dy = by - ay;
        const len2 = dx * dx + dy * dy;
        const t = len2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
        const px = ax + t * dx, py = ay + t * dy;
        const d2 = px * px + py * py;
        if (d2 < best - 1e-14) {
          best = d2;
          bestSeg = i;
          bestDist = this.cumulative[i]! + t * (this.cumulative[i + 1]! - this.cumulative[i]!);
        }
      }
      out.push(bestDist);
      from = bestSeg;
    }
    return out;
  }
}
