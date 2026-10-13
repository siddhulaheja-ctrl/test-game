import { approach, clamp } from '../core/math';

/**
 * Parametric face and pose. Every expression is a point in this space, so any mix of expressions is
 * a weighted average, and the renderer only ever reads these numbers.
 */
export interface FaceParams {
  /** 0 closed … 1 open … 1.3 wide. */
  eyeOpen: number;
  /** Lower lid push-up (happy crescent eyes), 0..1. */
  eyeSquint: number;
  /** Upper lid slant: −1 sad (outer corners down) … +1 cross (inner corners down). */
  lidTilt: number;
  /** Pupil / iris size multiplier. */
  pupilScale: number;
  /** Brow height, −1 low … +1 raised. */
  browHeight: number;
  /** Brow slant, −1 worried … +1 angry. */
  browTilt: number;
  /** One brow raised (curious), 0..1. */
  browAsym: number;
  /** −1 frown … +1 smile. */
  mouthCurve: number;
  /** 0 closed … 1 wide open. */
  mouthOpen: number;
  /** Width multiplier. */
  mouthWidth: number;
  /** Wavy, nervous mouth line, 0..1. */
  mouthWobble: number;
  /** Cheek blush, 0..1. */
  blush: number;
  /** Whole-body head tilt, −1..1 (≈ ±12°). */
  tilt: number;
  /** Arms up, 0..1. */
  armRaise: number;
  /** Antenna droop, 0 perky … 1 limp. */
  droop: number;
  /** Extra eye sparkle, 0..1. */
  sparkle: number;
}

export const FACE_KEYS = [
  'eyeOpen',
  'eyeSquint',
  'lidTilt',
  'pupilScale',
  'browHeight',
  'browTilt',
  'browAsym',
  'mouthCurve',
  'mouthOpen',
  'mouthWidth',
  'mouthWobble',
  'blush',
  'tilt',
  'armRaise',
  'droop',
  'sparkle',
] as const satisfies readonly (keyof FaceParams)[];

/** Slider ranges for each parameter (used by the lab and for clamping). */
export const FACE_RANGES: Record<keyof FaceParams, readonly [number, number]> = {
  eyeOpen: [0, 1.3],
  eyeSquint: [0, 1],
  lidTilt: [-1, 1],
  pupilScale: [0.4, 1.5],
  browHeight: [-1, 1],
  browTilt: [-1, 1],
  browAsym: [0, 1],
  mouthCurve: [-1, 1],
  mouthOpen: [0, 1],
  mouthWidth: [0.4, 1.6],
  mouthWobble: [0, 1],
  blush: [0, 1],
  tilt: [-1, 1],
  armRaise: [0, 1],
  droop: [0, 1],
  sparkle: [0, 1],
};

export const NEUTRAL_FACE: FaceParams = {
  eyeOpen: 1,
  eyeSquint: 0,
  lidTilt: 0,
  pupilScale: 1,
  browHeight: 0,
  browTilt: 0,
  browAsym: 0,
  mouthCurve: 0.4,
  mouthOpen: 0,
  mouthWidth: 0.9,
  mouthWobble: 0,
  blush: 0.4,
  tilt: 0,
  armRaise: 0,
  droop: 0.12,
  sparkle: 0,
};

const face = (p: Partial<FaceParams>): FaceParams => ({ ...NEUTRAL_FACE, ...p });

export const EXPRESSIONS = {
  neutral: NEUTRAL_FACE,
  happy: face({
    eyeOpen: 0.95,
    eyeSquint: 0.62,
    browHeight: 0.25,
    mouthCurve: 1,
    mouthOpen: 0.35,
    mouthWidth: 1.15,
    blush: 0.75,
    armRaise: 0.25,
    droop: 0,
    pupilScale: 1.05,
    sparkle: 0.4,
  }),
  sad: face({
    eyeOpen: 0.82,
    eyeSquint: 0,
    lidTilt: -0.75,
    pupilScale: 1.2,
    browHeight: 0.35,
    browTilt: -0.9,
    mouthCurve: -0.85,
    mouthOpen: 0.05,
    mouthWidth: 0.75,
    blush: 0.2,
    droop: 0.95,
    tilt: -0.15,
  }),
  sleepy: face({
    eyeOpen: 0.32,
    eyeSquint: 0.1,
    lidTilt: -0.25,
    pupilScale: 0.95,
    browHeight: -0.25,
    mouthCurve: 0.15,
    mouthOpen: 0.06,
    mouthWidth: 0.7,
    blush: 0.3,
    droop: 0.7,
    tilt: 0.12,
  }),
  surprised: face({
    eyeOpen: 1.28,
    eyeSquint: 0,
    pupilScale: 0.7,
    browHeight: 0.95,
    mouthCurve: 0,
    mouthOpen: 0.78,
    mouthWidth: 0.62,
    blush: 0.25,
    armRaise: 0.7,
    droop: 0,
  }),
  annoyed: face({
    eyeOpen: 0.72,
    eyeSquint: 0.22,
    lidTilt: 0.7,
    pupilScale: 0.85,
    browHeight: -0.45,
    browTilt: 0.95,
    mouthCurve: -0.35,
    mouthWidth: 0.72,
    mouthWobble: 0.5,
    blush: 0.15,
    droop: 0.25,
  }),
  curious: face({
    eyeOpen: 1.12,
    eyeSquint: 0,
    pupilScale: 1.15,
    browHeight: 0.3,
    browAsym: 1,
    mouthCurve: 0.15,
    mouthOpen: 0.14,
    mouthWidth: 0.55,
    blush: 0.35,
    tilt: 0.65,
    droop: 0,
  }),
  excited: face({
    eyeOpen: 1.12,
    eyeSquint: 0.3,
    pupilScale: 1.25,
    browHeight: 0.6,
    mouthCurve: 1,
    mouthOpen: 0.72,
    mouthWidth: 1.25,
    blush: 0.9,
    armRaise: 1,
    droop: 0,
    sparkle: 1,
  }),
  scared: face({
    eyeOpen: 1.22,
    eyeSquint: 0,
    lidTilt: -0.3,
    pupilScale: 0.55,
    browHeight: 0.75,
    browTilt: -0.75,
    mouthCurve: -0.5,
    mouthOpen: 0.35,
    mouthWidth: 0.9,
    mouthWobble: 1,
    blush: 0.1,
    armRaise: 0.85,
    droop: 0.55,
  }),
} as const satisfies Record<string, FaceParams>;

