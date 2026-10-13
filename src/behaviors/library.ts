import { clamp, type Vec2 } from '../core/math';
import { planRoute, type Spot, type Step } from '../world/route';
import type { Surface, World } from '../world/world';
import type { Behavior, BehaviorState, Option } from './brain';
import type { Pet } from './pet';

/**
 * The behaviour modules and the brain's options. Each behaviour is small and self-contained; new
 * ones can be added to OPTIONS without touching the brain.
 */

// --- Helpers ---------------------------------------------------------------------------------------

/** Look at the cursor when it's near, otherwise let the eyes drift. */
function watchCursor(pet: Pet, range = 480): void {
  const c = pet.cursor;
  const p = pet.center;
  if (c.pos && c.distanceTo(p.x, p.y) < range) pet.creature.lookAt(c.pos);
  else pet.creature.lookAt(null);
}

/** A goal that survives the world changing: a window-relative or absolute point. */
interface Goal {
  windowId: string | null;
  /** x relative to the window's left edge, or absolute for floors. */
  dx: number;
  y: number;
}

function goalOf(world: World, spot: Spot): Goal {
  const win = spot.surface.windowId ? world.window(spot.surface.windowId) : undefined;
  return win
    ? { windowId: win.id, dx: spot.x - win.bounds.x, y: spot.surface.y - win.bounds.y }
    : { windowId: null, dx: spot.x, y: spot.surface.y };
}

function resolveGoal(world: World, g: Goal): Spot | null {
  if (g.windowId) {
    const win = world.window(g.windowId);
    if (!win) return null;
    const x = win.bounds.x + g.dx;
    const y = win.bounds.y + g.y;
    const s = world.surfaces.find((q) => q.windowId === g.windowId && x >= q.x1 && x <= q.x2);
    return s && Math.abs(s.y - y) < 2 ? { surface: s, x } : null;
  }
  const s = world.surfaceAt(g.dx, g.y, 2);
  return s ? { surface: s, x: g.dx } : null;
}

function sameSurface(a: Surface, b: Surface): boolean {
  return a.windowId !== null ? a.windowId === b.windowId : b.windowId === null && a.y === b.y;
}

/** A random place to go, weighted by length; windows count extra when `windows` > 1. */
export function randomSpot(
  pet: Pet,
  opts: { windows?: number; onlyWindows?: boolean; filter?: (x: number, s: Surface) => boolean },
): Spot | null {
  const hw = pet.mover.size.halfWidth;
  const spans: { s: Surface; a: number; b: number; w: number }[] = [];
  for (const s of pet.world.surfaces) {
    if (opts.onlyWindows && !s.windowId) continue;
    for (const [a, b] of pet.world.restSpans(s, hw)) {
      spans.push({ s, a, b, w: (b - a) * (s.windowId ? (opts.windows ?? 1) : 1) });
    }
  }
  for (let tries = 0; tries < 6 && spans.length; tries++) {
    const total = spans.reduce((t, x) => t + x.w, 0);
    let r = pet.rng.next() * total;
    let pick = spans[0]!;
    for (const x of spans) {
      r -= x.w;
      if (r <= 0) {
        pick = x;
        break;
      }
    }
    const x = pet.rng.range(pick.a, pick.b);
    const crowded = pet.others.some(
      (o) => Math.abs(o.x - x) < hw * 2.2 && Math.abs(o.y - pick.s.y) < 4,
    );
    if (crowded) continue;
    if (opts.filter && !opts.filter(x, pick.s)) continue;
    return { surface: pick.s, x };
  }
  return null;
}

