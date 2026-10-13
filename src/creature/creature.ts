import { clamp, lerp, TAU, type Vec2 } from '../core/math';
import { Spring, Spring2 } from '../core/physics/spring';
import { VerletChain } from '../core/physics/verlet';
import { Rng } from '../core/random';
import {
  BASE_RADIUS,
  normalizeAppearance,
  type Appearance,
  type BodyShape,
  type Palette,
} from './appearance';
import { ExpressionMixer, clampFace, type Expression, type FaceParams } from './face';
import { IdleAnimator, type FidgetKind } from './idleAnimator';
import { ParticleSystem, type ParticleKind } from './particles';
import { SoftRing, restPoint } from './softBody';
import './species';
import { getSpecies } from './species/registry';
import type { DanglyDef, SpeciesDef } from './species/types';
import type { HitShape } from '../ui/interactivity';

const GRAVITY = 2000; // px/s² at size 1
/** Launch speed of a strength-1 hop (≈ 36 px high at size 1). */
const HOP_SPEED = 380;
/** Feet stick out this far below the body (units of body radius). */
export const FEET_HEIGHT = 0.07;

/**
 * How the body is moving through the world, set every frame by the behaviour layer (walking,
 * climbing, being carried). The renderer and species drawings read it from the pose.
 */
export interface Motion {
  /** Walk cycle strength: walking speed relative to the species' walk speed (can exceed 1). */
  walk: number;
  /** Direction of travel. */
  facing: -1 | 1;
  /** Being carried by the cursor, 0..1. */
  held: number;
  /** Pendulum angle while carried (radians). */
  swing: number;
  /** Clinging to a window side, 0..1. */
  climb: number;
  /** Which side the wall is on (+1 = wall to the right of the pet). */
  climbSide: -1 | 1;
  /** Lowered body (sitting, sleeping, crouching to pounce), 0..1. */
  crouch: number;
  /** Asleep: eyes shut, slow breathing, 0..1. */
  sleep: number;
  /** In the air (thrown, jumping, falling) with this vertical speed in px/s. */
  airborne: boolean;
  airVy: number;
}

export const STILL: Motion = {
  walk: 0,
  facing: 1,
  held: 0,
  swing: 0,
  climb: 0,
  climbSide: 1,
  crouch: 0,
  sleep: 0,
  airborne: false,
  airVy: 0,
};

/** Everything the renderer needs for one frame. Local coordinates: origin at the feet, y down. */
export interface CreaturePose {
  /** Body radius in px. */
  R: number;
  /** World position of the feet (after hop lift). */
  feet: Vec2;
  /** Ground line in world space (for the shadow). */
  groundY: number;
  sx: number;
  sy: number;
  /** Body rotation in radians (tilt + sway). */
  angle: number;
  /** Body centre in local space. */
  center: Vec2;
  /** Final face after expressions and animation layers. */
  face: FaceParams;
  look: Vec2;
  /** Face offset in local px (parallax toward the look direction plus jelly lag). */
  faceShift: Vec2;
  /** Arm angles (radians, canvas convention) for [left, right]. */
  arms: [number, number];
  /** Yawn "O" (>0) or tongue blep (<0). */
  mouthRound: number;
  lift: number;
  /** Hover height above the ground in px (floating species). */
  hover: number;
  /** Seconds since the creature was created (for flicker and other time-based drawing). */
  time: number;
  motion: Motion;
  /** Walk cycle phase in radians (one step per π). */
  walkPhase: number;
}

export interface CreatureOptions {
  seed?: number;
  appearance?: Partial<Appearance>;
  x?: number;
  y?: number;
}

/**
 * The creature's body: soft physics, expressions, idle animation and particles.
 * Behaviour (where to go, what to do) lives elsewhere and drives this through its action methods.
 */
export class Creature {
  appearance: Appearance;
  /** Ground position of the feet in world px. */
  x: number;
  y: number;
  /** Overall opacity (quiet mode, hiding). */
  alpha = 1;
  /** Manual face overrides (creature lab). */
  manualFace: Partial<FaceParams> | null = null;
  /** Set each frame by the behaviour layer. */
  motion: Motion = { ...STILL };
  /** Height of the ground under the pet for its shadow (null: at its feet). */
  shadowY: number | null = null;

