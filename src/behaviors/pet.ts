import { approach, type Vec2 } from '../core/math';
import { Rng } from '../core/random';
import type { Appearance } from '../creature/appearance';
import { Creature } from '../creature/creature';
import type { Expression } from '../creature/face';
import type { Movement } from '../creature/species/types';
import type { Reach } from '../world/route';
import type { World } from '../world/world';
import { type Surface } from '../world/world';
import { Brain, type BehaviorState } from './brain';
import type { CursorSense } from './cursorSense';
import { Fall, Held, OPTIONS, reflexes } from './library';
import { Mover, type MoverEvent } from './mover';

export const DEFAULT_MOVEMENT: Movement = {
  walkSpeed: 60,
  runSpeed: 180,
  jumpUp: 170,
  jumpAcross: 160,
  canClimb: true,
  climbSpeed: 55,
  stepHz: 2.2,
};

/** What a pet needs from its surroundings each frame. */
export interface PetSurroundings {
  quiet: boolean;
  /** Feet positions of the other pets (to keep a little personal space). */
  others: Vec2[];
}

/** Enough to rebuild a pet on another display (multi-monitor hand-over). */
export interface PetSnapshot {
  id: string;
  appearance: Appearance;
  seed: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  contact: 'surface' | 'wall' | 'air' | 'held';
  facing: -1 | 1;
  /** Where a trip was heading, so the new owner can carry on. */
  heading: Vec2 | null;
}

export interface PetOptions {
  id: string;
  appearance?: Partial<Appearance>;
  seed?: number;
  world: World;
  cursor: CursorSense;
  x?: number;
  y?: number;
}

/**
 * A pet: the creature's body, where it is in the world (Mover) and what it's doing (Brain).
 * Pure logic plus the creature; the overlay renderer feeds it the world and the cursor.
 */
export class Pet {
  readonly id: string;
  readonly seed: number;
  readonly creature: Creature;
  readonly mover: Mover;
  readonly brain: Brain;
  readonly rng: Rng;
  readonly cursor: CursorSense;
  world: World;
  quiet = false;
  others: Vec2[] = [];
  /** Fully off-screen (hiding): skip hit-testing. */
  hidden = false;
  /** Where the current trip is heading (for hand-over). */
  heading: Vec2 | null = null;
  /** Seconds since the pet last slept. */
  awakeFor = 0;
  /** Cool-downs by name (seconds left). */
  readonly cooldowns = new Map<string, number>();
  time = 0;
  /** Body pose wanted by the current behaviour this frame (eased into the creature's motion). */
  readonly want = { crouch: 0, sleep: 0, held: 0 };
  /** Speed of the most recent landing (px/s). */
  lastImpact = 0;
  private walkEase = 0;

  constructor(opts: PetOptions) {
    this.id = opts.id;
    this.seed = opts.seed ?? 1;
    this.rng = new Rng(this.seed);
    this.world = opts.world;
    this.cursor = opts.cursor;
    this.creature = new Creature({ seed: this.seed ^ 0x5bd1e995, appearance: opts.appearance });
    this.mover = new Mover(this.bodySize());
    this.brain = new Brain(OPTIONS);
    const d = this.world.displays.find((x) => x.primary) ?? this.world.displays[0];
    const x = opts.x ?? (d ? d.workArea.x + d.workArea.width * 0.75 : 0);
    const y = opts.y ?? (d ? d.workArea.y + d.workArea.height : 0);
    this.mover.place(this.world, x, y);
    this.syncCreature(0);
    this.creature.settle();
  }

  // --- Derived numbers --------------------------------------------------------------------------

  get size(): number {
    return this.creature.appearance.size;
  }

  get movement(): Movement {
    const m = { ...DEFAULT_MOVEMENT, ...this.creature.species.movement };
    const s = this.size;
    return {
      ...m,
      walkSpeed: m.walkSpeed * s,
      runSpeed: m.runSpeed * s,
      jumpUp: m.jumpUp * s,
      jumpAcross: m.jumpAcross * s,
      climbSpeed: m.climbSpeed * s,
    };
  }

  /** Where it can get to. Quiet Mode keeps it on the ground: no climbing and only small hops. */
  get reach(): Reach {
    const m = this.movement;
    return {
      halfWidth: this.mover.size.halfWidth,
      jumpUp: this.quiet ? 0 : m.jumpUp,
      jumpAcross: this.quiet ? 30 * this.size : m.jumpAcross,
      canClimb: !this.quiet && m.canClimb,
      walkSpeed: m.walkSpeed,
      climbSpeed: m.climbSpeed,
    };
  }

  get state(): BehaviorState {
    return this.brain.state;
  }

  /** Middle of the body in desktop coordinates. */
  get center(): Vec2 {
    return { x: this.mover.x, y: this.mover.y - this.mover.size.height / 2 };
  }

  get surface(): Surface | null {
    return this.mover.onSurface;
  }

  private bodySize() {
    const R = this.creature.R;
    const shape = this.creature.shape;
    return {
      halfWidth: shape.rx * R,
      height: (shape.ryTop + shape.ryBottom + 0.07) * R,
      gravity: 1900 * Math.sqrt(this.size),
    };
  }