/** Where the desktop ends beside a floor: spots to peek or hide from. */
function edgeSpots(pet: Pet): { spot: Spot; dir: -1 | 1 }[] {
  const out: { spot: Spot; dir: -1 | 1 }[] = [];
  const hw = pet.mover.size.halfWidth;
  for (const s of pet.world.surfaces) {
    if (s.windowId) continue;
    const spans = pet.world.spansAt(s.y - pet.mover.size.height / 2);
    for (const [a, b] of spans) {
      if (Math.abs(s.x1 - a) < 2 && !pet.world.isAvoided(s, s.x1 + hw)) {
        out.push({ spot: { surface: s, x: s.x1 + hw * 0.4 }, dir: -1 });
      }
      if (Math.abs(s.x2 - b) < 2 && !pet.world.isAvoided(s, s.x2 - hw)) {
        out.push({ spot: { surface: s, x: s.x2 - hw * 0.4 }, dir: 1 });
      }
    }
  }
  return out;
}

// --- Standing still ------------------------------------------------------------------------------

export class Idle implements Behavior {
  readonly name = 'idle';
  readonly state = 'idle';
  readonly interruptible = true;
  private left = 0;
  constructor(private seconds?: number) {}
  start(pet: Pet): void {
    this.left = this.seconds ?? pet.rng.range(2, 6);
    pet.mood(null);
  }
  update(pet: Pet, dt: number): boolean {
    watchCursor(pet);
    this.left -= dt;
    return this.left <= 0 || pet.mover.contact.kind !== 'surface';
  }
}

export class Sit implements Behavior {
  readonly name = 'sit';
  readonly state = 'sit';
  readonly interruptible = true;
  private left = 0;
  start(pet: Pet): void {
    this.left = pet.rng.range(5, 14) * (pet.quiet ? 1.6 : 1);
    pet.mood(null);
  }
  update(pet: Pet, dt: number): boolean {
    pet.want.crouch = 0.35;
    watchCursor(pet, 360);
    this.left -= dt;
    return this.left <= 0;
  }
}

/** Curl up and doze with zzz; wakes up when its time is up or something startles it. */
export class Sleep implements Behavior {
  readonly name = 'sleep';
  readonly interruptible = true;
  private t = 0;
  private length = 0;
  private nextZ = 1.5;
  private waking = -1;
  constructor(private seconds?: number) {}
  get state(): BehaviorState {
    return 'sleep';
  }
  start(pet: Pet): void {
    this.length = this.seconds ?? pet.rng.range(20, 55) * (pet.quiet ? 1.5 : 1);
    pet.mood('sleepy', 0.8);
    pet.creature.lookAt(null);
  }
  update(pet: Pet, dt: number): boolean {
    this.t += dt;
    if (this.waking >= 0) {
      this.waking += dt;
      pet.want.crouch = 0.3;
      return this.waking > 1.8;
    }
    pet.want.crouch = 0.8;
    pet.want.sleep = this.t > 0.8 ? 1 : 0;
    this.nextZ -= dt;
    if (this.nextZ <= 0 && this.t > 1) {
      pet.creature.emit('zzz', 1);
      this.nextZ = 2.6;
    }
    if (this.t >= this.length) {
      this.waking = 0;
      pet.creature.yawn();
      pet.awakeFor = 0;
    }
    return false;
  }
  stop(pet: Pet): void {
    pet.awakeFor = Math.min(pet.awakeFor, 30);
    pet.mood(null);
  }
}

// --- Getting around ------------------------------------------------------------------------------

type TripPhase = 'walk' | 'air' | 'toWall' | 'climb';

/** Go to a spot: walk, jump across gaps, drop off edges and climb window sides as planned. */
export class Trip implements Behavior {
  readonly interruptible = true;
  private steps: Step[] = [];
  private i = 0;
  private phase: TripPhase = 'walk';
  private replans = 0;
  private t = 0;
  private goal: Goal | null = null;
  private failed = false;

  constructor(
    private target: Spot,
    private opts: { name?: string; run?: boolean; overhang?: number; maxTime?: number } = {},
  ) {}

  get name(): string {
    return this.opts.name ?? 'trip';
  }

  get state(): BehaviorState {
    return this.phase === 'climb' ? 'climb' : this.phase === 'walk' ? 'walk' : 'jump';
  }

  get arrived(): boolean {
    return !this.failed && this.i >= this.steps.length;
  }

