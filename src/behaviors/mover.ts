import type { Surface, Wall, World } from '../world/world';

/** Physical size of a pet in px (already scaled for its size setting). */
export interface BodySize {
  halfWidth: number;
  height: number;
  /** px/s². */
  gravity: number;
}

export type Contact =
  /** Standing on a surface; `offset` is x relative to the surface's window (for riding it). */
  | { kind: 'surface'; surface: Surface; offset: number }
  /** Clinging to a window side; `offset` is y relative to the window's top. */
  | { kind: 'wall'; wall: Wall; offset: number }
  | { kind: 'air' }
  | { kind: 'held' };

export type MoverEvent =
  | { type: 'landed'; speed: number; surface: Surface }
  | { type: 'lostFooting' }
  | { type: 'bump'; speed: number }
  | { type: 'carried'; dx: number; dy: number };

const AIR_DRAG = 0.15;
const MAX_FALL = 2600;
/** Throws faster than this are capped (px/s). */
const MAX_THROW = 2400;

/**
 * Where a pet is and how it moves through the world: walking along surfaces, ballistic jumps and
 * falls, clinging to window sides, riding moving windows, and being held and thrown.
 * Feet position (x, y) is in virtual-desktop px.
 */
export class Mover {
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  contact: Contact = { kind: 'air' };
  facing: -1 | 1 = 1;
  /** Current walking speed in px/s (drives the walk cycle); reset every step. */
  walkSpeed = 0;
  /** While held: smoothed hand velocity, used for the throw. */
  private holdV = { x: 0, y: 0 };

  constructor(public size: BodySize) {}

  get onSurface(): Surface | null {
    return this.contact.kind === 'surface' ? this.contact.surface : null;
  }

  get airborne(): boolean {
    return this.contact.kind === 'air';
  }

  /** Put the pet on the surface at (or the first one below) a point, else on the nearest floor. */
  place(world: World, x: number, y: number): void {
    const s = world.surfaceAt(x, y, 2) ?? world.landingBetween(x, y, Infinity) ?? world.floorAt(x);
    this.vx = this.vy = 0;
    if (s) this.stand(world, s, clamp(x, s.x1, s.x2));
    else {
      this.x = x;
      this.y = y;
      this.contact = { kind: 'air' };
    }
  }

  stand(world: World, surface: Surface, x: number): void {
    this.x = x;
    this.y = surface.y;
    this.vx = this.vy = 0;
    const win = surface.windowId ? world.window(surface.windowId) : undefined;
    this.contact = { kind: 'surface', surface, offset: win ? x - win.bounds.x : 0 };
  }

  /**
   * Walk toward `tx` along the current surface. Returns true when there (or when the surface ends).
   * `overhang` lets the feet go past the surface end by that much (peeking off a screen edge).
   */
  walkToward(world: World, tx: number, speed: number, dt: number, overhang = 0): boolean {
    const s = this.onSurface;
    if (!s) return false;
    const margin = this.size.halfWidth * 0.3;
    const lo = s.x1 + margin - overhang;
    const hi = s.x2 - margin + overhang;
    const target = clamp(tx, lo, hi);
    const dx = target - this.x;
    if (Math.abs(dx) < 0.5) {
      this.walkSpeed = 0;
      return true;
    }
    this.facing = dx > 0 ? 1 : -1;
    const step = Math.min(Math.abs(dx), speed * dt);
    this.x += Math.sign(dx) * step;
    this.walkSpeed = speed;
    this.syncOffset(world);
    return Math.abs(target - this.x) < 0.5;
  }

  /** Launch a jump that lands on `to`, peaking `arc` px above the higher end. */
  jumpTo(to: { x: number; y: number }, arc = 40): void {
    const g = this.size.gravity;
    const apex = Math.min(this.y, to.y) - Math.max(arc, Math.abs(to.x - this.x) * 0.22);
    const up = Math.max(1, this.y - apex);
    const down = Math.max(1, to.y - apex);
    const vy = -Math.sqrt(2 * g * up);
    const t = Math.sqrt((2 * up) / g) + Math.sqrt((2 * down) / g);
    this.launch((to.x - this.x) / t, vy);
    if (to.x !== this.x) this.facing = to.x > this.x ? 1 : -1;
  }

  launch(vx: number, vy: number): void {
    this.vx = vx;
    this.vy = vy;
    this.contact = { kind: 'air' };
    this.y -= 0.5; // leave the surface so it doesn't count as a landing straight away
  }

  // --- Held and thrown ---------------------------------------------------------------------------

  grab(): void {
    this.contact = { kind: 'held' };
    this.vx = this.vy = 0;
    this.holdV = { x: 0, y: 0 };
  }

  /** Move with the hand while held. */
  holdAt(x: number, y: number, dt: number): void {
    if (dt > 0) {
      const k = Math.min(1, dt * 18);
      this.holdV.x += ((x - this.x) / dt - this.holdV.x) * k;
      this.holdV.y += ((y - this.y) / dt - this.holdV.y) * k;
    }
    this.x = x;
    this.y = y;
  }

  get handVelocity(): { x: number; y: number } {
    return { ...this.holdV };
  }

  /** Let go with the hand's recent velocity (a throw) or a given one. */
  release(v = this.holdV): void {
    const speed = Math.hypot(v.x, v.y);
    const k = speed > MAX_THROW ? MAX_THROW / speed : 1;
    this.launch(v.x * k, v.y * k);
  }

  // --- Walls -------------------------------------------------------------------------------------

