import {
  bottom,
  clipIntervals,
  containsPoint,
  mergeIntervals,
  right,
  subtractInterval,
  type Interval,
  type Rect,
} from './geometry';

/**
 * The desktop as the pets see it: displays, visible windows, and the surfaces and walls derived
 * from them. Pure data in virtual-desktop DIP coordinates; rebuilt whenever the desktop changes.
 */

export interface DisplayInfo {
  id: number;
  /** Full display bounds. */
  bounds: Rect;
  /** Bounds minus taskbar/dock: the floor is this rectangle's bottom edge. */
  workArea: Rect;
  primary?: boolean;
}

export interface WindowInfo {
  /** Stable for the window's lifetime (a handle, not a title). */
  id: string;
  bounds: Rect;
}

export interface WorldSnapshot {
  displays: DisplayInfo[];
  /** Visible windows, top-most first (z-order). */
  windows: WindowInfo[];
  /** Areas pets must not rest in (notification corner, user-defined zones). */
  safeZones: Rect[];
}

/** A horizontal walkable segment: a floor or the visible part of a window's top edge. */
export interface Surface {
  id: string;
  x1: number;
  x2: number;
  y: number;
  /** Window this surface belongs to (null for floors). */
  windowId: string | null;
  /** Parts a pet may cross but must not stop in (safe zones). */
  avoid: Interval[];
}

/** A climbable vertical segment: the visible part of a window's side. */
export interface Wall {
  id: string;
  x: number;
  y1: number;
  y2: number;
  /** Which side of its window: −1 the left side (pet clings from the left), +1 the right side. */
  side: -1 | 1;
  windowId: string;
}

/** Room a pet needs above a surface (a window flush with the top of the screen has none). */
export const HEADROOM = 70;
/** Shorter visible bits of a window top are not worth standing on. */
export const MIN_SURFACE = 44;
const MIN_WALL = 50;
/** A pet's body reaches this far above its feet when checking safe zones. */
const BODY_HEIGHT = 110;

export class World {
  readonly displays: readonly DisplayInfo[];
  readonly windows: readonly WindowInfo[];
  readonly safeZones: readonly Rect[];
  readonly surfaces: readonly Surface[];
  readonly walls: readonly Wall[];
  /** Bounding box of every display. */
  readonly desktop: Rect;
  private readonly windowById: Map<string, WindowInfo>;

  constructor(snap: WorldSnapshot) {
    this.displays = snap.displays;
    this.windows = snap.windows;
    this.safeZones = snap.safeZones;
    this.windowById = new Map(snap.windows.map((w) => [w.id, w]));
    this.desktop = boundingBox(snap.displays.map((d) => d.bounds));
    this.surfaces = buildSurfaces(snap);
    this.walls = buildWalls(snap);
  }

  static empty(): World {
    return new World({ displays: [], windows: [], safeZones: [] });
  }

  window(id: string): WindowInfo | undefined {
    return this.windowById.get(id);
  }

  displayAt(x: number, y: number): DisplayInfo | null {
    return this.displays.find((d) => containsPoint(d.bounds, x, y)) ?? null;
  }

  /** The display containing the point, or the nearest one. */
  nearestDisplay(x: number, y: number): DisplayInfo | null {
    let best: DisplayInfo | null = null;
    let bestD = Infinity;
    for (const d of this.displays) {
      const b = d.bounds;
      const dx = Math.max(b.x - x, 0, x - right(b));
      const dy = Math.max(b.y - y, 0, y - bottom(b));
      const dist = dx * dx + dy * dy;
      if (dist < bestD) {
        best = d;
        bestD = dist;
      }
    }
    return best;
  }

  /** Horizontal extent of the desktop at height `y` (merged across displays). */
  spansAt(y: number): Interval[] {
    return mergeIntervals(
      this.displays
        .filter((d) => y >= d.bounds.y && y <= bottom(d.bounds))
        .map((d) => [d.bounds.x, right(d.bounds)] as Interval),
    );
  }

  surface(id: string): Surface | undefined {
    return this.surfaces.find((s) => s.id === id);
  }

  /** Surface the point is standing on (within `tolerance` px vertically). */
  surfaceAt(x: number, y: number, tolerance = 1.5): Surface | null {
    let best: Surface | null = null;
    for (const s of this.surfaces) {
      if (x < s.x1 || x > s.x2 || Math.abs(s.y - y) > tolerance) continue;
      if (!best || s.y < best.y) best = s;
    }
    return best;
  }

  /** Highest surface crossed when moving down from `y0` to `y1` at `x` (one-way platforms). */
  landingBetween(x: number, y0: number, y1: number): Surface | null {
    let best: Surface | null = null;
    for (const s of this.surfaces) {
      if (x < s.x1 || x > s.x2) continue;
      if (s.y < y0 - 0.5 || s.y > y1) continue;
      if (!best || s.y < best.y) best = s;
    }
    return best;
  }