  start(pet: Pet): void {
    this.goal = goalOf(pet.world, this.target);
    pet.heading = { x: this.target.x, y: this.target.surface.y };
    this.plan(pet);
  }

  stop(pet: Pet): void {
    pet.heading = null;
  }

  /** The desktop changed: re-plan from wherever it is now. */
  worldChanged(pet: Pet): void {
    if (this.phase === 'walk') this.plan(pet);
  }

  private plan(pet: Pet): void {
    const from = pet.surface;
    const to = this.goal ? resolveGoal(pet.world, this.goal) : null;
    if (!from || !to) {
      this.failed = true;
      this.steps = [];
      return;
    }
    this.steps = planRoute(pet.world, { surface: from, x: pet.mover.x }, to, pet.reach) ?? [];
    this.failed = this.steps.length === 0;
    this.i = 0;
    this.phase = 'walk';
  }

  private replan(pet: Pet): boolean {
    if (++this.replans > 4) return true;
    this.plan(pet);
    return this.failed;
  }

  update(pet: Pet, dt: number): boolean {
    this.t += dt;
    if (this.failed || this.t > (this.opts.maxTime ?? 60)) return true;
    const m = pet.mover;
    const step = this.steps[this.i];
    if (!step) return true;

    switch (this.phase) {
      case 'walk': {
        if (m.contact.kind !== 'surface') return true;
        const mv = pet.movement;
        const speed = this.opts.run ? mv.runSpeed : mv.walkSpeed;
        const last = this.i === this.steps.length - 1;
        const there = m.walkToward(
          pet.world,
          step.x,
          speed,
          dt,
          last ? (this.opts.overhang ?? 0) : 0,
        );
        if (!there) return false;
        if (step.kind === 'walk') {
          this.i++;
          return this.i >= this.steps.length;
        }
        if (step.kind === 'jump') {
          pet.creature.squash(0.12);
          m.jumpTo(step.to, 30 * pet.size);
          this.phase = 'air';
          return false;
        }
        // Climb: grab the wall (hopping up to it if it starts above the feet).
        const w = step.wall;
        if (w.y2 >= m.y - 6) {
          m.cling(pet.world, w);
          this.phase = 'climb';
        } else {
          m.jumpTo({ x: w.x + w.side * m.size.halfWidth * 0.55, y: w.y2 - 6 }, 10);
          this.phase = 'toWall';
        }
        return false;
      }
      case 'air': {
        if (m.contact.kind === 'air') return false;
        if (m.contact.kind !== 'surface') return true;
        if (sameSurface(m.contact.surface, step.surface)) {
          this.i++;
          this.phase = 'walk';
          return this.i >= this.steps.length;
        }
        return this.replan(pet);
      }
      case 'toWall': {
        if (m.contact.kind === 'surface') return this.replan(pet);
        if (step.kind !== 'climb') return true;
        if (m.vy >= -30) {
          const w = pet.world.walls.find(
            (q) => q.windowId === step.wall.windowId && q.side === step.wall.side,
          );
          if (!w || m.y < w.y1 || m.y > w.y2 + 12) return false; // keep falling; may replan on landing
          m.y = Math.min(m.y, w.y2);
          m.cling(pet.world, w);
          this.phase = 'climb';
        }
        return false;
      }
      case 'climb': {
        if (step.kind !== 'climb') return true;
        if (m.contact.kind === 'air') {
          this.phase = 'air';
          return false;
        }
        if (m.contact.kind !== 'wall') return true;
        if (m.climb(pet.world, pet.movement.climbSpeed, dt)) {
          m.jumpTo(step.to, 24 * pet.size);
          this.phase = 'air';
        }
        return false;
      }
    }
  }
}

/** Fall (lost footing) or fly (thrown) until landing. */
export class Fall implements Behavior {
  readonly name: string;
  readonly state = 'fall';
  readonly interruptible = false;
  private t = 0;
  private landing = 0;

  constructor(private thrown: boolean) {
    this.name = thrown ? 'thrown' : 'fall';
  }