  cling(world: World, wall: Wall): void {
    this.x = wall.x + wall.side * this.size.halfWidth * 0.55;
    this.vx = this.vy = 0;
    this.facing = wall.side < 0 ? 1 : -1;
    const win = world.window(wall.windowId);
    this.contact = { kind: 'wall', wall, offset: win ? this.y - win.bounds.y : 0 };
  }

  /** Climb up the wall; returns true at the top. */
  climb(world: World, speed: number, dt: number): boolean {
    if (this.contact.kind !== 'wall') return false;
    const top = this.contact.wall.y1;
    this.y = Math.max(top, this.y - speed * dt);
    const win = world.window(this.contact.wall.windowId);
    if (win) this.contact.offset = this.y - win.bounds.y;
    return this.y <= top + 0.5;
  }

  // --- Simulation --------------------------------------------------------------------------------

  /** Advance airborne motion and keep the pet inside the desktop. */
  step(world: World, dt: number): MoverEvent[] {
    if (this.contact.kind !== 'air') return [];
    const events: MoverEvent[] = [];
    const prevY = this.y;
    this.vy = Math.min(MAX_FALL, this.vy + this.size.gravity * dt);
    this.vx *= 1 - AIR_DRAG * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Side edges of the desktop at body height: bounce back.
    const mid = this.y - this.size.height / 2;
    const spans = world.spansAt(mid);
    const hw = this.size.halfWidth;
    if (spans.length) {
      const span = spans.find(([a, b]) => this.x >= a && this.x <= b) ?? nearestSpan(spans, this.x);
      if (this.x - hw < span[0] || this.x + hw > span[1]) {
        this.x = clamp(this.x, span[0] + hw, span[1] - hw);
        if (Math.abs(this.vx) > 40) events.push({ type: 'bump', speed: Math.abs(this.vx) });
        this.vx = -this.vx * 0.45;
      }
    }
    // Top of the desktop: bounce down.
    const d = world.nearestDisplay(this.x, mid);
    if (d && this.y - this.size.height < d.bounds.y && this.vy < 0) {
      this.y = d.bounds.y + this.size.height;
      events.push({ type: 'bump', speed: -this.vy });
      this.vy = -this.vy * 0.3;
    }

    if (this.vy > 0) {
      const s = world.landingBetween(this.x, prevY, this.y);
      if (s) {
        const speed = this.vy;
        this.stand(world, s, clamp(this.x, s.x1, s.x2));
        events.push({ type: 'landed', speed, surface: s });
        return events;
      }
      // Below every floor (a gap between displays, a display removed): land on the nearest floor.
      const floor = world.floorAt(this.x) ?? nearestFloor(world, this.x);
      if (floor && this.y > floor.y + 400) {
        const speed = this.vy;
        this.stand(world, floor, clamp(this.x, floor.x1 + hw, floor.x2 - hw));
        events.push({ type: 'landed', speed, surface: floor });
      }
    }
    return events;
  }

  /** The desktop changed (windows moved, opened, closed): follow the surface or fall. */
  syncWorld(world: World): MoverEvent[] {
    const c = this.contact;
    if (c.kind === 'surface') {
      const winId = c.surface.windowId;
      let nx = this.x;
      let ny = this.y;
      if (winId) {
        const win = world.window(winId);
        if (!win) return this.loseFooting();
        nx = win.bounds.x + c.offset;
        ny = win.bounds.y;
      }
      const s =
        world.surfaces.find(
          (q) => q.windowId === winId && Math.abs(q.y - ny) < 1 && nx >= q.x1 && nx <= q.x2,
        ) ?? null;
      if (!s) return this.loseFooting();
      const dx = nx - this.x;
      const dy = ny - this.y;
      this.x = nx;
      this.y = ny;
      this.contact = { kind: 'surface', surface: s, offset: c.offset };
      return dx || dy ? [{ type: 'carried', dx, dy }] : [];
    }
    if (c.kind === 'wall') {
      const win = world.window(c.wall.windowId);
      if (!win) return this.loseFooting();
      const ny = win.bounds.y + c.offset;
      const wall = world.walls.find(
        (w) =>
          w.windowId === c.wall.windowId && w.side === c.wall.side && ny >= w.y1 && ny <= w.y2 + 1,
      );
      if (!wall) return this.loseFooting();
      const nx = wall.x + wall.side * this.size.halfWidth * 0.55;
      const dx = nx - this.x;
      const dy = ny - this.y;
      this.x = nx;
      this.y = ny;
      this.contact = { kind: 'wall', wall, offset: c.offset };
      return dx || dy ? [{ type: 'carried', dx, dy }] : [];
    }
    return [];
  }

  private loseFooting(): MoverEvent[] {
    this.contact = { kind: 'air' };
    this.vx = 0;
    this.vy = 0;
    return [{ type: 'lostFooting' }];
  }

  private syncOffset(world: World): void {
    const c = this.contact;
    if (c.kind !== 'surface' || !c.surface.windowId) return;
    const win = world.window(c.surface.windowId);
    if (win) c.offset = this.x - win.bounds.x;
  }
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

function nearestSpan(spans: readonly (readonly [number, number])[], x: number) {
  let best = spans[0]!;
  let bestD = Infinity;
  for (const s of spans) {
    const d = x < s[0] ? s[0] - x : x > s[1] ? x - s[1] : 0;
    if (d < bestD) {
      best = s;
      bestD = d;
    }
  }
  return best;
}

function nearestFloor(world: World, x: number): Surface | null {
  let best: Surface | null = null;
  let bestD = Infinity;
  for (const s of world.surfaces) {
    if (s.windowId) continue;
    const d = x < s.x1 ? s.x1 - x : x > s.x2 ? x - s.x2 : 0;
    if (d < bestD) {
      best = s;
      bestD = d;
    }
  }
  return best;
}
