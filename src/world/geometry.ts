/** Axis-aligned rectangle in virtual-desktop DIP coordinates. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A closed interval [a, b] with a ≤ b. */
export type Interval = readonly [number, number];

export const right = (r: Rect): number => r.x + r.width;
export const bottom = (r: Rect): number => r.y + r.height;

export function containsPoint(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x < right(r) && y >= r.y && y < bottom(r);
}

export function intersects(a: Rect, b: Rect): boolean {
  return a.x < right(b) && b.x < right(a) && a.y < bottom(b) && b.y < bottom(a);
}

export function sameRect(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

/** Remove `cut` from every interval in `list` (intervals shorter than `minLen` are dropped). */
export function subtractInterval(list: readonly Interval[], cut: Interval, minLen = 0): Interval[] {
  const out: Interval[] = [];
  for (const [a, b] of list) {
    if (cut[1] <= a || cut[0] >= b) {
      out.push([a, b]);
      continue;
    }
    if (cut[0] - a > minLen) out.push([a, cut[0]]);
    if (b - cut[1] > minLen) out.push([cut[1], b]);
  }
  return out;
}

/** Intersect every interval in `list` with `keep`. */
export function clipIntervals(list: readonly Interval[], keep: Interval): Interval[] {
  const out: Interval[] = [];
  for (const [a, b] of list) {
    const lo = Math.max(a, keep[0]);
    const hi = Math.min(b, keep[1]);
    if (hi > lo) out.push([lo, hi]);
  }
  return out;
}

/** Union of intervals, sorted and merged (touching intervals merge). */
export function mergeIntervals(list: readonly Interval[]): Interval[] {
  const sorted = [...list].sort((p, q) => p[0] - q[0]);
  const out: [number, number][] = [];
  for (const [a, b] of sorted) {
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}