  start(pet: Pet): void {
    const m = pet.mover;
    if (this.thrown) {
      m.release();
      const speed = Math.hypot(m.vx, m.vy);
      pet.mood(speed > 900 ? 'scared' : 'excited');
    } else {
      pet.mood('surprised');
    }
    pet.creature.lookAt(null);
    pet.lastImpact = 0;
  }

  update(pet: Pet, dt: number): boolean {
    this.t += dt;
    if (pet.mover.contact.kind === 'air') return this.t > 12;
    if (this.landing === 0) {
      this.landing = pet.lastImpact;
      if (this.landing > 1300) pet.brain.enqueue(new React('dizzy'));
      else if (this.thrown && this.landing > 500) pet.brain.enqueue(new React('proud'));
    }
    return true;
  }

  stop(pet: Pet): void {
    pet.mood(null);
  }
}

/** A happy hop in place. */
export class Hop implements Behavior {
  readonly name = 'hop';
  readonly state = 'jump';
  readonly interruptible = false;
  private t = 0;
  start(pet: Pet): void {
    pet.mood('happy');
    pet.creature.hop(1.3);
  }
  update(_pet: Pet, dt: number): boolean {
    this.t += dt;
    return this.t > 0.9;
  }
  stop(pet: Pet): void {
    pet.mood(null);
  }
}

// --- Peek and hide -------------------------------------------------------------------------------

/**
 * Walk to the edge of the desktop and lean out past it: peek keeps half the body showing and
 * watches the screen; hide slips out of sight for a while, then comes back.
 */
export class EdgeVisit implements Behavior {
  readonly interruptible = true;
  private trip: Trip;
  private phase: 'go' | 'out' | 'wait' | 'back' = 'go';
  private left = 0;
  private startX = 0;

  constructor(
    private spot: Spot,
    private dir: -1 | 1,
    private kind: 'peek' | 'hide',
  ) {
    this.trip = new Trip(spot, { name: kind });
  }

  get name(): string {
    return this.kind;
  }

  get state(): BehaviorState {
    return this.phase === 'go' ? this.trip.state : this.kind;
  }

  start(pet: Pet): void {
    this.trip.start(pet);
  }

  worldChanged(pet: Pet): void {
    if (this.phase === 'go') this.trip.worldChanged(pet);
  }

  update(pet: Pet, dt: number): boolean {
    const m = pet.mover;
    const hw = m.size.halfWidth;
    const edge = this.dir > 0 ? this.spot.surface.x2 : this.spot.surface.x1;
    const out = this.kind === 'peek' ? hw * 0.95 : hw * 2.6;
    switch (this.phase) {
      case 'go':
        if (!this.trip.update(pet, dt)) return false;
        if (!this.trip.arrived) return true;
        this.trip.stop(pet);
        this.startX = m.x;
        this.phase = 'out';
        pet.mood(this.kind === 'peek' ? 'curious' : null, 0.6);
        return false;
      case 'out': {
        const there = m.walkToward(
          pet.world,
          edge + this.dir * out,
          pet.movement.walkSpeed * 0.6,
          dt,
          out + hw,
        );
        if (there) {
          this.phase = 'wait';
          this.left = this.kind === 'peek' ? pet.rng.range(3, 7) : pet.rng.range(8, 20);
          pet.hidden = this.kind === 'hide';
          m.facing = this.dir > 0 ? -1 : 1; // turn back toward the screen
        }
        return false;
      }
      case 'wait':
        if (this.kind === 'peek') watchCursor(pet, 2000);
        this.left -= dt;
        if (this.left <= 0) {
          this.phase = 'back';
          pet.hidden = false;
        }
        return false;
      case 'back':
        return m.walkToward(pet.world, this.startX - this.dir * hw, pet.movement.walkSpeed, dt);
    }
  }

  stop(pet: Pet): void {
    pet.hidden = false;
    pet.mood(null);
    this.trip.stop(pet);
    // Never leave it stuck past the edge.
    const s = pet.surface;
    if (s) pet.mover.x = clamp(pet.mover.x, s.x1, s.x2);
  }
}