  readonly rng: Rng;
  readonly mixer = new ExpressionMixer();
  readonly anim: IdleAnimator;
  readonly particles: ParticleSystem;
  readonly ring = new SoftRing();
  /** Dangly chains defined by the species (antennae, gills, tails…), world space. */
  chains: VerletChain[] = [];

  private stretch = new Spring(0, 260, 13);
  private faceLag = new Spring2(0, 0, 200, 15);
  private lift = 0;
  private liftV = 0;
  private hopQueue: { t: number; strength: number } | null = null;
  private time = 0;
  private walkPhase = 0;
  private pose!: CreaturePose;
  private primed = false;

  constructor(opts: CreatureOptions = {}) {
    this.rng = new Rng(opts.seed ?? 0xc0ffee);
    this.appearance = normalizeAppearance(opts.appearance ?? {});
    this.x = opts.x ?? 0;
    this.y = opts.y ?? 0;
    this.particles = new ParticleSystem(this.rng.fork());
    const animRng = this.rng.fork();
    this.anim = new IdleAnimator(animRng, {
      squash: (a) => this.squash(a),
      kickChains: (vx, vy) => this.kickChains(vx, vy),
    });
    this.applySpecies();
    this.computePose();
  }

  // --- Appearance ------------------------------------------------------------------------------

  get R(): number {
    return BASE_RADIUS * this.appearance.size;
  }
  get species(): SpeciesDef {
    return getSpecies(this.appearance.species);
  }
  get palette(): Palette {
    const sp = this.species;
    return sp.palettes[this.appearance.palette] ?? sp.palettes[sp.defaultPalette]!;
  }
  get shape(): BodyShape {
    return this.species.shape;
  }

  setAppearance(a: Partial<Appearance>): void {
    this.appearance = normalizeAppearance({ ...this.appearance, ...a });
    this.applySpecies();
    this.primed = false;
    this.computePose();
  }

  /** Build the species' chains and physics tuning for the current size. */
  private applySpecies(): void {
    const sp = this.species;
    const R = this.R;
    this.chains = sp.dangly.map(
      (d) =>
        new VerletChain(
          d.segments + 1,
          d.segLen * R,
          d.stiffness ?? 0.2,
          d.friction ?? 0.9,
          d.gravity ?? 0,
        ),
    );
    const soft = sp.softness ?? 1;
    this.ring.stiffness = 170 / soft;
    this.ring.coupling = 420 / soft;
  }

  /** Ring impulses are scaled by softness so stiff bodies (armour) barely dent. */
  private get soft(): number {
    return this.species.softness ?? 1;
  }

  // --- Actions ---------------------------------------------------------------------------------

  /** Show an expression briefly, then fade back to the base mood. */
  express(name: Expression, intensity = 1, seconds = 1.8): void {
    this.mixer.react(name, intensity, seconds);
  }

  /** Set the resting expression mix (mood). */
  setMood(weights: Partial<Record<Expression, number>>): void {
    this.mixer.setBase(weights);
  }

  /** Squash (positive) or stretch (negative) impulse. */
  squash(amount: number): void {
    this.stretch.impulse(-amount * 9);
    this.ring.impulse(Math.PI / 2, -amount * 2.2 * this.soft, 1.2);
  }

  /** Poked at a world point: jiggle locally, look surprised, squash. */
  poke(wx: number, wy: number): void {
    const p = this.pose;
    const cx = p.feet.x;
    const cy = p.feet.y + p.center.y * p.sy;
    const angle = Math.atan2(wy - cy, wx - cx) - p.angle;
    this.ring.impulse(angle, -3.2 * this.soft, 0.5);
    this.squash(0.1);
    this.faceLag.x.impulse(clamp(cx - wx, -30, 30) * 2);
    this.kickChains((wx < cx ? 1 : -1) * 2.5, -2);
    this.express(this.rng.chance(0.75) ? 'surprised' : 'happy', 1, 0.9);
    this.anim.triggerBlink();
  }