export type Expression = keyof typeof EXPRESSIONS;
export const EXPRESSION_NAMES = Object.keys(EXPRESSIONS) as Expression[];

export type ExpressionWeights = Partial<Record<Expression, number>>;

/**
 * Blend expressions by weight. Any weight not used (sum < 1) goes to neutral, so a single
 * expression at 0.5 gives a half-strength version of it.
 */
export function blendFace(weights: ExpressionWeights): FaceParams {
  let total = 0;
  for (const name of EXPRESSION_NAMES) {
    if (name === 'neutral') continue;
    total += Math.max(0, weights[name] ?? 0);
  }
  const neutral = Math.max(0, weights.neutral ?? 0) + Math.max(0, 1 - total);
  const sum = total + neutral;
  const out = { ...NEUTRAL_FACE };
  for (const key of FACE_KEYS) {
    let v = 0;
    for (const name of EXPRESSION_NAMES) {
      const w = name === 'neutral' ? neutral : Math.max(0, weights[name] ?? 0);
      if (w > 0) v += EXPRESSIONS[name][key] * w;
    }
    out[key] = v / sum;
  }
  return out;
}

export function clampFace(f: FaceParams): FaceParams {
  const out = { ...f };
  for (const key of FACE_KEYS) {
    const [lo, hi] = FACE_RANGES[key];
    out[key] = clamp(f[key], lo, hi);
  }
  return out;
}

/**
 * Smoothly mixes a persistent base mood with short-lived reactions.
 * - `setBase()` sets the resting mix (driven by mood later on).
 * - `react()` shows an expression for a while, then fades back to the base.
 */
export class ExpressionMixer {
  private base: ExpressionWeights = { neutral: 1 };
  private current: Record<Expression, number>;
  private reaction: { name: Expression; intensity: number; remaining: number } | null = null;
  /** Seconds to cover half the distance to a new expression. */
  halfLife = 0.09;

  constructor() {
    this.current = Object.fromEntries(
      EXPRESSION_NAMES.map((n) => [n, n === 'neutral' ? 1 : 0]),
    ) as Record<Expression, number>;
  }

  setBase(weights: ExpressionWeights): void {
    this.base = { ...weights };
  }

  getBase(): ExpressionWeights {
    return { ...this.base };
  }

  react(name: Expression, intensity = 1, seconds = 1.6): void {
    this.reaction =
      seconds > 0 ? { name, intensity: clamp(intensity, 0, 1), remaining: seconds } : null;
  }

  get activeReaction(): Expression | null {
    return this.reaction?.name ?? null;
  }

  /** Target weights right now (base, overlaid by any reaction). */
  target(): Record<Expression, number> {
    const r = this.reaction;
    const t = {} as Record<Expression, number>;
    const k = r ? r.intensity : 0;
    for (const name of EXPRESSION_NAMES) {
      t[name] = (this.base[name] ?? 0) * (1 - k) + (r && r.name === name ? k : 0);
    }
    return t;
  }

  update(dt: number): void {
    if (this.reaction) {
      this.reaction.remaining -= dt;
      if (this.reaction.remaining <= 0) this.reaction = null;
    }
    const t = this.target();
    for (const name of EXPRESSION_NAMES) {
      this.current[name] = approach(this.current[name], t[name], this.halfLife, dt);
    }
  }

  /** Jump straight to the target (no transition). */
  settle(): void {
    Object.assign(this.current, this.target());
  }

  weights(): Record<Expression, number> {
    return { ...this.current };
  }

  face(): FaceParams {
    return blendFace(this.current);
  }

  /** The expression with the highest current weight. */
  dominant(): Expression {
    let best: Expression = 'neutral';
    let bestW = -1;
    for (const name of EXPRESSION_NAMES) {
      if (this.current[name] > bestW) {
        best = name;
        bestW = this.current[name];
      }
    }
    return best;
  }
}
