import { TAU, type Vec2 } from '../core/math';
import type { BodyShape } from './appearance';

/**
 * Point on the body's rest outline at angle `theta` (0 = right, π/2 = bottom; canvas y-down),
 * relative to the body centre, in units of body radius.
 */
export function restPoint(shape: BodyShape, theta: number): Vec2 {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const bottom = s > 0;
  const n = bottom ? shape.nBottom : shape.nTop;
  const ry = bottom ? shape.ryBottom : shape.ryTop;
  // Superellipse: x = rx·sgn(c)|c|^(2/n), y = ry·sgn(s)|s|^(2/n)
  let x = shape.rx * Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
  let y = ry * Math.sign(s) * Math.pow(Math.abs(s), 2 / n);
  if (bottom) x *= 1 + shape.pear * s;
  else if (shape.peak > 0) {
    // Pinch the top toward a soft point (droplet): narrow x near the top, raise the very top.
    const up = -s; // 0..1
    x *= 1 - shape.peak * Math.pow(up, 3) * 0.55;
    y -= shape.peak * Math.pow(up, 8) * 0.35;
  }
  return { x, y };
}

/**
 * A ring of radial springs around the outline. Each point can be pushed in or out; neighbours pull
 * on each other so dents spread and wobble like jelly before settling.
 */
export class SoftRing {
  readonly count: number;
  readonly angles: number[];
  /** Radial displacement of each point (units of body radius). */
  readonly offset: Float64Array;
  private readonly vel: Float64Array;

  constructor(
    count = 24,
    public stiffness = 170,
    public coupling = 420,
    public damping = 7.5,
  ) {
    this.count = count;
    this.angles = Array.from({ length: count }, (_, i) => (i / count) * TAU);
    this.offset = new Float64Array(count);
    this.vel = new Float64Array(count);
  }

  step(dt: number): void {
    const n = this.count;
    const o = this.offset;
    for (let i = 0; i < n; i++) {
      const lap = o[(i + n - 1) % n]! + o[(i + 1) % n]! - 2 * o[i]!;
      const a = -this.stiffness * o[i]! + this.coupling * lap - this.damping * this.vel[i]!;
      this.vel[i]! += a * dt;
    }
    for (let i = 0; i < n; i++) {
      o[i]! += this.vel[i]! * dt;
      // Keep dents within a believable range.
      if (o[i]! < -0.35) o[i] = -0.35;
      else if (o[i]! > 0.3) o[i] = 0.3;
    }
  }

  /**
   * Push points near `angle` with a radial velocity (negative = dent inward), spread over `spread`
   * radians with a Gaussian falloff.
   */
  impulse(angle: number, strength: number, spread = 0.6): void {
    for (let i = 0; i < this.count; i++) {
      let d = Math.abs(this.angles[i]! - angle) % TAU;
      if (d > Math.PI) d = TAU - d;
      this.vel[i]! += strength * Math.exp(-(d * d) / (2 * spread * spread));
    }
  }

  /**
   * Apply an inertial pseudo-force (the direction the jelly "keeps going" when the body
   * accelerates): points facing that way bulge out, points facing away pull in.
   */
  inertia(fx: number, fy: number): void {
    for (let i = 0; i < this.count; i++) {
      const a = this.angles[i]!;
      this.vel[i]! += Math.cos(a) * fx + Math.sin(a) * fy;
    }
  }

  energy(): number {
    let e = 0;
    for (let i = 0; i < this.count; i++)
      e += Math.abs(this.offset[i]!) + Math.abs(this.vel[i]!) * 0.05;
    return e;
  }

  reset(): void {
    this.offset.fill(0);
    this.vel.fill(0);
  }
}
