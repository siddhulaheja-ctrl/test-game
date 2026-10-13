import { approach, bump, clamp, easeInOutSine, TAU } from '../core/math';
import type { Rng } from '../core/random';

/** Short-lived animation layer applied on top of the blended expression. */
export interface AnimLayer {
  /** Multiplies eye openness (blinks, yawns). */
  eyeOpenMul: number;
  /** Added to mouth openness (yawns). */
  mouthOpenAdd: number;
  /** Mouth shape override toward an "O" (0..1). */
  mouthRound: number;
  /** Vertical breathing / stretch, added to body scale Y. */
  breathe: number;
  /** Where the eyes look, −1..1 in each axis. */
  lookX: number;
  lookY: number;
  /** Added head tilt, −1..1. */
  tilt: number;
  /** Arm raise added, 0..1, and a waving oscillation. */
  armRaise: number;
  armWave: number;
  /** Side-to-side sway, −1..1. */
  sway: number;
}

export type FidgetKind = 'wiggle' | 'bounce' | 'sway' | 'lookAround' | 'wave' | 'blep';
export const FIDGETS: readonly FidgetKind[] = [
  'wiggle',
  'bounce',
  'sway',
  'lookAround',
  'wave',
  'blep',
];

/** Hooks the animator calls for effects it can't produce itself (physics, particles). */
export interface AnimatorHost {
  squash(amount: number): void;
  kickAntennae(vx: number, vy: number): void;
}

interface Timed {
  t: number;
  duration: number;
}

const BLINK_TIME = 0.17;
const YAWN_TIME = 2.6;

/**
 * Keeps the creature alive when nothing else is happening: breathing, randomised blinking, eye
 * drift (small saccades), fidgets and yawns. All randomness comes from the injected RNG.
 */
export class IdleAnimator {
  enabled = true;
  /** 0 = wide awake, 1 = very sleepy. Slows breathing and makes yawns more likely. */
  sleepiness = 0;
  /** Quiet / calm: fewer fidgets. */
  calm = false;

  private time = 0;
  private breathPhase = 0;
  private blink: Timed | null = null;
  private blinkQueued = 0;
  private nextBlink: number;
  private yawn: Timed | null = null;
  private nextYawn: number;
  private fidget: (Timed & { kind: FidgetKind; dir: number }) | null = null;
  private nextFidget: number;
  private nextSaccade = 0;
  private lookTarget = { x: 0, y: 0 };
  private look = { x: 0, y: 0 };
  /** External look target (cursor, toy). Overrides the drift while set. */
  private focus: { x: number; y: number } | null = null;

  readonly layer: AnimLayer = {
    eyeOpenMul: 1,
    mouthOpenAdd: 0,
    mouthRound: 0,
    breathe: 0,
    lookX: 0,
    lookY: 0,
    tilt: 0,
    armRaise: 0,
    armWave: 0,
    sway: 0,
  };

  constructor(
    private readonly rng: Rng,
    private readonly host: AnimatorHost,
  ) {
    this.nextBlink = rng.range(1.5, 4);
    this.nextYawn = rng.range(45, 90);
    this.nextFidget = rng.range(5, 10);
  }

  get isYawning(): boolean {
    return this.yawn !== null;
  }

  get currentFidget(): FidgetKind | null {
    return this.fidget?.kind ?? null;
  }

  /** Look toward a direction (−1..1 per axis), or null to go back to idle drift. */
  setFocus(dir: { x: number; y: number } | null): void {
    this.focus = dir ? { x: clamp(dir.x, -1, 1), y: clamp(dir.y, -1, 1) } : null;
  }

  /** Cancel running blinks, yawns and fidgets (timers keep their schedule). */
  reset(): void {
    this.blink = null;
    this.blinkQueued = 0;
    this.yawn = null;
    this.fidget = null;
    this.focus = null;
    this.look = { x: 0, y: 0 };
    this.lookTarget = { x: 0, y: 0 };
    this.breathPhase = 0;
    Object.assign(this.layer, {
      eyeOpenMul: 1,
      mouthOpenAdd: 0,
      mouthRound: 0,
      breathe: 0,
      lookX: 0,
      lookY: 0,
      tilt: 0,
      armRaise: 0,
      armWave: 0,
      sway: 0,
    } satisfies AnimLayer);
  }

  triggerBlink(double = false): void {
    if (this.yawn) return;
    this.blink = { t: 0, duration: BLINK_TIME };
    this.blinkQueued = double ? 1 : 0;
  }

  triggerYawn(): void {
    this.yawn = { t: 0, duration: YAWN_TIME };
    this.blink = null;
  }

  triggerFidget(kind: FidgetKind): void {
    const durations: Record<FidgetKind, number> = {
      wiggle: 0.9,
      bounce: 0.7,
      sway: 2.2,
      lookAround: 2.4,
      wave: 1.6,
      blep: 1.4,
    };
    this.fidget = { t: 0, duration: durations[kind], kind, dir: this.rng.chance(0.5) ? 1 : -1 };
    if (kind === 'wiggle') this.host.kickAntennae(this.fidget.dir * 3.5, -1.5);
    if (kind === 'bounce') this.host.squash(0.12);
  }