// --- Cursor play ---------------------------------------------------------------------------------

/** Crouch, wiggle, and pounce at the cursor. */
export class Pounce implements Behavior {
  readonly name = 'pounce';
  readonly state = 'play';
  readonly interruptible = false;
  private t = 0;
  private leapt = false;
  start(pet: Pet): void {
    pet.mood('excited', 0.8);
    pet.creature.fidget('wiggle');
  }
  update(pet: Pet, dt: number): boolean {
    this.t += dt;
    const m = pet.mover;
    const c = pet.cursor.pos;
    if (!this.leapt) {
      if (c) {
        pet.creature.lookAt(c);
        m.facing = c.x >= m.x ? 1 : -1;
      }
      pet.want.crouch = 0.6;
      if (this.t < 0.9) return false;
      const s = pet.surface;
      if (!c || !s) return true;
      const hw = m.size.halfWidth;
      const x = clamp(c.x, s.x1 + hw * 0.5, s.x2 - hw * 0.5);
      // Arc up through the cursor's height (within the species' jump).
      const arc = clamp(m.y - c.y - m.size.height * 0.6, 20, pet.movement.jumpUp);
      pet.creature.squash(0.2);
      m.jumpTo({ x, y: s.y }, arc);
      this.leapt = true;
      return false;
    }
    if (m.contact.kind === 'air') return false;
    pet.brain.enqueue(new React('proud'));
    return true;
  }
  stop(pet: Pet): void {
    pet.mood(null);
    pet.cool('play', 10);
  }
}

/** Curious: keep a polite distance from the cursor, following it along the surface. */
export class Follow implements Behavior {
  readonly name = 'follow';
  readonly interruptible = true;
  private t = 0;
  private walking = false;
  get state(): BehaviorState {
    return this.walking ? 'walk' : 'idle';
  }
  start(pet: Pet): void {
    pet.mood('curious', 0.6);
  }
  update(pet: Pet, dt: number): boolean {
    this.t += dt;
    const c = pet.cursor;
    const m = pet.mover;
    if (!c.pos || this.t > 12 || c.stillFor > 4) return true;
    if (c.distanceTo(pet.center.x, pet.center.y) > 700) return true;
    pet.creature.lookAt(c.pos);
    const keep = 150 * pet.size;
    const dx = c.pos.x - m.x;
    this.walking = Math.abs(dx) > keep + 30;
    if (this.walking) {
      const far = Math.abs(dx) > 420;
      const speed = far ? pet.movement.runSpeed * 0.7 : pet.movement.walkSpeed;
      m.walkToward(pet.world, c.pos.x - Math.sign(dx) * keep, speed, dt);
    } else if (Math.abs(dx) > 4) {
      m.facing = dx > 0 ? 1 : -1;
    }
    return false;
  }
  stop(pet: Pet): void {
    pet.mood(null);
    pet.cool('follow', 20);
  }
}

/** Short reactions: a startle, curiosity, dizziness after a hard landing, pride after a pounce. */
export class React implements Behavior {
  readonly state = 'react';
  readonly interruptible = false;
  private left = 0;
  constructor(readonly kind: 'startled' | 'curious' | 'dizzy' | 'proud') {}
  get name(): string {
    return `react:${this.kind}`;
  }
  start(pet: Pet): void {
    const c = pet.creature;
    switch (this.kind) {
      case 'startled':
        this.left = 0.6;
        c.express('scared', 1, 0.8);
        c.emit('exclaim');
        c.emit('sweat', 2);
        c.squash(-0.15);
        break;
      case 'curious':
        this.left = 1.3;
        c.express('curious', 1, 1.4);
        c.emit('question');
        break;
      case 'dizzy':
        this.left = 1.8;
        c.express('surprised', 0.8, 1.8);
        c.emit('question');
        c.emit('sweat', 2);
        break;
      case 'proud':
        this.left = 0.9;
        c.express('happy', 1, 1);
        c.emit('sparkle', 4);
        break;
    }
  }
  update(pet: Pet, dt: number): boolean {
    if (this.kind === 'curious' || this.kind === 'startled') watchCursor(pet, 2000);
    if (this.kind === 'dizzy') pet.creature.anim.layer.sway = Math.sin(pet.time * 9) * 0.6;
    this.left -= dt;
    return this.left <= 0;
  }
}