  // --- Helpers for behaviours -------------------------------------------------------------------

  cooling(name: string): boolean {
    return (this.cooldowns.get(name) ?? 0) > 0;
  }

  cool(name: string, seconds: number): void {
    this.cooldowns.set(name, seconds);
  }

  mood(expr: Expression | null, intensity = 1): void {
    this.creature.setMood(expr ? { [expr]: intensity } : { neutral: 1 });
  }

  // --- World and input --------------------------------------------------------------------------

  setWorld(world: World): void {
    this.world = world;
    this.handle(this.mover.syncWorld(world));
  }

  /** Picked up by the cursor at a desktop point. */
  grab(p: Vec2): void {
    this.brain.interrupt(this, new Held(p));
  }

  get held(): boolean {
    return this.mover.contact.kind === 'held';
  }

  /** Cursor moved while held. */
  drag(p: Vec2): void {
    const b = this.brain.current;
    if (b instanceof Held) b.hand = { ...p };
  }

  /** Let go: thrown with the hand's recent velocity. */
  release(): void {
    if (!this.held) return;
    this.brain.interrupt(this, new Fall(true));
  }

  poke(p: Vec2): void {
    this.creature.poke(p.x, p.y);
    this.creature.emit('sparkle', 3);
  }

  // --- Simulation -------------------------------------------------------------------------------

  update(dt: number, env: PetSurroundings): void {
    this.time += dt;
    this.quiet = env.quiet;
    this.others = env.others;
    for (const [k, v] of this.cooldowns) this.cooldowns.set(k, v - dt);
    if (this.state !== 'sleep') this.awakeFor += dt;

    reflexes(this);
    this.mover.walkSpeed = 0;
    this.want.crouch = this.want.sleep = this.want.held = 0;
    this.brain.update(this, dt);
    const motion = this.creature.motion;
    motion.crouch = approach(motion.crouch, this.want.crouch, 0.12, dt);
    motion.sleep = approach(motion.sleep, this.want.sleep, this.want.sleep ? 0.35 : 0.1, dt);
    motion.held = approach(motion.held, this.want.held, 0.05, dt);
    this.handle(this.mover.step(this.world, dt));
    this.syncCreature(dt);
    this.creature.update(dt);
  }

  private handle(events: MoverEvent[]): void {
    for (const e of events) {
      if (e.type === 'landed') {
        this.lastImpact = e.speed;
        this.creature.impact(e.speed * 0.6);
      }
      if (e.type === 'lostFooting') this.brain.interrupt(this, new Fall(false));
      if (e.type === 'carried') this.brain.current?.worldChanged?.(this);
    }
  }

  /** Copy the mover's state into the creature's motion layer. */
  private syncCreature(dt: number): void {
    const c = this.creature;
    const m = this.mover;
    c.x = m.x;
    c.y = m.y;
    const walkTarget = m.walkSpeed / Math.max(1, this.movement.walkSpeed);
    // Ease the walk cycle in and out so the body doesn't pop up and down.
    this.walkEase = dt > 0 ? approach(this.walkEase, walkTarget, 0.08, dt) : walkTarget;
    c.motion.walk = this.walkEase < 0.02 ? 0 : this.walkEase;
    c.motion.facing = m.facing;
    c.motion.airborne = m.contact.kind === 'air';
    c.motion.airVy = m.vy;
    const target = m.contact.kind === 'wall' ? 1 : 0;
    c.motion.climb = dt > 0 ? approach(c.motion.climb, target, 0.06, dt) : target;
    if (m.contact.kind === 'wall') c.motion.climbSide = m.contact.wall.side < 0 ? 1 : -1;
    const below =
      m.contact.kind === 'surface' ? null : this.world.landingBetween(m.x, m.y, Infinity);
    c.shadowY = below ? below.y : null;
  }

  // --- Hand-over --------------------------------------------------------------------------------

  snapshot(): PetSnapshot {
    const m = this.mover;
    const k = m.contact.kind;
    return {
      id: this.id,
      appearance: { ...this.creature.appearance },
      seed: this.seed,
      x: m.x,
      y: m.y,
      vx: m.vx,
      vy: m.vy,
      contact: k,
      facing: m.facing,
      heading: this.heading,
    };
  }

  static restore(snap: PetSnapshot, world: World, cursor: CursorSense): Pet {
    const pet = new Pet({
      id: snap.id,
      appearance: snap.appearance,
      seed: snap.seed,
      world,
      cursor,
      x: snap.x,
      y: snap.y,
    });
    const m = pet.mover;
    m.facing = snap.facing;
    if (snap.contact === 'air' || snap.contact === 'wall') {
      m.x = snap.x;
      m.y = snap.y;
      m.launch(snap.vx, snap.vy);
      pet.brain.interrupt(pet, new Fall(false));
    } else if (snap.contact === 'held') {
      m.x = snap.x;
      m.y = snap.y;
      pet.grab({ x: snap.x, y: snap.y - m.size.height });
    } else if (snap.heading) {
      pet.heading = snap.heading;
    }
    pet.syncCreature(0);
    return pet;
  }
}
