import { rgba } from '../color';
import type { Creature, CreaturePose } from '../creature';

/**
 * Drawing helpers shared by character renderers.
 * "Local" space has its origin at the BODY CENTRE, x right, y down, already squashed and tilted.
 */

/** Run `fn` in local space (origin at the body centre, pose transform applied). */
export function inLocal(ctx: CanvasRenderingContext2D, pose: CreaturePose, fn: () => void): void {
  ctx.save();
  ctx.translate(pose.feet.x, pose.feet.y);
  ctx.rotate(pose.angle);
  ctx.scale(pose.sx, pose.sy);
  ctx.translate(pose.center.x, pose.center.y);
  fn();
  ctx.restore();
}

/** Feet y in local (body-centre) space. */
export const feetY = (pose: CreaturePose): number => -pose.center.y;

/** Soft ground shadow that shrinks while the creature is in the air. */
export function drawShadow(
  ctx: CanvasRenderingContext2D,
  creature: Creature,
  pose: CreaturePose,
): void {
  const R = pose.R;
  const lift = pose.lift + pose.hover;
  const shrink = 1 - Math.min(0.55, lift / (R * 6));
  const rx = creature.shape.rx * R * 0.95 * shrink * (creature.species.shadowScale ?? 1);
  const ry = R * 0.13 * shrink;
  const x = pose.feet.x;
  const y = pose.groundY - R * 0.01;
  const g = ctx.createRadialGradient(x, y, 0, x, y, rx);
  g.addColorStop(0, `rgba(20, 24, 40, ${(0.24 * shrink).toFixed(3)})`);
  g.addColorStop(1, 'rgba(20, 24, 40, 0)');
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, ry / rx);
  ctx.translate(-x, -y);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Soft radial glow (for eyes, blades, tips). */
export function glow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  alpha: number,
): void {
  if (alpha <= 0) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, alpha));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}