  /** Jump with a short anticipation crouch. `strength` ≈ 1 is a small happy hop. */
  hop(strength = 1): void {
    if (this.lift > 0 || this.hopQueue) return;
    this.hopQueue = { t: 0, strength };
    this.stretch.target = -0.1; // crouch (squash) during anticipation
  }

  yawn(): void {
    this.anim.triggerYawn();
  }

  blink(double = false): void {
    this.anim.triggerBlink(double);
  }

  fidget(kind: FidgetKind): void {
    this.anim.triggerFidget(kind);
  }

  /** Nudge every dangly chain (a flick of antennae, gills, tails). */
  kickChains(vx: number, vy: number): void {
    const s = this.appearance.size;
    for (const chain of this.chains) chain.kick(vx * s, vy * s);
  }

  /** Look toward a world point (or stop with null). */
  lookAt(point: Vec2 | null): void {
    if (!point) {
      this.anim.setFocus(null);
      return;
    }
    const p = this.pose;
    const cx = p.feet.x;
    const cy = p.feet.y + p.center.y * p.sy;
    const range = this.R * 6;
    this.anim.setFocus({ x: (point.x - cx) / range, y: (point.y - cy) / (range * 0.8) });
  }

  /** Emit particles from a sensible spot for the kind. */
  emit(kind: ParticleKind, count = 1): void {
    const p = this.pose;
    const R = p.R;
    const top = p.feet.y - (this.shape.ryTop + this.shape.ryBottom + FEET_HEIGHT) * R * p.sy;
    const side = this.rng.chance(0.5) ? 1 : -1;
    switch (kind) {
      case 'dust':
        this.particles.emit('dust', p.feet.x - R * 0.6, p.groundY - 2, Math.ceil(count / 2), R, {
          dir: Math.PI,
          spread: 0.9,
        });
        this.particles.emit(
          'dust',
          p.feet.x + R * 0.6,
          p.groundY - 2,
          Math.floor(count / 2) || 1,
          R,
          { dir: 0, spread: 0.9 },
        );
        break;
      case 'sweat':
        this.particles.emit('sweat', p.feet.x + side * R * 0.7, top + R * 0.35, count, R, {
          dir: -Math.PI / 2 + side * 0.6,
          spread: 0.5,
        });
        break;
      case 'zzz':
        this.particles.emit('zzz', p.feet.x + R * 0.55, top + R * 0.1, count, R);
        break;
      case 'exclaim':
      case 'question':
        this.particles.emit(kind, p.feet.x + R * 0.75, top - R * 0.15, 1, R);
        break;
      default:
        this.particles.emit(kind, p.feet.x, top + R * 0.25, count, R);
    }
  }

  // --- Simulation ------------------------------------------------------------------------------

  update(dt: number): void {
    this.time += dt;
    const M = this.motion;
    this.walkPhase =
      (this.walkPhase + M.walk * (this.species.movement?.stepHz ?? 2.2) * Math.PI * dt) % TAU;
    if (M.walk === 0) this.walkPhase *= 1 - Math.min(1, dt * 6);
    this.anim.sleepiness = M.sleep;
    this.mixer.update(dt);
    this.anim.update(dt);

    // Hop: crouch for 0.13 s, then launch.
    if (this.hopQueue) {
      this.hopQueue.t += dt;
      if (this.hopQueue.t >= 0.13) {
        const v = HOP_SPEED * Math.sqrt(this.appearance.size) * this.hopQueue.strength;
        this.liftV = v;
        this.lift = 0.01;
        this.stretch.target = 0;
        this.stretch.impulse(1.6 * this.hopQueue.strength);
        this.faceLag.y.impulse(v * 0.1);
        this.ring.inertia(0, 1.1 * this.soft);
        this.kickChains(0, 3 * this.hopQueue.strength);
        this.hopQueue = null;
      }
    }

    // Airborne.
    if (this.lift > 0) {
      const g = GRAVITY * Math.sqrt(this.appearance.size);
      this.liftV -= g * dt;
      this.lift += this.liftV * dt;
      if (this.lift <= 0) this.land(-this.liftV);
    }

    this.species.update?.(this, dt);
    this.stretch.step(dt);
    this.ring.step(dt);
    this.faceLag.step(dt);
    this.particles.update(dt);
    this.computePose();
    this.updateDangly(dt);
  }