  /** The lowest floor at `x` (fallback when something drops below everything). */
  floorAt(x: number): Surface | null {
    let best: Surface | null = null;
    for (const s of this.surfaces) {
      if (s.windowId !== null || x < s.x1 || x > s.x2) continue;
      if (!best || s.y > best.y) best = s;
    }
    return best;
  }

  /** True if `x` on `s` is inside one of its avoid ranges (a safe zone). */
  isAvoided(s: Surface, x: number): boolean {
    return s.avoid.some(([a, b]) => x >= a && x <= b);
  }

  /** Parts of a surface a pet may rest on, shrunk by `margin` at both ends. */
  restSpans(s: Surface, margin = 0): Interval[] {
    let spans: Interval[] = [[s.x1 + margin, s.x2 - margin]];
    for (const z of s.avoid) spans = subtractInterval(spans, [z[0] - margin, z[1] + margin]);
    return spans.filter(([a, b]) => b > a);
  }
}

function boundingBox(rects: readonly Rect[]): Rect {
  if (rects.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  const x2 = Math.max(...rects.map(right));
  const y2 = Math.max(...rects.map(bottom));
  return { x, y, width: x2 - x, height: y2 - y };
}

/** Horizontal ranges where a pet standing at height `y` is clear of every safe zone. */
function zoneCuts(zones: readonly Rect[], y: number): Interval[] {
  return zones
    .filter((z) => y > z.y && y - BODY_HEIGHT < bottom(z))
    .map((z) => [z.x, right(z)] as Interval);
}

function buildSurfaces(snap: WorldSnapshot): Surface[] {
  const out: Surface[] = [];
  const add = (spans: Interval[], y: number, windowId: string | null, prefix: string) => {
    for (const [a, b] of mergeIntervals(spans)) {
      if (b - a < MIN_SURFACE) continue;
      const avoid = clipIntervals(mergeIntervals(zoneCuts(snap.safeZones, y)), [a, b] as Interval);
      out.push({
        id: `${prefix}:${Math.round(a)}:${Math.round(y)}`,
        x1: a,
        x2: b,
        y,
        windowId,
        avoid,
      });
    }
  };

  // Floors: the bottom of each work area. Neighbouring displays at the same height join up.
  const floorsByY = new Map<number, Interval[]>();
  for (const d of snap.displays) {
    const y = bottom(d.workArea);
    const list = floorsByY.get(y) ?? [];
    list.push([d.workArea.x, right(d.workArea)]);
    floorsByY.set(y, list);
  }
  for (const [y, spans] of floorsByY) add(spans, y, null, 'floor');

  // Window tops: visible where no window above covers the edge and there's room above.
  snap.windows.forEach((w, i) => {
    const y = w.bounds.y;
    let spans: Interval[] = [];
    for (const d of snap.displays) {
      const wa = d.workArea;
      if (y < wa.y + HEADROOM || y >= bottom(wa)) continue;
      spans.push(...clipIntervals([[w.bounds.x, right(w.bounds)]], [wa.x, right(wa)]));
    }
    for (let j = 0; j < i && spans.length; j++) {
      const above = snap.windows[j]!.bounds;
      if (above.y <= y && bottom(above) > y) {
        spans = subtractInterval(spans, [above.x, right(above)]);
      }
    }
    add(spans, y, w.id, `win:${w.id}`);
  });
  return out;
}

function buildWalls(snap: WorldSnapshot): Wall[] {
  const out: Wall[] = [];
  snap.windows.forEach((w, i) => {
    for (const side of [-1, 1] as const) {
      const x = side < 0 ? w.bounds.x : right(w.bounds);
      let spans: Interval[] = [];
      for (const d of snap.displays) {
        const wa = d.workArea;
        if (x <= wa.x || x >= right(wa)) continue;
        spans.push(...clipIntervals([[w.bounds.y, bottom(w.bounds)]], [wa.y, bottom(wa)]));
      }
      for (let j = 0; j < i && spans.length; j++) {
        const above = snap.windows[j]!.bounds;
        if (above.x <= x && right(above) >= x) {
          spans = subtractInterval(spans, [above.y, bottom(above)]);
        }
      }
      for (const [a, b] of mergeIntervals(spans)) {
        if (b - a < MIN_WALL) continue;
        out.push({
          id: `wall:${w.id}:${side}:${Math.round(a)}`,
          x,
          y1: a,
          y2: b,
          side,
          windowId: w.id,
        });
      }
    }
  });
  return out;
}
