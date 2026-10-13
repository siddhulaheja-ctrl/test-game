/**
 * Decides when the overlay should capture the mouse.
 * Uses hysteresis (a slightly larger exit margin than entry margin) so the window doesn't flicker
 * between interactive and click-through when the cursor sits on the creature's edge.
 */

export interface HitShape {
  /** Returns how far outside the shape the point is (<= 0 means inside), in px. */
  distanceOutside(x: number, y: number): number;
}

export class InteractivityTracker {
  private interactive = false;
  /** While true (e.g. dragging the creature) the overlay stays interactive. */
  hold = false;

  constructor(
    private readonly onChange: (interactive: boolean) => void,
    private readonly enterMargin = 2,
    private readonly exitMargin = 10,
  ) {}

  get isInteractive(): boolean {
    return this.interactive;
  }

  /** Feed the latest cursor position and the creature's current hit shape. */
  update(cursor: { x: number; y: number } | null, shape: HitShape | null): void {
    let next: boolean;
    if (this.hold) next = true;
    else if (!cursor || !shape) next = false;
    else {
      const d = shape.distanceOutside(cursor.x, cursor.y);
      next = this.interactive ? d <= this.exitMargin : d <= this.enterMargin;
    }
    if (next !== this.interactive) {
      this.interactive = next;
      this.onChange(next);
    }
  }

  reset(): void {
    this.hold = false;
    if (this.interactive) {
      this.interactive = false;
      this.onChange(false);
    }
  }
}

/** An axis-aligned ellipse hit shape. */
export function ellipseHit(cx: number, cy: number, rx: number, ry: number): HitShape {
  return {
    distanceOutside(x, y) {
      const nx = (x - cx) / rx;
      const ny = (y - cy) / ry;
      const r = Math.hypot(nx, ny);
      // Approximate distance outside: scale normalized radius back by the mean radius.
      return (r - 1) * ((rx + ry) / 2);
    },
  };
}
