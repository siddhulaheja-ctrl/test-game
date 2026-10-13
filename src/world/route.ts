import type { Surface, Wall, World } from './world';

/** How far a pet can get around, in px (already scaled for its size). */
export interface Reach {
  /** Half the pet's width: keeps feet this far from the ends of a surface. */
  halfWidth: number;
  /** Highest a jump can climb. */
  jumpUp: number;
  /** Widest gap a jump can cross. */
  jumpAcross: number;
  canClimb: boolean;
  walkSpeed: number;
  climbSpeed: number;
}

export interface Spot {
  surface: Surface;
  x: number;
}

/** One leg of a route. Each leg starts by walking along the current surface to `x`. */
export type Step =
  | { kind: 'walk'; x: number; surface: Surface }
  | { kind: 'jump'; x: number; to: { x: number; y: number }; surface: Surface }
  | { kind: 'climb'; x: number; wall: Wall; to: { x: number; y: number }; surface: Surface };

interface Edge {
  to: Spot;
  step: Step;
  cost: number;
}

/** Seconds a jump "costs" on top of its flight, so short walks beat needless hops. */
const JUMP_PENALTY = 0.9;
const CLIMB_PENALTY = 1.6;

/**
 * Cheapest route from one spot to another, or null if unreachable.
 * Dijkstra over (surface, x) states; the desktop has few surfaces, so this stays tiny.
 */
export function planRoute(world: World, from: Spot, target: Spot, reach: Reach): Step[] | null {
  if (from.surface.id === target.surface.id) {
    return [{ kind: 'walk', x: target.x, surface: target.surface }];
  }
  const dist = new Map<string, number>([[from.surface.id, 0]]);
  const prev = new Map<string, { from: string; step: Step }>();
  const at = new Map<string, Spot>([[from.surface.id, from]]);
  const open = new Set<string>([from.surface.id]);
  const done = new Set<string>();

  while (open.size) {
    let cur = '';
    let best = Infinity;
    for (const id of open) {
      const d = dist.get(id)!;
      if (d < best) {
        best = d;
        cur = id;
      }
    }
    open.delete(cur);
    if (done.has(cur)) continue;
    done.add(cur);
    if (cur === target.surface.id) break;
    const spot = at.get(cur)!;
    for (const e of edgesFrom(world, spot, reach)) {
      const id = e.to.surface.id;
      if (done.has(id)) continue;
      const walk = Math.abs(e.step.x - spot.x) / reach.walkSpeed;
      const d = best + walk + e.cost;
      if (d < (dist.get(id) ?? Infinity)) {
        dist.set(id, d);
        prev.set(id, { from: cur, step: e.step });
        at.set(id, e.to);
        open.add(id);
      }
    }
  }

  if (!prev.has(target.surface.id)) return null;
  const steps: Step[] = [{ kind: 'walk', x: target.x, surface: target.surface }];
  let id = target.surface.id;
  while (id !== from.surface.id) {
    const p = prev.get(id)!;
    steps.unshift(p.step);
    id = p.from;
  }
  return steps;
}

/** Every move out of a spot: jumps and drops to other surfaces, and climbs up window sides. */
export function edgesFrom(world: World, spot: Spot, reach: Reach): Edge[] {
  const A = spot.surface;
  const m = reach.halfWidth;
  const out: Edge[] = [];
  const clampA = (x: number) => Math.min(A.x2 - m * 0.5, Math.max(A.x1 + m * 0.5, x));

  for (const B of world.surfaces) {
    if (B.id === A.id) continue;
    const dy = B.y - A.y; // > 0: B is lower
    if (dy < -reach.jumpUp) continue;
    const lo = Math.max(A.x1, B.x1) + m;
    const hi = Math.min(A.x2, B.x2) - m;

    if (dy < 0 && hi > lo) {
      // B is above and overlaps: jump straight up onto it.
      const x = Math.min(hi, Math.max(lo, spot.x));
      out.push(jump(x, { x, y: B.y }, B, dy));
      continue;
    }
    if (dy > 0) {
      // B is below: walk off an end of A where B continues beyond it.
      if (B.x1 < A.x1 - m && B.x2 > A.x1 - m * 1.6) {
        out.push(jump(A.x1 + m * 0.4, { x: Math.max(B.x1 + m, A.x1 - m * 1.6), y: B.y }, B, dy));
      }
      if (B.x2 > A.x2 + m && B.x1 < A.x2 + m * 1.6) {
        out.push(jump(A.x2 - m * 0.4, { x: Math.min(B.x2 - m, A.x2 + m * 1.6), y: B.y }, B, dy));
      }
    }
    // Gaps to the side.
    const across = reach.jumpAcross + Math.max(0, dy) * 0.5;
    if (B.x1 >= A.x2 && B.x1 - A.x2 <= across) {
      out.push(jump(clampA(A.x2 - m), { x: B.x1 + m, y: B.y }, B, dy));
    } else if (B.x2 <= A.x1 && A.x1 - B.x2 <= across) {
      out.push(jump(clampA(A.x1 + m), { x: B.x2 - m, y: B.y }, B, dy));
    }
  }

  if (reach.canClimb) {
    for (const W of world.walls) {
      const win = world.window(W.windowId);
      if (!win || Math.abs(W.y1 - win.bounds.y) > 1) continue; // wall must reach the window top
      const top = world.surfaces.find(
        (s) =>
          s.windowId === W.windowId &&
          Math.abs(s.y - W.y1) < 1 &&
          (W.side < 0 ? Math.abs(s.x1 - W.x) < 2 : Math.abs(s.x2 - W.x) < 2),
      );
      if (!top || top.y >= A.y - 40) continue;
      // The wall has to come down to (or nearly to) this surface.
      if (W.y2 < A.y - reach.jumpUp * 0.6 || W.y1 > A.y) continue;
      const baseX = W.x + W.side * m * 0.7;
      if (baseX < A.x1 + m * 0.3 || baseX > A.x2 - m * 0.3) continue;
      const to = { x: W.x - W.side * m * 1.2, y: top.y };
      out.push({
        to: { surface: top, x: to.x },
        step: { kind: 'climb', x: baseX, wall: W, to, surface: top },
        cost: CLIMB_PENALTY + (A.y - top.y) / reach.climbSpeed,
      });
    }
  }
  return out;

  function jump(x: number, to: { x: number; y: number }, B: Surface, dy: number): Edge {
    return {
      to: { surface: B, x: to.x },
      step: { kind: 'jump', x, to, surface: B },
      cost: JUMP_PENALTY + Math.abs(to.x - x) / (reach.walkSpeed * 2) + Math.max(0, -dy) / 400,
    };
  }
}
