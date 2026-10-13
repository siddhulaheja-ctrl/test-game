import type { Vec2 } from '../../core/math';

/** Add a smooth closed curve through `pts` (Catmull-Rom converted to cubic Béziers). */
export function closedSpline(
  ctx: CanvasRenderingContext2D,
  pts: readonly Vec2[],
  tension = 1,
): void {
  const n = pts.length;
  if (n < 3) return;
  const t = tension / 6;
  ctx.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i + n - 1) % n]!;
    const p1 = pts[i]!;
    const p2 = pts[(i + 1) % n]!;
    const p3 = pts[(i + 2) % n]!;
    ctx.bezierCurveTo(
      p1.x + (p2.x - p0.x) * t,
      p1.y + (p2.y - p0.y) * t,
      p2.x - (p3.x - p1.x) * t,
      p2.y - (p3.y - p1.y) * t,
      p2.x,
      p2.y,
    );
  }
  ctx.closePath();
}

/** Add a smooth open curve through `pts`. */
export function openSpline(ctx: CanvasRenderingContext2D, pts: readonly Vec2[]): void {
  const n = pts.length;
  if (n < 2) return;
  ctx.moveTo(pts[0]!.x, pts[0]!.y);
  if (n === 2) {
    ctx.lineTo(pts[1]!.x, pts[1]!.y);
    return;
  }
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[Math.min(n - 1, i + 2)]!;
    ctx.bezierCurveTo(
      p1.x + (p2.x - p0.x) / 6,
      p1.y + (p2.y - p0.y) / 6,
      p2.x - (p3.x - p1.x) / 6,
      p2.y - (p3.y - p1.y) / 6,
      p2.x,
      p2.y,
    );
  }
}

/** Four-pointed sparkle star centred on (x, y). */
export function starPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  pinch = 0.18,
): void {
  const k = r * pinch;
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x + k, y - k, x + r, y);
  ctx.quadraticCurveTo(x + k, y + k, x, y + r);
  ctx.quadraticCurveTo(x - k, y + k, x - r, y);
  ctx.quadraticCurveTo(x - k, y - k, x, y - r);
  ctx.closePath();
}

/** Heart centred on (x, y) with half-width r. */
export function heartPath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.moveTo(x, y + r * 0.9);
  ctx.bezierCurveTo(x - r * 1.25, y + r * 0.05, x - r * 0.95, y - r * 1.05, x, y - r * 0.38);
  ctx.bezierCurveTo(x + r * 0.95, y - r * 1.05, x + r * 1.25, y + r * 0.05, x, y + r * 0.9);
  ctx.closePath();
}

/** Teardrop pointing up, centred on the round part. */
export function dropPath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.moveTo(x, y - r * 1.9);
  ctx.bezierCurveTo(x + r * 0.35, y - r * 1.2, x + r, y - r * 0.55, x + r, y);
  ctx.arc(x, y, r, 0, Math.PI);
  ctx.bezierCurveTo(x - r, y - r * 0.55, x - r * 0.35, y - r * 1.2, x, y - r * 1.9);
  ctx.closePath();
}