  private land(impact: number): void {
    this.lift = 0;
    this.liftV = 0;
    this.impact(impact);
  }

  /** Landing squash, jiggle and dust for an impact at `speed` px/s (hops, falls, throws). */
  impact(speed: number): void {
    const impact = speed / Math.sqrt(this.appearance.size);
    const k = clamp(impact / HOP_SPEED, 0, 2.5);
    this.stretch.impulse(-k * 1.9);
    this.ring.impulse(Math.PI / 2, -k * 1.6 * this.soft, 0.7);
    this.ring.inertia(0, k * 1.4 * this.soft);
    this.faceLag.y.impulse(k * 50);
    this.kickChains(0, k * 4);
    if (k > 0.35) this.emit('dust', Math.round(2 + k * 3));
  }

  /** Dangly chains follow the body in world space. */
  private updateDangly(dt: number): void {
    const defs = this.species.dangly;
    this.chains.forEach((chain, i) => {
      const rest = this.chainRest(defs[i]!);
      if (!this.primed) chain.reset(rest);
      else chain.step(rest, dt);
    });
    this.primed = true;
  }

  /** Local (feet-origin) point → world. */
  toWorld(lx: number, ly: number, pose: CreaturePose = this.pose): Vec2 {
    const x = lx * pose.sx;
    const y = ly * pose.sy;
    const c = Math.cos(pose.angle);
    const s = Math.sin(pose.angle);
    return { x: pose.feet.x + x * c - y * s, y: pose.feet.y + x * s + y * c };
  }

  /** Rest pose of a dangly chain in world space. */
  chainRest(d: DanglyDef): Vec2[] {
    const p = this.pose;
    const R = p.R;
    const local = restPoint(this.shape, d.rootAngle);
    const root = this.toWorld(local.x * R * d.rootInset, p.center.y + local.y * R * d.rootInset);
    const droop = clamp(
      Math.max(d.droopFor?.(p.face) ?? p.face.droop, p.motion.held * 1.1) + (d.droopBias ?? 0),
      0,
      1.1,
    );
    const pts: Vec2[] = [root];
    let a = d.restAngle + p.angle;
    let cur = root;
    const seg = R * d.segLen;
    for (let i = 1; i <= d.segments; i++) {
      // Droop bends later segments more.
      a += d.curl + droop * d.droopCurl * (1 + 0.43 * i);
      cur = { x: cur.x + Math.cos(a) * seg, y: cur.y + Math.sin(a) * seg };
      pts.push(cur);
    }
    return pts;
  }