  update(dt: number): void {
    this.time += dt;
    const L = this.layer;

    // Breathing: ~14 breaths/min awake, slower and deeper when sleepy.
    const rate = 0.24 - 0.1 * this.sleepiness;
    this.breathPhase = (this.breathPhase + dt * rate * TAU) % TAU;
    L.breathe = Math.sin(this.breathPhase) * (0.022 + 0.014 * this.sleepiness);

    if (!this.enabled) {
      L.eyeOpenMul = this.blink ? this.blinkCurve() : 1;
      this.advanceTimed(dt);
      this.updateLook(dt, false);
      this.applyFidget();
      this.applyYawn();
      return;
    }

    // Blinks: every 2–6 s, sometimes a double blink; sleepy creatures blink slower and longer.
    this.nextBlink -= dt;
    if (this.nextBlink <= 0 && !this.blink && !this.yawn) {
      this.triggerBlink(this.rng.chance(0.18));
      this.nextBlink = this.rng.range(2, 6) * (1 + this.sleepiness * 0.5);
    }

    // Yawns: rare when awake, frequent when sleepy.
    this.nextYawn -= dt * (1 + this.sleepiness * 4);
    if (this.nextYawn <= 0 && !this.yawn) {
      this.triggerYawn();
      this.nextYawn = this.rng.range(50, 110);
    }

    // Fidgets: small idle actions every 6–14 s (less in calm mode).
    this.nextFidget -= dt * (this.calm ? 0.35 : 1);
    if (this.nextFidget <= 0 && !this.fidget && !this.yawn) {
      const kinds: readonly (readonly [FidgetKind, number])[] = [
        ['wiggle', 3],
        ['bounce', 2],
        ['sway', 2],
        ['lookAround', 2.5],
        ['wave', this.calm ? 0 : 1],
        ['blep', 1],
      ];
      this.triggerFidget(this.rng.weighted(kinds));
      this.nextFidget = this.rng.range(6, 14);
    }

    this.advanceTimed(dt);
    L.eyeOpenMul = this.blink ? this.blinkCurve() : 1;
    this.updateLook(dt, true);
    this.applyFidget();
    this.applyYawn();
  }

  private advanceTimed(dt: number): void {
    if (this.blink) {
      this.blink.t += dt;
      if (this.blink.t >= this.blink.duration) {
        this.blink = null;
        if (this.blinkQueued > 0) {
          this.blinkQueued--;
          this.blink = { t: -0.08, duration: BLINK_TIME }; // short gap, then blink again
        }
      }
    }
    if (this.yawn) {
      this.yawn.t += dt;
      if (this.yawn.t >= this.yawn.duration) this.yawn = null;
    }
    if (this.fidget) {
      this.fidget.t += dt;
      if (this.fidget.t >= this.fidget.duration) this.fidget = null;
    }
  }

  private blinkCurve(): number {
    const b = this.blink!;
    if (b.t < 0) return 1;
    const p = b.t / b.duration;
    // Fast close, slightly slower open.
    return p < 0.4 ? 1 - p / 0.4 : (p - 0.4) / 0.6;
  }

  private updateLook(dt: number, drift: boolean): void {
    if (this.focus) {
      this.lookTarget = { ...this.focus };
    } else if (drift) {
      this.nextSaccade -= dt;
      if (this.nextSaccade <= 0) {
        // Mostly glance near the centre, sometimes further out.
        const far = this.rng.chance(0.3);
        this.lookTarget = {
          x: this.rng.range(-1, 1) * (far ? 0.9 : 0.35),
          y: this.rng.range(-0.6, 0.5) * (far ? 0.8 : 0.3),
        };
        this.nextSaccade = this.rng.range(0.8, 3.2);
      }
    }
    // Saccades are quick.
    this.look.x = approach(this.look.x, this.lookTarget.x, 0.04, dt);
    this.look.y = approach(this.look.y, this.lookTarget.y, 0.04, dt);
    this.layer.lookX = this.look.x;
    this.layer.lookY = this.look.y;
  }

  private applyFidget(): void {
    const L = this.layer;
    L.tilt = 0;
    L.sway = 0;
    L.armRaise = 0;
    L.armWave = 0;
    L.mouthRound = 0;
    const f = this.fidget;
    if (!f) return;
    const p = f.t / f.duration;
    switch (f.kind) {
      case 'sway':
        L.sway = Math.sin(p * TAU * 2) * bump(p) * 0.8;
        break;
      case 'lookAround': {
        // Look one way, then the other, with a tiny head tilt.
        const side = p < 0.45 ? f.dir : p < 0.9 ? -f.dir : 0;
        this.lookTarget = { x: side * 0.95, y: -0.1 };
        L.tilt = side * 0.25 * bump(p);
        break;
      }
      case 'wave':
        L.armRaise = bump(p) * 0.9;
        L.armWave = Math.sin(f.t * 16) * bump(p);
        break;
      case 'blep':
        // Tongue pokes out (drawn by the mouth renderer when mouthRound < 0).
        L.mouthRound = -bump(p);
        break;
      case 'wiggle':
      case 'bounce':
        break;
    }
  }

  private applyYawn(): void {
    const L = this.layer;
    L.mouthOpenAdd = 0;
    const y = this.yawn;
    if (!y) return;
    const p = y.t / y.duration;
    // Phases: inhale (0–0.25), big open (0.25–0.7), close and settle (0.7–1).
    let open: number;
    if (p < 0.25) open = easeInOutSine(p / 0.25) * 0.5;
    else if (p < 0.7) open = 0.5 + 0.5 * bump((p - 0.25) / 0.9);
    else open = 1 - easeInOutSine((p - 0.7) / 0.3);
    L.mouthOpenAdd = clamp(open, 0, 1) * 0.95;
    L.mouthRound = clamp(open, 0, 1);
    L.eyeOpenMul = Math.min(L.eyeOpenMul, 1 - clamp(open * 1.4, 0, 0.97));
    L.breathe += bump(Math.min(1, p / 0.75)) * 0.07;
    L.armRaise = Math.max(L.armRaise, bump(Math.min(1, p / 0.8)) * 0.65);
    L.tilt += Math.sin(p * Math.PI) * 0.15;
  }
}
