import type { Vec2 } from '../../core/math';
import type { Palette } from '../appearance';
import { mix, rgba } from '../color';
import type { Creature, CreaturePose } from '../creature';
import { restPoint } from '../softBody';
import { drawAccessoriesLocal, drawAccessoriesWorld } from './drawAccessories';
import { drawFace } from './drawFace';
import { drawParticles } from './drawParticles';
import { closedSpline, openSpline } from './path';

/** Freckles in body units (u across, v down from the centre) with radius in units of R. */
const FRECKLES: readonly [number, number, number][] = [
  [-0.62, -0.42, 0.032],
  [-0.5, -0.58, 0.024],
  [-0.72, -0.24, 0.02],
  [0.6, -0.48, 0.028],
  [0.48, -0.63, 0.02],
  [0.71, -0.3, 0.023],
];

/**
 * Body outline in local space with the origin at the BODY CENTRE (ring dents applied).
 */
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

/** Draw the creature (and its particles) at its current pose. */
export function drawCreature(ctx: CanvasRenderingContext2D, creature: Creature): void {
  const pose = creature.getPose();
  const pal = creature.palette;
  ctx.save();
  ctx.globalAlpha *= creature.alpha;

  drawShadow(ctx, creature, pose);
  drawAntennaStalks(ctx, creature, pose, pal);

  ctx.save();
  ctx.translate(pose.feet.x, pose.feet.y);
  ctx.rotate(pose.angle);
  ctx.scale(pose.sx, pose.sy);
  drawFeet(ctx, creature, pose, pal);
  ctx.translate(pose.center.x, pose.center.y);
  const outline = bodyOutline(creature, pose);
  drawArms(ctx, creature, pose, pal);
  drawBody(ctx, creature, outline, pose, pal);
  drawFace(ctx, pose, pal, creature.eyeStyle);
  drawAccessoriesLocal(ctx, creature, pose, outline);
  ctx.restore();

  drawAntennaTips(ctx, creature, pose, pal);
  drawAccessoriesWorld(ctx, creature, pose);
  ctx.restore();

  ctx.save();
  ctx.globalAlpha *= creature.alpha;
  drawParticles(ctx, creature.particles.particles, pal);
  ctx.restore();
}

function drawShadow(ctx: CanvasRenderingContext2D, creature: Creature, pose: CreaturePose): void {
  const R = pose.R;
  const shrink = 1 - Math.min(0.55, pose.lift / (R * 6));
  const rx = creature.shape.rx * R * 0.95 * shrink;
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

function drawAntennaStalks(
  ctx: CanvasRenderingContext2D,
  creature: Creature,
  pose: CreaturePose,
  pal: Palette,
): void {
  const R = pose.R;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const chain of creature.antennae) {
    ctx.beginPath();
    openSpline(ctx, chain.points);
    ctx.strokeStyle = pal.outline;
    ctx.lineWidth = R * 0.115;
    ctx.stroke();
    ctx.strokeStyle = mix(pal.body, pal.bodyShade, 0.25);
    ctx.lineWidth = R * 0.05;
    ctx.stroke();
  }
}

