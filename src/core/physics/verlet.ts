import type { Vec2 } from '../math';

/**
 * A verlet rope pinned at its root and pulled toward a rest pose ("shape matching").
 * Used for antennae, the scarf tail and similar dangly bits: the root follows the body exactly, the
 * rest of the chain lags and wobbles.
 */
export class VerletChain {
  readonly points: Vec2[];
  private readonly prev: Vec2[];

  constructor(
    count: number,
    public segment: number,
    /** 0..1 pull toward the rest pose per step (higher = stiffer). */
    public stiffness = 0.18,
    /** 0..1 velocity kept per step (higher = floppier). */
    public friction = 0.9,
    public gravity = 0,
  ) {
    this.points = Array.from({ length: count }, () => ({ x: 0, y: 0 }));
    this.prev = Array.from({ length: count }, () => ({ x: 0, y: 0 }));
  }

  /** Place every point exactly on the rest pose with no velocity. */
  reset(rest: readonly Vec2[]): void {
    for (let i = 0; i < this.points.length; i++) {
      const r = rest[i]!;
      this.points[i]!.x = this.prev[i]!.x = r.x;
      this.points[i]!.y = this.prev[i]!.y = r.y;
    }
  }

  /**
   * Advance one step. `rest` gives the target pose (rest[0] is the root, which is pinned).
   * `dt` is only used for gravity; the integrator itself is per-step.
   */
  step(rest: readonly Vec2[], dt: number): void {
    const pts = this.points;
    const n = pts.length;
    pts[0]!.x = this.prev[0]!.x = rest[0]!.x;
    pts[0]!.y = this.prev[0]!.y = rest[0]!.y;

    for (let i = 1; i < n; i++) {
      const p = pts[i]!;
      const q = this.prev[i]!;
      const vx = (p.x - q.x) * this.friction;
      const vy = (p.y - q.y) * this.friction;
      q.x = p.x;
      q.y = p.y;
      p.x += vx;
      p.y += vy + this.gravity * dt * dt;
      // Pull toward the rest pose (stronger near the root, so tips stay floppy).
      const k = this.stiffness * (1 - (0.35 * (i - 1)) / Math.max(1, n - 1));
      p.x += (rest[i]!.x - p.x) * k;
      p.y += (rest[i]!.y - p.y) * k;
    }

    // Keep segment lengths (two passes are plenty for short chains).
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 1; i < n; i++) {
        const a = pts[i - 1]!;
        const b = pts[i]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 1e-6;
        const diff = (d - this.segment) / d;
        // Root side is pinned on the first segment, so move only the child there.
        if (i === 1) {
          b.x -= dx * diff;
          b.y -= dy * diff;
        } else {
          a.x += dx * diff * 0.5;
          a.y += dy * diff * 0.5;
          b.x -= dx * diff * 0.5;
          b.y -= dy * diff * 0.5;
        }
      }
    }
  }

  /** Nudge every non-root point by a velocity (in px per step). */
  kick(vx: number, vy: number): void {
    for (let i = 1; i < this.points.length; i++) {
      const w = i / (this.points.length - 1);
      this.prev[i]!.x -= vx * w;
      this.prev[i]!.y -= vy * w;
    }
  }

  /** Total kinetic motion (for idle detection). */
  motion(): number {
    let m = 0;
    for (let i = 1; i < this.points.length; i++) {
      m +=
        Math.abs(this.points[i]!.x - this.prev[i]!.x) +
        Math.abs(this.points[i]!.y - this.prev[i]!.y);
    }
    return m;
  }
}
