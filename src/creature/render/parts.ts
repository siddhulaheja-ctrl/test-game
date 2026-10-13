import type { Vec2 } from '../../core/math';
import type { BodyShape, Palette } from '../appearance';
import { mix, rgba } from '../color';
import type { Creature, CreaturePose } from '../creature';
import { restPoint } from '../softBody';
import { closedSpline, openSpline } from './path';

/**
 * Reusable drawing parts shared by species renderers.
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

/** Body outline in local space with the ring dents applied. */
export function bodyOutline(creature: Creature, pose: CreaturePose): Vec2[] {
  const { ring } = creature;
  const shape = creature.shape;
  const pts: Vec2[] = [];
  for (let i = 0; i < ring.count; i++) {
    const rp = restPoint(shape, ring.angles[i]!);
    const k = pose.R * (1 + ring.offset[i]!);
    pts.push({ x: rp.x * k, y: rp.y * k });
  }
  return pts;
}

/** Map body units (u across, v down from the centre) to local px for a shape. */
export function shapePoint(shape: BodyShape, R: number, u: number, v: number): Vec2 {
  return { x: u * shape.rx * R, y: v * (v < 0 ? shape.ryTop : shape.ryBottom) * R };
}

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

/** Outlined stalks for every dangly chain (world space). */
export function drawStalks(
  ctx: CanvasRenderingContext2D,
  creature: Creature,
  pose: CreaturePose,
  pal: Palette,
  opts: { outer?: number; inner?: number; color?: string; only?: number[] } = {},
): void {
  const R = pose.R;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  creature.chains.forEach((chain, i) => {
    if (opts.only && !opts.only.includes(i)) return;
    ctx.beginPath();
    openSpline(ctx, chain.points);
    ctx.strokeStyle = pal.outline;
    ctx.lineWidth = R * (opts.outer ?? 0.115);
    ctx.stroke();
    ctx.strokeStyle = opts.color ?? mix(pal.body, pal.bodyShade, 0.25);
    ctx.lineWidth = R * (opts.inner ?? 0.05);
    ctx.stroke();
  });
}

