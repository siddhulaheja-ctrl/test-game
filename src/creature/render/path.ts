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
