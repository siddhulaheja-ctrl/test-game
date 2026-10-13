import { clamp, lerp, type Vec2 } from '../core/math';
import { Spring, Spring2 } from '../core/physics/spring';
import { VerletChain } from '../core/physics/verlet';
import { Rng } from '../core/random';
import {
  BASE_RADIUS,
  BODY_SHAPES,
  DEFAULT_APPEARANCE,
  EYE_STYLES,
  PALETTES,
  normalizeAppearance,
  type AccessoryId,
  type Appearance,
  type BodyShape,
  type EyeStyle,
  type Palette,
} from './appearance';
import { ExpressionMixer, clampFace, type Expression, type FaceParams } from './face';
import { IdleAnimator, type FidgetKind } from './idleAnimator';
import { ParticleSystem, type ParticleKind } from './particles';
import { SoftRing, restPoint } from './softBody';
import type { HitShape } from '../ui/interactivity';

const GRAVITY = 2000; // px/s² at size 1
/** Launch speed of a strength-1 hop (≈ 36 px high at size 1). */
const HOP_SPEED = 380;
const ANTENNA_SEGMENTS = 4;
/** Feet stick out this far below the body (units of body radius). */
export const FEET_HEIGHT = 0.07;

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

  readonly rng: Rng;
  readonly mixer = new ExpressionMixer();
  readonly anim: IdleAnimator;
  readonly particles: ParticleSystem;
  readonly ring = new SoftRing();
  readonly antennae: [VerletChain, VerletChain];
  /** Scarf tail (accessory physics). */
  readonly scarfTail = new VerletChain(4, 1, 0.12, 0.88, 900);
  /** Beanie pom-pom (accessory physics), world px. */
  readonly pompom = new Spring2(0, 0, 260, 10);

  private stretch = new Spring(0, 260, 13);
  private faceLag = new Spring2(0, 0, 200, 15);
  private lift = 0;
  private liftV = 0;
  private hopQueue: { t: number; strength: number } | null = null;
  private time = 0;
  private pose!: CreaturePose;
  private primed = false;

  constructor(opts: CreatureOptions = {}) {
    this.rng = new Rng(opts.seed ?? 0xc0ffee);
    this.appearance = normalizeAppearance({ ...DEFAULT_APPEARANCE, ...opts.appearance });
    this.x = opts.x ?? 0;
    this.y = opts.y ?? 0;
    this.particles = new ParticleSystem(this.rng.fork());
    const animRng = this.rng.fork();
    this.anim = new IdleAnimator(animRng, {
      squash: (a) => this.squash(a),
      kickAntennae: (vx, vy) => this.kickAntennae(vx, vy),
    });
    const seg = () => this.R * 0.15;
    this.antennae = [
      new VerletChain(ANTENNA_SEGMENTS + 1, seg(), 0.2, 0.9),
      new VerletChain(ANTENNA_SEGMENTS + 1, seg(), 0.2, 0.9),
    ];
    this.scarfTail.segment = this.R * 0.13;
    this.computePose();
  }

  // --- Appearance ------------------------------------------------------------------------------

  get R(): number {
    return BASE_RADIUS * this.appearance.size;
  }
  get palette(): Palette {
    return PALETTES[this.appearance.palette];
  }
  get shape(): BodyShape {
    return BODY_SHAPES[this.appearance.body];
  }
  get eyeStyle(): EyeStyle {
    return EYE_STYLES[this.appearance.eyes];
  }
  hasAccessory(id: AccessoryId): boolean {
    return this.appearance.accessories.includes(id);
  }

  setAppearance(a: Partial<Appearance>): void {
    this.appearance = normalizeAppearance({ ...this.appearance, ...a });
    for (const chain of this.antennae) chain.segment = this.R * 0.15;
    this.scarfTail.segment = this.R * 0.13;
    this.primed = false;
    this.computePose();
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
    this.ring.impulse(Math.PI / 2, -amount * 2.2, 1.2);
  }

  /** Poked at a world point: jiggle locally, look surprised, squash. */
  poke(wx: number, wy: number): void {
    const p = this.pose;
    const cx = p.feet.x;
    const cy = p.feet.y + p.center.y * p.sy;
    const angle = Math.atan2(wy - cy, wx - cx) - p.angle;
    this.ring.impulse(angle, -3.2, 0.5);
    this.squash(0.1);
    this.faceLag.x.impulse(clamp(cx - wx, -30, 30) * 2);
    this.kickAntennae((wx < cx ? 1 : -1) * 2.5, -2);
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

  kickAntennae(vx: number, vy: number): void {
    const s = this.appearance.size;
    this.antennae[0].kick(vx * s, vy * s);
    this.antennae[1].kick(vx * s, vy * s);
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
        this.ring.inertia(0, 1.1);
        this.kickAntennae(0, 3 * this.hopQueue.strength);
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
    const k = clamp(impact / HOP_SPEED, 0, 2.5);
    this.stretch.impulse(-k * 1.9);
    this.ring.impulse(Math.PI / 2, -k * 1.6, 0.7);
    this.ring.inertia(0, k * 1.4);
    this.faceLag.y.impulse(k * 50);
    this.kickAntennae(0, k * 4);
    if (k > 0.35) this.emit('dust', Math.round(2 + k * 3));
  }

  /** Antennae, pom-pom and scarf tail follow the body in world space. */
  private updateDangly(dt: number): void {
    const restA = this.antennaRest(0);
    const restB = this.antennaRest(1);
    if (!this.primed) {
      this.antennae[0].reset(restA);
      this.antennae[1].reset(restB);
    } else {
      this.antennae[0].step(restA, dt);
      this.antennae[1].step(restB, dt);
    }
    const pom = this.pompomAnchor();
    if (!this.primed) this.pompom.snap(pom.x, pom.y);
    this.pompom.setTarget(pom.x, pom.y);
    this.pompom.step(dt);
    const scarf = this.scarfRest();
    if (!this.primed) this.scarfTail.reset(scarf);
    else this.scarfTail.step(scarf, dt);
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

  /** Rest pose of an antenna chain in world space. side 0 = left, 1 = right. */
  antennaRest(side: 0 | 1): Vec2[] {
    const p = this.pose;
    const R = p.R;
    const dir = side === 0 ? -1 : 1;
    const local = restPoint(this.shape, -Math.PI / 2 + dir * 0.42);
    const root = this.toWorld(local.x * R * 0.9, p.center.y + local.y * R * 0.9);
    // Weird-but-cute: the left antenna is always a little floppier.
    const droop = clamp(p.face.droop + (side === 0 ? 0.15 : 0), 0, 1.1);
    const pts: Vec2[] = [root];
    let a = -Math.PI / 2 + dir * 0.36 + p.angle;
    let cur = root;
    const seg = R * 0.15;
    for (let i = 1; i <= ANTENNA_SEGMENTS; i++) {
      a += dir * (0.1 + droop * (0.28 + 0.12 * i));
      cur = { x: cur.x + Math.cos(a) * seg, y: cur.y + Math.sin(a) * seg };
      pts.push(cur);
    }
    return pts;
  }

  private pompomAnchor(): Vec2 {
    const p = this.pose;
    const top = restPoint(this.shape, -Math.PI / 2).y;
    return this.toWorld(0, p.center.y + (top - 0.08) * p.R);
  }

  private scarfRest(): Vec2[] {
    const p = this.pose;
    const R = p.R;
    const y = p.center.y + 0.58 * R;
    const knot = this.toWorld(R * 0.52, y);
    const pts: Vec2[] = [knot];
    const a = Math.PI / 2 - 0.35 + p.angle;
    for (let i = 1; i < 4; i++) {
      const prev = pts[i - 1]!;
      pts.push({ x: prev.x + Math.cos(a) * R * 0.13, y: prev.y + Math.sin(a) * R * 0.13 });
    }
    return pts;
  }

  private computePose(): void {
    const R = this.R;
    const L = this.anim.layer;
    let face = this.mixer.face();
    if (this.manualFace) face = { ...face, ...this.manualFace };
    face = clampFace({
      ...face,
      eyeOpen: face.eyeOpen * L.eyeOpenMul,
      mouthOpen: Math.min(1, face.mouthOpen + L.mouthOpenAdd),
      tilt: face.tilt + L.tilt,
      armRaise: Math.max(face.armRaise, L.armRaise),
    });

    // Squash/stretch: spring plus breathing, plus stretch while moving fast in the air.
    const airStretch = this.lift > 0 ? clamp(Math.abs(this.liftV) * 0.00022, 0, 0.12) : 0;
    const sy = 1 + this.stretch.value + L.breathe + airStretch;
    const sx = 1 - (this.stretch.value + airStretch) * 0.65 - L.breathe * 0.45;

    const angle = face.tilt * 0.2 + L.sway * 0.09;
    const center = { x: 0, y: -(this.shape.ryBottom + FEET_HEIGHT) * R };
    const armRest = 1.15;
    const armUp = -0.75;
    const arm = lerp(armRest, armUp, face.armRaise);
    const wave = L.armWave * 0.5;

    this.pose = {
      R,
      feet: { x: this.x, y: this.y - this.lift },
      groundY: this.y,
      sx,
      sy,
      angle,
      center,
      face,
      look: { x: L.lookX, y: L.lookY },
      faceShift: {
        x: L.lookX * R * 0.1 + this.faceLag.x.value,
        y: L.lookY * R * 0.06 + this.faceLag.y.value,
      },
      // Left arm mirrors the right one (π − angle).
      arms: [Math.PI - arm, arm + wave],
      mouthRound: L.mouthRound,
      lift: this.lift,
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

  /** Bounding box in world space (body plus antennae), for dirty-rect checks and tests. */
  bounds(): { x: number; y: number; w: number; h: number } {
    const p = this.pose;
    const shape = this.shape;
    const w = shape.rx * p.R * 2.6;
    const h = (shape.ryTop + shape.ryBottom + FEET_HEIGHT + 0.9) * p.R * p.sy;
    return { x: p.feet.x - w / 2, y: p.feet.y - h, w, h: h + 4 };
  }

  /**
   * How much is moving right now (for adaptive frame rate). Slow breathing sway of the antennae
   * (under ~0.5 px per step) doesn't count: it still looks smooth at the idle frame rate.
   */
  activity(): number {
    const antennae = this.antennae[0].motion() + this.antennae[1].motion();
    return (
      Math.abs(this.stretch.velocity) +
      this.ring.energy() +
      Math.max(0, antennae - 1) +
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
