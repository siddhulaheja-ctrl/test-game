import type { Vec2 } from '../core/math';

/**
 * Tracks the cursor in desktop coordinates: smoothed velocity, speed, and how long it has been
 * still. Only positions are used (never clicks elsewhere or anything typed).
 */
export class CursorSense {
  pos: Vec2 | null = null;
  vel: Vec2 = { x: 0, y: 0 };
  /** Seconds since the cursor last moved more than a couple of pixels. */
  stillFor = 0;
  /** Peak speed over the last fraction of a second (px/s), so a quick flick isn't missed. */
  burst = 0;
  private lastFeed: Vec2 | null = null;
  private sinceFeed = 0;

  get speed(): number {
    return Math.hypot(this.vel.x, this.vel.y);
  }

  /** New cursor position (from main's poll or a mousemove). */
  feed(p: Vec2): void {
    if (this.lastFeed && this.sinceFeed > 0) {
      const dt = Math.max(this.sinceFeed, 1 / 120);
      const vx = (p.x - this.lastFeed.x) / dt;
      const vy = (p.y - this.lastFeed.y) / dt;
      this.vel.x += (vx - this.vel.x) * 0.6;
      this.vel.y += (vy - this.vel.y) * 0.6;
      this.burst = Math.max(this.burst, Math.hypot(vx, vy));
      if (Math.hypot(p.x - this.lastFeed.x, p.y - this.lastFeed.y) > 2) this.stillFor = 0;
    }
    this.lastFeed = { ...p };
    this.pos = { ...p };
    this.sinceFeed = 0;
  }

  update(dt: number): void {
    this.sinceFeed += dt;
    this.stillFor += dt;
    this.burst *= Math.pow(0.02, dt); // fades within about a second
    // No new positions means the cursor isn't moving.
    if (this.sinceFeed > 0.1) {
      this.vel.x *= Math.pow(0.001, dt);
      this.vel.y *= Math.pow(0.001, dt);
    }
  }

  distanceTo(x: number, y: number): number {
    return this.pos ? Math.hypot(this.pos.x - x, this.pos.y - y) : Infinity;
  }

  clear(): void {
    this.pos = null;
    this.lastFeed = null;
    this.vel = { x: 0, y: 0 };
    this.burst = 0;
  }
}