/** A glossy glowing ball (antenna bobble, bulb). */
export function drawBobble(
  ctx: CanvasRenderingContext2D,
  at: Vec2,
  r: number,
  color: string,
  outline: string,
  glow: number,
  R: number,
): void {
  if (glow > 0) {
    const gg = ctx.createRadialGradient(at.x, at.y, r * 0.5, at.x, at.y, r * 2.6);
    gg.addColorStop(0, rgba(color, glow));
    gg.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = gg;
    ctx.beginPath();
    ctx.arc(at.x, at.y, r * 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
  const g = ctx.createRadialGradient(at.x - r * 0.35, at.y - r * 0.4, r * 0.1, at.x, at.y, r);
  g.addColorStop(0, mix(color, '#ffffff', 0.6));
  g.addColorStop(1, color);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(at.x, at.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = R * 0.05;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  ctx.arc(at.x - r * 0.35, at.y - r * 0.35, r * 0.25, 0, Math.PI * 2);
  ctx.fill();
}

/** Two little oval feet (local space). */
export function drawBlobFeet(
  ctx: CanvasRenderingContext2D,
  creature: Creature,
  pose: CreaturePose,
  pal: Palette,
  opts: { spread?: number; color?: string } = {},
): void {
  const R = pose.R;
  const spread = creature.shape.rx * (opts.spread ?? 0.38) * R;
  const fy = feetY(pose);
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * spread, fy - R * 0.075, R * 0.2, R * 0.095, side * -0.08, 0, Math.PI * 2);
    ctx.fillStyle = opts.color ?? mix(pal.body, pal.bodyShade, 0.4);
    ctx.fill();
    ctx.strokeStyle = pal.outline;
    ctx.lineWidth = R * 0.06;
    ctx.stroke();
  }
}

/** Where each arm attaches and its centre (local space). */
export function armGeometry(
  creature: Creature,
  pose: CreaturePose,
  i: 0 | 1,
  reach = 0.19,
): { anchor: Vec2; center: Vec2; angle: number } {
  const R = pose.R;
  const side = i === 0 ? -1 : 1;
  const a = pose.arms[i];
  const p = restPoint(creature.shape, side < 0 ? Math.PI - 0.35 : 0.35);
  const anchor = { x: p.x * R * 0.9, y: p.y * R * 0.9 };
  return {
    anchor,
    center: { x: anchor.x + Math.cos(a) * R * reach, y: anchor.y + Math.sin(a) * R * reach },
    angle: a,
  };
}

/** Stubby oval arms (local space), drawn behind the body. */
export function drawNubArms(
  ctx: CanvasRenderingContext2D,
  creature: Creature,
  pose: CreaturePose,
  pal: Palette,
  color?: string,
): void {
  const R = pose.R;
  for (const i of [0, 1] as const) {
    const { center, angle } = armGeometry(creature, pose, i);
    ctx.beginPath();
    ctx.ellipse(center.x, center.y, R * 0.21, R * 0.11, angle, 0, Math.PI * 2);
    ctx.fillStyle = color ?? mix(pal.body, pal.bodyShade, 0.15);
    ctx.fill();
    ctx.strokeStyle = pal.outline;
    ctx.lineWidth = R * 0.06;
    ctx.stroke();
  }
}

export interface SoftBodyOptions {
  /** Freckles in body units [u, v, radius]. */
  freckles?: readonly (readonly [number, number, number])[];
  belly?: boolean;
  /** Strength of the glossy highlight (1 = jelly). */
  gloss?: number;
  outlineWidth?: number;
  /** Override the fill (e.g. translucent ghosts). */
  fillAlpha?: number;
}

/** The shaded, outlined body (local space). Returns a function that re-traces its path. */
export function drawSoftBody(
  ctx: CanvasRenderingContext2D,
  shape: BodyShape,
  outline: readonly Vec2[],
  pose: CreaturePose,
  pal: Palette,
  opts: SoftBodyOptions = {},
): () => void {
  const R = pose.R;
  const sp = (u: number, v: number) => shapePoint(shape, R, u, v);
  const path = () => {
    ctx.beginPath();
    closedSpline(ctx, outline);
  };
  const gloss = opts.gloss ?? 1;

  // Base fill: light from the upper left.
  const light = sp(-0.38, -0.5);
  const base = ctx.createRadialGradient(light.x, light.y, R * 0.05, 0, R * 0.05, R * 1.5);
  const fa = opts.fillAlpha ?? 1;
  base.addColorStop(0, rgba(pal.bodyLight, fa));
  base.addColorStop(0.42, rgba(pal.body, fa));
  base.addColorStop(1, rgba(pal.bodyShade, fa));
  path();
  ctx.fillStyle = base;
  ctx.fill();

  ctx.save();
  path();
  ctx.clip();

  // Ground occlusion along the bottom.
  const bottom = sp(0, 1.05);
  const shade = ctx.createRadialGradient(bottom.x, bottom.y, R * 0.1, bottom.x, bottom.y, R * 1.05);
  shade.addColorStop(0, rgba(pal.bodyShade, 0.55));
  shade.addColorStop(1, rgba(pal.bodyShade, 0));
  ctx.fillStyle = shade;
  ctx.fillRect(-R * 2, -R * 2, R * 4, R * 4);

  if (opts.belly !== false) {
    const belly = sp(0, 0.42);
    ctx.save();
    ctx.translate(belly.x, belly.y);
    ctx.scale(1, 0.72);
    const bg = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.62);
    bg.addColorStop(0, rgba(pal.belly, 0.6));
    bg.addColorStop(0.6, rgba(pal.belly, 0.35));
    bg.addColorStop(1, rgba(pal.belly, 0));
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.62, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  if (opts.freckles) {
    ctx.fillStyle = rgba(pal.bodyShade, 0.4);
    for (const [u, v, r] of opts.freckles) {
      const p = sp(u, v);
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * R, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Soft inner edge (ambient occlusion), clipped to the inside of the outline.
  path();
  ctx.strokeStyle = rgba(pal.bodyShade, 0.28);
  ctx.lineWidth = R * 0.2;
  ctx.stroke();

  // Bounce light on the lower right.
  const bounce = sp(0.62, 0.45);
  const bl = ctx.createRadialGradient(bounce.x, bounce.y, 0, bounce.x, bounce.y, R * 0.35);
  bl.addColorStop(0, rgba(pal.bodyLight, 0.35));
  bl.addColorStop(1, rgba(pal.bodyLight, 0));
  ctx.fillStyle = bl;
  ctx.fillRect(-R * 2, -R * 2, R * 4, R * 4);

  if (gloss > 0) drawGloss(ctx, sp(-0.42, -0.55), sp(-0.52, -0.6), R, gloss);
  ctx.restore();

  // Outline.
  path();
  ctx.strokeStyle = pal.outline;
  ctx.lineWidth = R * (opts.outlineWidth ?? 0.075);
  ctx.lineJoin = 'round';
  ctx.stroke();
  return path;
}

/** Big soft highlight plus a sharp specular glint. */
export function drawGloss(
  ctx: CanvasRenderingContext2D,
  hl: Vec2,
  glint: Vec2,
  R: number,
  strength = 1,
): void {
  ctx.save();
  ctx.translate(hl.x, hl.y);
  ctx.rotate(-0.55);
  ctx.scale(1, 0.55);
  const hg = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.36);
  hg.addColorStop(0, `rgba(255,255,255,${(0.62 * strength).toFixed(3)})`);
  hg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.36, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = `rgba(255,255,255,${(0.92 * Math.min(1, strength)).toFixed(3)})`;
  ctx.beginPath();
  ctx.ellipse(glint.x, glint.y, R * 0.085, R * 0.05, -0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(glint.x + R * 0.13, glint.y - R * 0.07, R * 0.025, 0, Math.PI * 2);
  ctx.fill();
}

/** Soft radial glow (for eyes, flames, horn tips). */
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

/**
 * Closed path of a ribbon along `pts` whose half-width goes from `w0` at the start to `w1` at the
 * end (gills, flame tongues, tails).
 */
export function taperedPath(
  ctx: CanvasRenderingContext2D,
  pts: readonly Vec2[],
  w0: number,
  w1: number,
): void {
  const n = pts.length;
  const left: Vec2[] = [];
  const right: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)]!;
    const b = pts[Math.min(n - 1, i + 1)]!;
    const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const nx = -(b.y - a.y) / d;
    const ny = (b.x - a.x) / d;
    const w = w0 + (w1 - w0) * (i / Math.max(1, n - 1));
    left.push({ x: pts[i]!.x + nx * w, y: pts[i]!.y + ny * w });
    right.push({ x: pts[i]!.x - nx * w, y: pts[i]!.y - ny * w });
  }
  ctx.beginPath();
  openSpline(ctx, left);
  const end = pts[n - 1]!;
  ctx.quadraticCurveTo(
    end.x + (end.x - pts[Math.max(0, n - 2)]!.x) * 0.6,
    end.y + (end.y - pts[Math.max(0, n - 2)]!.y) * 0.6,
    right[n - 1]!.x,
    right[n - 1]!.y,
  );
  const rev = [...right].reverse();
  for (let i = 1; i < rev.length; i++) ctx.lineTo(rev[i]!.x, rev[i]!.y);
  ctx.closePath();
}