  private computePose(): void {
    const R = this.R;
    const L = this.anim.layer;
    let face = this.mixer.face();
    const bias = this.species.faceBias;
    if (bias) {
      face = { ...face };
      for (const k of Object.keys(bias) as (keyof FaceParams)[]) face[k] += bias[k] ?? 0;
    }
    if (this.manualFace) face = { ...face, ...this.manualFace };
    const M = this.motion;
    face = clampFace({
      ...face,
      eyeOpen: face.eyeOpen * L.eyeOpenMul * (1 - M.sleep),
      mouthOpen: Math.min(1, face.mouthOpen + L.mouthOpenAdd),
      tilt: face.tilt + L.tilt,
      // Clinging to a wall needs both arms up; dangling lets them hang.
      armRaise: Math.max(face.armRaise, L.armRaise, M.climb * 0.95) * (1 - M.held * 0.85),
    });

    // Squash/stretch: spring plus breathing, plus stretch while moving fast in the air or dangling.
    const airStretch =
      (this.lift > 0 ? clamp(Math.abs(this.liftV) * 0.00022, 0, 0.12) : 0) +
      (M.airborne ? clamp(Math.abs(M.airVy) * 0.0001, 0, 0.12) : 0) +
      M.held * 0.08;
    // Walk cycle: the body rises a little on each step and settles between steps.
    const walk = Math.min(1, M.walk);
    const stepUp = Math.abs(Math.sin(this.walkPhase));
    const walkLift = R * 0.07 * walk * stepUp;
    const walkSquash = 0.035 * walk * (1 - stepUp);
    const sy = 1 + this.stretch.value + L.breathe + airStretch - walkSquash - 0.12 * M.crouch;
    const sx =
      1 -
      (this.stretch.value + airStretch) * 0.65 -
      L.breathe * 0.45 +
      walkSquash * 0.6 +
      0.06 * M.crouch;

    const angle =
      face.tilt * 0.2 +
      L.sway * 0.09 +
      M.facing * walk * 0.07 +
      M.held * M.swing +
      M.climb * M.climbSide * 0.1;
    const hoverAmt = this.species.hover ?? 0;
    const hover = hoverAmt > 0 ? R * hoverAmt * (1 + 0.14 * Math.sin(this.time * 2.1)) : 0;
    const center = { x: 0, y: -(this.shape.ryBottom + FEET_HEIGHT) * R };
    const armRest = 1.15;
    const armUp = -0.75;
    const arm = lerp(armRest, armUp, face.armRaise);
    const wave = L.armWave * 0.5;

    this.pose = {
      R,
      feet: { x: this.x, y: this.y - this.lift - hover - walkLift },
      groundY: this.shadowY ?? this.y,
      sx,
      sy,
      angle,
      center,
      face,
      // Walking looks where it's going.
      look: { x: lerp(L.lookX, M.facing * 0.85, walk), y: L.lookY * (1 - walk) },
      faceShift: {
        x: L.lookX * R * 0.1 + this.faceLag.x.value,
        y: L.lookY * R * 0.06 + this.faceLag.y.value,
      },
      // Left arm mirrors the right one (π − angle).
      arms: [Math.PI - arm, arm + wave],
      mouthRound: L.mouthRound,
      lift: this.lift,
      hover,
      time: this.time,
      motion: { ...M },
      walkPhase: this.walkPhase,
    };
  }

  getPose(): CreaturePose {
    return this.pose;
  }

  /** Approximate hit shape (an ellipse around the body) for click-through decisions. */
  hitShape(): HitShape {
    const p = this.pose;
    const shape = this.shape;
    const rx = shape.rx * p.R * p.sx * 1.08;
    const ry = ((shape.ryTop + shape.ryBottom) / 2) * p.R * p.sy * 1.05;
    const cx = p.feet.x;
    const cy = p.feet.y + p.center.y * p.sy;
    return {
      distanceOutside(x, y) {
        const r = Math.hypot((x - cx) / rx, (y - cy) / ry);
        return (r - 1) * ((rx + ry) / 2);
      },
    };
  }

  /** Bounding box in world space, for dirty-rect checks and tests. */
  bounds(): { x: number; y: number; w: number; h: number } {
    const p = this.pose;
    const shape = this.shape;
    const w = shape.rx * p.R * 2.6;
    const h = (shape.ryTop + shape.ryBottom + FEET_HEIGHT + 0.9) * p.R * p.sy;
    return { x: p.feet.x - w / 2, y: p.feet.y - h, w, h: h + 4 };
  }

  /**
   * How much is moving right now (for adaptive frame rate). Slow breathing sway of dangly chains
   * (under ~0.5 px per step) doesn't count: it still looks smooth at the idle frame rate.
   */
  activity(): number {
    const chains = this.chains.reduce((m, c) => m + c.motion(), 0);
    return (
      Math.abs(this.stretch.velocity) +
      this.ring.energy() +
      Math.max(0, chains - 1) +
      (this.lift > 0 ? 10 : 0) +
      this.particles.count
    );
  }

  get airborne(): boolean {
    return this.lift > 0 || this.hopQueue !== null;
  }

  get age(): number {
    return this.time;
  }

  /** Clear particles and running animations, then settle (lab and tests). */
  reset(): void {
    this.particles.clear();
    this.anim.reset();
    this.mixer.react('neutral', 0, 0);
    this.settle();
  }

  /** Immediately settle physics and expression transitions (lab and tests). */
  settle(): void {
    this.mixer.settle();
    this.stretch.snap(0);
    this.faceLag.snap(0, 0);
    this.ring.reset();
    this.lift = 0;
    this.liftV = 0;
    this.hopQueue = null;
    this.primed = false;
    this.computePose();
    this.updateDangly(0);
  }
}