function drawAntennaTips(
  ctx: CanvasRenderingContext2D,
  creature: Creature,
  pose: CreaturePose,
  pal: Palette,
): void {
  const R = pose.R;
  const glow =
    0.12 + 0.3 * pose.face.sparkle + (creature.appearance.palette === 'midnight' ? 0.25 : 0);
  creature.antennae.forEach((chain, i) => {
    const tip = chain.points[chain.points.length - 1]!;
    if (i === 0 && creature.hasAccessory('flower')) return; // the daisy replaces this bobble
    const r = R * 0.105;
    // Soft glow.
    const gg = ctx.createRadialGradient(tip.x, tip.y, r * 0.5, tip.x, tip.y, r * 2.6);
    gg.addColorStop(0, rgba(pal.antennaTip, glow));
    gg.addColorStop(1, rgba(pal.antennaTip, 0));
    ctx.fillStyle = gg;
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, r * 2.6, 0, Math.PI * 2);
    ctx.fill();
    // Bobble.
    const g = ctx.createRadialGradient(tip.x - r * 0.35, tip.y - r * 0.4, r * 0.1, tip.x, tip.y, r);
    g.addColorStop(0, mix(pal.antennaTip, '#ffffff', 0.6));
    g.addColorStop(1, pal.antennaTip);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = pal.outline;
    ctx.lineWidth = R * 0.05;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(tip.x - r * 0.35, tip.y - r * 0.35, r * 0.25, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawFeet(
  ctx: CanvasRenderingContext2D,
  creature: Creature,
  pose: CreaturePose,
  pal: Palette,
): void {
  const R = pose.R;
  const spread = creature.shape.rx * 0.38 * R;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * spread, -R * 0.075, R * 0.2, R * 0.095, side * -0.08, 0, Math.PI * 2);
    ctx.fillStyle = mix(pal.body, pal.bodyShade, 0.4);
    ctx.fill();
    ctx.strokeStyle = pal.outline;
    ctx.lineWidth = R * 0.06;
    ctx.stroke();
  }
}

function drawArms(
  ctx: CanvasRenderingContext2D,
  creature: Creature,
  pose: CreaturePose,
  pal: Palette,
): void {
  const R = pose.R;
  const shape = creature.shape;
  pose.arms.forEach((a, i) => {
    const side = i === 0 ? -1 : 1;
    const anchor = restPoint(shape, side < 0 ? Math.PI - 0.35 : 0.35);
    const ax = anchor.x * R * 0.9;
    const ay = anchor.y * R * 0.9;
    const cx = ax + Math.cos(a) * R * 0.19;
    const cy = ay + Math.sin(a) * R * 0.19;
    ctx.beginPath();
    ctx.ellipse(cx, cy, R * 0.21, R * 0.11, a, 0, Math.PI * 2);
    ctx.fillStyle = mix(pal.body, pal.bodyShade, 0.15);
    ctx.fill();
    ctx.strokeStyle = pal.outline;
    ctx.lineWidth = R * 0.06;
    ctx.stroke();
  });
}

function drawBody(
  ctx: CanvasRenderingContext2D,
  creature: Creature,
  outline: Vec2[],
  pose: CreaturePose,
  pal: Palette,
): void {
  const R = pose.R;
  const shape = creature.shape;
  const sp = (u: number, v: number) => ({
    x: u * shape.rx * R,
    y: v * (v < 0 ? shape.ryTop : shape.ryBottom) * R,
  });
  const path = () => {
    ctx.beginPath();
    closedSpline(ctx, outline);
  };

  // Base fill: light from the upper left.
  const light = sp(-0.38, -0.5);
  const base = ctx.createRadialGradient(light.x, light.y, R * 0.05, 0, R * 0.05, R * 1.5);
  base.addColorStop(0, pal.bodyLight);
  base.addColorStop(0.42, pal.body);
  base.addColorStop(1, pal.bodyShade);
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

  // Pale belly patch.
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

  // Freckles.
  ctx.fillStyle = rgba(pal.bodyShade, 0.4);
  for (const [u, v, r] of FRECKLES) {
    const p = sp(u, v);
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * R, 0, Math.PI * 2);
    ctx.fill();
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

  // Big soft highlight plus a sharp specular glint (the jelly sheen).
  const hl = sp(-0.42, -0.55);
  ctx.save();
  ctx.translate(hl.x, hl.y);
  ctx.rotate(-0.55);
  ctx.scale(1, 0.55);
  const hg = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.36);
  hg.addColorStop(0, 'rgba(255,255,255,0.62)');
  hg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.36, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  const glint = sp(-0.52, -0.6);
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.beginPath();
  ctx.ellipse(glint.x, glint.y, R * 0.085, R * 0.05, -0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(glint.x + R * 0.13, glint.y - R * 0.07, R * 0.025, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Outline.
  path();
  ctx.strokeStyle = pal.outline;
  ctx.lineWidth = R * 0.075;
  ctx.lineJoin = 'round';
  ctx.stroke();
}
