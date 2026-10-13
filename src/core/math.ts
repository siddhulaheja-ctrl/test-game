export const TAU = Math.PI * 2;

export const clamp = (v: number, min: number, max: number): number =>
  v < min ? min : v > max ? max : v;

export const clamp01 = (v: number): number => clamp(v, 0, 1);

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const invLerp = (a: number, b: number, v: number): number =>
  a === b ? 0 : (v - a) / (b - a);

export const remap = (v: number, a0: number, a1: number, b0: number, b1: number): number =>
  lerp(b0, b1, invLerp(a0, a1, v));

/**
 * Frame-rate independent exponential approach: move `current` toward `target`,
 * covering half the distance every `halfLife` seconds.
 */
export const approach = (current: number, target: number, halfLife: number, dt: number): number =>
  halfLife <= 0 ? target : target + (current - target) * Math.pow(2, -dt / halfLife);

export const easeOutBack = (t: number, overshoot = 1.70158): number => {
  const x = clamp01(t) - 1;
  return x * x * ((overshoot + 1) * x + overshoot) + 1;
};

export const easeInOutSine = (t: number): number => -(Math.cos(Math.PI * clamp01(t)) - 1) / 2;

/** 0 → 1 → 0 over t in [0, 1]. */
export const bump = (t: number): number => Math.sin(Math.PI * clamp01(t));

export interface Vec2 {
  x: number;
  y: number;
}