/** Being carried by the cursor: dangles from the hand and swings like a pendulum. */
export class Held implements Behavior {
  readonly name = 'held';
  readonly state = 'held';
  readonly interruptible = false;
  hand: Vec2;
  private swing = 0;
  private swingV = 0;
  private t = 0;
  constructor(hand: Vec2) {
    this.hand = { ...hand };
  }
  start(pet: Pet): void {
    pet.mover.grab();
    pet.creature.express('surprised', 1, 0.7);
    pet.mood('happy', 0.4);
  }
  update(pet: Pet, dt: number): boolean {
    this.t += dt;
    const m = pet.mover;
    pet.want.held = 1;
    const v = m.handVelocity;
    // Pendulum: swings back against the hand's motion, then settles.
    const target = clamp(-v.x * 0.0009, -0.75, 0.75);
    this.swingV += ((target - this.swing) * 60 - this.swingV * 7) * dt;
    this.swing += this.swingV * dt;
    pet.creature.motion.swing = this.swing;
    // Hang from the head: feet sit below the hand along the swing angle.
    const hang = m.size.height * 0.92;
    m.holdAt(
      this.hand.x - Math.sin(this.swing) * hang,
      this.hand.y + Math.cos(this.swing) * hang,
      dt,
    );
    if (Math.hypot(v.x, v.y) > 2500 && !pet.cooling('shaken')) {
      pet.creature.express('scared', 1, 1.2);
      pet.creature.emit('sweat', 2);
      pet.cool('shaken', 1.5);
    }
    return false;
  }
  stop(pet: Pet): void {
    pet.creature.motion.swing = 0;
    pet.mood(null);
  }
}

// --- Options -------------------------------------------------------------------------------------

const near = (pet: Pet, range: number) => {
  const c = pet.cursor;
  return c.pos !== null && c.distanceTo(pet.center.x, pet.center.y) < range;
};

const onGround = (pet: Pet) => pet.mover.contact.kind === 'surface';

export const OPTIONS: readonly Option[] = [
  { name: 'idle', weight: () => 3, create: () => new Idle() },
  { name: 'sit', weight: (p) => (p.quiet ? 6 : 2.5), create: () => new Sit() },
  {
    name: 'wander',
    weight: (p) => (onGround(p) ? (p.quiet ? 1.5 : 5) : 0),
    create: (p) => {
      const spot = randomSpot(p, { windows: 1.6 });
      return spot ? new Trip(spot, { name: 'wander' }) : null;
    },
  },
  {
    name: 'explore',
    weight: (p) => (onGround(p) && !p.quiet && p.world.surfaces.some((s) => s.windowId) ? 2 : 0),
    create: (p) => {
      const spot = randomSpot(p, { onlyWindows: true });
      return spot ? new Trip(spot, { name: 'explore' }) : null;
    },
  },
  {
    name: 'sleep',
    weight: (p) => (onGround(p) ? (p.awakeFor > 240 ? 3 : 0.35) * (p.quiet ? 2 : 1) : 0),
    create: () => new Sleep(),
  },
  {
    // Sleeps near a cursor that has been still for a while (the user stepped away).
    name: 'napNearCursor',
    weight: (p) =>
      p.cursor.pos && p.cursor.stillFor > 50 && !p.cooling('nap') && onGround(p) ? 8 : 0,
    create: (p) => {
      p.cool('nap', 120);
      const c = p.cursor.pos!;
      const s = p.world.landingBetween(c.x, c.y, Infinity);
      if (!s) return new Sleep(60);
      const spot = { surface: s, x: clamp(c.x + p.rng.range(-60, 60), s.x1, s.x2) };
      p.brain.enqueue(new Sleep(p.rng.range(40, 90)));
      return new Trip(spot, { name: 'napNearCursor' });
    },
  },
  {
    name: 'peek',
    weight: (p) => (onGround(p) && !p.quiet && !p.cooling('peek') ? 0.8 : 0),
    create: (p) => {
      p.cool('peek', 60);
      const edges = edgeSpots(p);
      const e = edges.length ? p.rng.pick(edges) : null;
      return e ? new EdgeVisit(e.spot, e.dir, 'peek') : null;
    },
  },
  {
    name: 'hide',
    weight: (p) => (onGround(p) && !p.quiet && !p.cooling('hide') ? 0.25 : 0),
    create: (p) => {
      p.cool('hide', 150);
      const edges = edgeSpots(p);
      const e = edges.length ? p.rng.pick(edges) : null;
      return e ? new EdgeVisit(e.spot, e.dir, 'hide') : null;
    },
  },
  { name: 'hop', weight: (p) => (onGround(p) && !p.quiet ? 0.8 : 0), create: () => new Hop() },
  {
    name: 'pounce',
    weight: (p) => {
      const c = p.cursor;
      if (p.quiet || !onGround(p) || p.cooling('play') || !c.pos) return 0;
      const m = p.mover;
      const ok =
        Math.abs(c.pos.x - m.x) < 380 * p.size &&
        c.pos.y > m.y - p.movement.jumpUp - m.size.height &&
        c.pos.y < m.y + 10 &&
        c.speed < 250;
      return ok ? 4 : 0;
    },
    create: () => new Pounce(),
  },
  {
    name: 'follow',
    weight: (p) =>
      onGround(p) && near(p, 520) && p.cursor.speed > 30 && !p.cooling('follow') ? 2.5 : 0,
    create: () => new Follow(),
  },
];

/**
 * Checks that can cut into whatever the pet is doing: losing its footing, a cursor dashing at it,
 * a slow cursor coming close.
 */
export function reflexes(pet: Pet): void {
  const b = pet.brain.current;
  const m = pet.mover;
  if (m.contact.kind === 'held') return;
  if (
    m.contact.kind === 'air' &&
    b &&
    !['fall', 'jump', 'play', 'climb', 'held'].includes(b.state)
  ) {
    pet.brain.interrupt(pet, new Fall(false));
    return;
  }
  if (b && !b.interruptible) return;
  if (pet.hidden || !onGround(pet)) return;
  const c = pet.cursor;
  if (!c.pos) return;
  const dist = c.distanceTo(pet.center.x, pet.center.y);

  // A fast cursor nearby: startle, then run (or just flinch in Quiet Mode).
  if (c.burst > 1700 && dist < 230 * pet.size + 60 && !pet.cooling('flee')) {
    pet.cool('flee', 6);
    if (pet.quiet) {
      pet.brain.interrupt(pet, new React('startled'));
      return;
    }
    const away = randomSpot(pet, {
      filter: (x, s) => Math.hypot(x - c.pos!.x, s.y - c.pos!.y) > 450 && s.y >= m.y - 10,
    });
    const flee = away ? new Trip(away, { name: 'flee', run: true, maxTime: 12 }) : null;
    pet.brain.interrupt(pet, new React('startled'), ...(flee ? [flee] : []));
    if (flee && pet.rng.chance(0.3)) {
      const edges = edgeSpots(pet);
      if (edges.length) {
        const e = pet.rng.pick(edges);
        pet.brain.enqueue(new EdgeVisit(e.spot, e.dir, 'hide'));
      }
    }
    return;
  }

  // A slow cursor coming close: curious.
  const calm = b === null || ['idle', 'sit', 'wander'].includes(b.name);
  if (calm && dist < 420 && c.speed > 30 && c.speed < 500 && !pet.cooling('curious')) {
    pet.cool('curious', 30);
    pet.brain.interrupt(pet, new React('curious'), new Follow());
  }
}
