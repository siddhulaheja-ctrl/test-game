import type { Vec2 } from '../../core/math';
import type { Palette } from '../appearance';
import { mix, rgba } from '../color';
import type { Creature, CreaturePose } from '../creature';
import { restPoint } from '../softBody';
import { FACE_LAYOUT, eyeGeometry } from './drawFace';
import { openSpline } from './path';

/** Left and right x of the outline at local height y (origin at body centre). */
export function widthAt(outline: readonly Vec2[], y: number): [number, number] {
  let left = Infinity;
  let right = -Infinity;
  const n = outline.length;
  for (let i = 0; i < n; i++) {
    const a = outline[i]!;
    const b = outline[(i + 1) % n]!;
    if ((a.y <= y && b.y >= y) || (a.y >= y && b.y <= y)) {
      const t = b.y === a.y ? 0.5 : (y - a.y) / (b.y - a.y);
      const x = a.x + (b.x - a.x) * t;
      left = Math.min(left, x);
      right = Math.max(right, x);
    }
  }
  if (!Number.isFinite(left)) return [0, 0];
  return [left, right];
}

const topOf = (outline: readonly Vec2[]) => Math.min(...outline.map((p) => p.y));

/** Accessories drawn in the body's local frame (origin at the body centre), on top of the face. */
export function drawAccessoriesLocal(
  ctx: CanvasRenderingContext2D,
  creature: Creature,
  pose: CreaturePose,
  outline: readonly Vec2[],
): void {
  const pal = creature.palette;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (creature.hasAccessory('scarf')) drawScarfBand(ctx, pose, pal, outline);
  if (creature.hasAccessory('glasses')) drawGlasses(ctx, creature, pose, outline);
  if (creature.hasAccessory('beanie')) drawBeanie(ctx, pose, pal, outline);
  if (creature.hasAccessory('crown')) drawCrown(ctx, pose, outline);
  if (creature.hasAccessory('headphones')) drawHeadphones(ctx, pose, pal, outline);
  if (creature.hasAccessory('bow')) drawBow(ctx, creature, pose, pal);
}

/** Accessories with their own physics, drawn in world space after the body. */
export function drawAccessoriesWorld(
  ctx: CanvasRenderingContext2D,
  creature: Creature,
  pose: CreaturePose,
): void {
  const pal = creature.palette;
  if (creature.hasAccessory('scarf')) drawScarfTail(ctx, creature, pose, pal);
  if (creature.hasAccessory('beanie')) drawPompom(ctx, creature, pose, pal);
  if (creature.hasAccessory('flower')) {
    const chain = creature.antennae[0];
    drawDaisy(ctx, chain.points[chain.points.length - 1]!, pose.R, pal);
  }
}

// --- Beanie -------------------------------------------------------------------------------------

const beanieColors = (pal: Palette) => ({
  main: pal.accent,
  band: mix(pal.accent, pal.outline, 0.22),
  rib: rgba(mix(pal.accent, pal.outline, 0.5), 0.35),
  outline: pal.outline,
});

function drawBeanie(
  ctx: CanvasRenderingContext2D,
  pose: CreaturePose,
  pal: Palette,
  outline: readonly Vec2[],
): void {
  const R = pose.R;
  const c = beanieColors(pal);
  const top = topOf(outline);
  const bandY = top + R * 0.5;
  const [l, r] = widthAt(outline, bandY);
  const hw = ((r - l) / 2) * 1.07;
  const mid = (l + r) / 2;
  const domeH = bandY - top + R * 0.06;

  const dome = () => {
    ctx.beginPath();
    ctx.ellipse(mid, bandY, hw, domeH, 0, Math.PI, Math.PI * 2);
    ctx.closePath();
  };
  dome();
  const g = ctx.createLinearGradient(mid - hw, top, mid + hw, bandY);
  g.addColorStop(0, mix(c.main, '#ffffff', 0.35));
  g.addColorStop(0.5, c.main);
  g.addColorStop(1, mix(c.main, pal.outline, 0.15));
  ctx.fillStyle = g;
  ctx.fill();
  // Knit ribs.
  ctx.save();
  dome();
  ctx.clip();
  ctx.strokeStyle = c.rib;
  ctx.lineWidth = R * 0.03;
  for (let x = -hw; x <= hw; x += R * 0.13) {
    ctx.beginPath();
    ctx.moveTo(mid + x * 0.4, top - R * 0.1);
    ctx.quadraticCurveTo(mid + x * 1.05, bandY - domeH * 0.4, mid + x, bandY);
    ctx.stroke();
  }
  ctx.restore();
  dome();
  ctx.strokeStyle = c.outline;
  ctx.lineWidth = R * 0.06;
  ctx.stroke();

  // Folded band.
  const bh = R * 0.17;
  const bandPath = () => {
    ctx.beginPath();
    ctx.roundRect(mid - hw * 1.03, bandY - bh * 0.62, hw * 2.06, bh, bh * 0.45);
  };
  bandPath();
  ctx.fillStyle = c.band;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = rgba(pal.outline, 0.22);
  ctx.lineWidth = R * 0.028;
  for (let x = -hw; x <= hw; x += R * 0.075) {
    ctx.beginPath();
    ctx.moveTo(mid + x, bandY - bh * 0.62);
    ctx.lineTo(mid + x, bandY + bh * 0.38);
    ctx.stroke();
  }
  ctx.restore();
  bandPath();
  ctx.strokeStyle = c.outline;
  ctx.lineWidth = R * 0.06;
  ctx.stroke();
}

function drawPompom(
  ctx: CanvasRenderingContext2D,
  creature: Creature,
  pose: CreaturePose,
  pal: Palette,
): void {
  const R = pose.R;
  const x = creature.pompom.x.value;
  const y = creature.pompom.y.value - R * 0.04;
  const r = R * 0.15;
  const cream = mix('#fffaf0', pal.accent, 0.12);
  ctx.fillStyle = cream;
  ctx.strokeStyle = pal.outline;
  ctx.lineWidth = R * 0.05;
  // Fluffy edge: a ring of small bumps.
  ctx.beginPath();
  const bumps = 11;
  for (let i = 0; i <= bumps; i++) {
    const a = (i / bumps) * Math.PI * 2;
    const a2 = ((i + 0.5) / bumps) * Math.PI * 2;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else
      ctx.quadraticCurveTo(
        x + Math.cos(a2 - Math.PI / bumps) * r * 1.28,
        y + Math.sin(a2 - Math.PI / bumps) * r * 1.28,
        px,
        py,
      );
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.beginPath();
  ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.25, 0, Math.PI * 2);
  ctx.fill();
}

// --- Crown --------------------------------------------------------------------------------------

function drawCrown(
  ctx: CanvasRenderingContext2D,
  pose: CreaturePose,
  outline: readonly Vec2[],
): void {
  const R = pose.R;
  const top = topOf(outline);
  const w = R * 0.6;
  const h = R * 0.34;
  ctx.save();
  ctx.translate(R * 0.12, top + R * 0.1);
  ctx.rotate(0.14);
  const gold = ctx.createLinearGradient(0, -h, 0, 0);
  gold.addColorStop(0, '#ffe680');
  gold.addColorStop(1, '#f0a81c');
  const shape = () => {
    ctx.beginPath();
    ctx.moveTo(-w / 2, 0);
    ctx.lineTo(-w / 2, -h * 0.55);
    ctx.lineTo(-w / 4, -h * 0.25);
    ctx.lineTo(0, -h);
    ctx.lineTo(w / 4, -h * 0.25);
    ctx.lineTo(w / 2, -h * 0.55);
    ctx.lineTo(w / 2, 0);
    ctx.quadraticCurveTo(0, h * 0.18, -w / 2, 0);
    ctx.closePath();
  };
  shape();
  ctx.fillStyle = gold;
  ctx.fill();
  ctx.strokeStyle = '#7a5410';
  ctx.lineWidth = R * 0.05;
  ctx.stroke();
  // Tip balls.
  for (const [x, y] of [
    [-w / 2, -h * 0.55],
    [0, -h],
    [w / 2, -h * 0.55],
  ] as const) {
    ctx.beginPath();
    ctx.arc(x, y - R * 0.03, R * 0.045, 0, Math.PI * 2);
    ctx.fillStyle = '#fff1a8';
    ctx.fill();
    ctx.stroke();
  }
  // Gems.
  const gems: [number, string][] = [
    [-w * 0.28, '#5ab0ff'],
    [0, '#ff4f6d'],
    [w * 0.28, '#5ab0ff'],
  ];
  for (const [x, col] of gems) {
    ctx.beginPath();
    ctx.ellipse(x, -h * 0.13, R * 0.045, R * 0.055, 0, 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.fill();
    ctx.lineWidth = R * 0.025;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(x - R * 0.015, -h * 0.13 - R * 0.02, R * 0.014, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// --- Headphones ---------------------------------------------------------------------------------

function drawHeadphones(
  ctx: CanvasRenderingContext2D,
  pose: CreaturePose,
  pal: Palette,
  outline: readonly Vec2[],
): void {
  const R = pose.R;
  const y = FACE_LAYOUT.eyeY * R;
  const [l, r] = widthAt(outline, y);
  const top = topOf(outline);
  const cupX = Math.max(-l, r) + R * 0.02;
  // Band over the head.
  ctx.beginPath();
  ctx.ellipse(0, y, cupX, y - top + R * 0.1, 0, Math.PI + 0.12, Math.PI * 2 - 0.12);
  ctx.strokeStyle = pal.outline;
  ctx.lineWidth = R * 0.13;
  ctx.stroke();
  ctx.strokeStyle = '#6d7391';
  ctx.lineWidth = R * 0.065;
  ctx.stroke();
  // Ear cups.
  for (const side of [-1, 1]) {
    const cx = side * cupX;
    const w = R * 0.2;
    const h = R * 0.4;
    ctx.beginPath();
    ctx.roundRect(cx - w / 2, y - h / 2 + R * 0.04, w, h, w * 0.45);
    const g = ctx.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0);
    g.addColorStop(0, mix(pal.accent, '#ffffff', 0.3));
    g.addColorStop(1, mix(pal.accent, pal.outline, 0.25));
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = pal.outline;
    ctx.lineWidth = R * 0.055;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + side * w * 0.12, y - h * 0.28 + R * 0.04);
    ctx.lineTo(cx + side * w * 0.12, y + h * 0.28 + R * 0.04);
    ctx.strokeStyle = rgba(pal.outline, 0.4);
    ctx.lineWidth = R * 0.03;
    ctx.stroke();
  }
}

// --- Glasses ------------------------------------------------------------------------------------

function drawGlasses(
  ctx: CanvasRenderingContext2D,
  creature: Creature,
  pose: CreaturePose,
  outline: readonly Vec2[],
): void {
  const R = pose.R;
  const frame = '#3d2b36';
  const eyes = eyeGeometry(pose, creature.eyeStyle);
  const lens = eyes.map((e) => ({ x: e.x, y: e.y, r: Math.max(e.rx, e.ry, R * 0.17) * 1.18 }));
  for (const l of lens) {
    ctx.beginPath();
    ctx.arc(l.x, l.y, l.r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(220, 240, 255, 0.16)';
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = l.r * 0.18;
    ctx.beginPath();
    ctx.moveTo(l.x - l.r * 0.9, l.y + l.r * 0.1);
    ctx.lineTo(l.x + l.r * 0.1, l.y - l.r * 0.9);
    ctx.stroke();
    ctx.lineWidth = l.r * 0.08;
    ctx.beginPath();
    ctx.moveTo(l.x - l.r * 0.5, l.y + l.r * 0.55);
    ctx.lineTo(l.x + l.r * 0.55, l.y - l.r * 0.5);
    ctx.stroke();
    ctx.restore();
    ctx.beginPath();
    ctx.arc(l.x, l.y, l.r, 0, Math.PI * 2);
    ctx.strokeStyle = frame;
    ctx.lineWidth = R * 0.055;
    ctx.stroke();
  }
  const [a, b] = lens as [(typeof lens)[0], (typeof lens)[0]];
  // Bridge.
  ctx.beginPath();
  ctx.moveTo(a.x + a.r, a.y - a.r * 0.1);
  ctx.quadraticCurveTo((a.x + b.x) / 2, Math.min(a.y, b.y) - R * 0.1, b.x - b.r, b.y - b.r * 0.1);
  ctx.strokeStyle = frame;
  ctx.lineWidth = R * 0.045;
  ctx.stroke();
  // Temples to the side of the head.
  for (const [l, side] of [
    [a, -1],
    [b, 1],
  ] as const) {
    const [ol, or] = widthAt(outline, l.y);
    const edge = side < 0 ? ol : or;
    ctx.beginPath();
    ctx.moveTo(l.x + side * l.r, l.y - l.r * 0.15);
    ctx.lineTo(edge - side * R * 0.02, l.y - l.r * 0.3);
    ctx.stroke();
  }
}

// --- Scarf --------------------------------------------------------------------------------------

const SCARF_Y0 = 0.5;
const SCARF_Y1 = 0.7;

function scarfStripes(
  ctx: CanvasRenderingContext2D,
  pal: Palette,
  x0: number,
  y0: number,
  w: number,
  h: number,
  R: number,
  angle = -0.5,
): void {
  const a = pal.cheek;
  const b = mix('#ffffff', pal.cheek, 0.2);
  ctx.fillStyle = a;
  ctx.fillRect(x0, y0, w, h);
  ctx.save();
  ctx.translate(x0 + w / 2, y0 + h / 2);
  ctx.rotate(angle);
  ctx.fillStyle = b;
  const stripe = R * 0.09;
  const span = Math.max(w, h) * 1.6;
  for (let x = -span; x < span; x += stripe * 2) ctx.fillRect(x, -span, stripe, span * 2);
  ctx.restore();
}

function drawScarfBand(
  ctx: CanvasRenderingContext2D,
  pose: CreaturePose,
  pal: Palette,
  outline: readonly Vec2[],
): void {
  const R = pose.R;
  const y0 = SCARF_Y0 * R;
  const y1 = SCARF_Y1 * R;
  const [l0, r0] = widthAt(outline, y0);
  const [l1, r1] = widthAt(outline, y1);
  const band = () => {
    ctx.beginPath();
    ctx.moveTo(l0 * 1.04, y0);
    ctx.quadraticCurveTo(0, y0 + R * 0.1, r0 * 1.04, y0);
    ctx.lineTo(r1 * 1.04, y1);
    ctx.quadraticCurveTo(0, y1 + R * 0.12, l1 * 1.04, y1);
    ctx.closePath();
  };
  band();
  ctx.save();
  ctx.clip();
  scarfStripes(ctx, pal, l1 * 1.1, y0 - R * 0.1, (r1 - l1) * 1.1, y1 - y0 + R * 0.3, R);
  // Shade the lower edge for roundness.
  const g = ctx.createLinearGradient(0, y0, 0, y1 + R * 0.1);
  g.addColorStop(0, 'rgba(255,255,255,0.15)');
  g.addColorStop(1, rgba(pal.outline, 0.25));
  ctx.fillStyle = g;
  ctx.fillRect(l1 * 1.2, y0 - R * 0.1, (r1 - l1) * 1.2, y1 - y0 + R * 0.3);
  ctx.restore();
  band();
  ctx.strokeStyle = pal.outline;
  ctx.lineWidth = R * 0.055;
  ctx.stroke();
}

function drawScarfTail(
  ctx: CanvasRenderingContext2D,
  creature: Creature,
  pose: CreaturePose,
  pal: Palette,
): void {
  const R = pose.R;
  const pts = creature.scarfTail.points;
  const w = R * 0.08;
  // Build a ribbon strip along the chain.
  const left: Vec2[] = [];
  const right: Vec2[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)]!;
    const b = pts[Math.min(pts.length - 1, i + 1)]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 1;
    const nx = -dy / d;
    const ny = dx / d;
    const ww = w * (1 - i * 0.06);
    left.push({ x: pts[i]!.x + nx * ww, y: pts[i]!.y + ny * ww });
    right.push({ x: pts[i]!.x - nx * ww, y: pts[i]!.y - ny * ww });
  }
  const strip = () => {
    ctx.beginPath();
    openSpline(ctx, left);
    const rev = [...right].reverse();
    ctx.lineTo(rev[0]!.x, rev[0]!.y);
    for (let i = 1; i < rev.length; i++) ctx.lineTo(rev[i]!.x, rev[i]!.y);
    ctx.closePath();
  };
  strip();
  ctx.save();
  ctx.clip();
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  scarfStripes(
    ctx,
    pal,
    Math.min(...xs) - R * 0.3,
    Math.min(...ys) - R * 0.3,
    R * 0.9,
    R * 0.9,
    R,
    0.3,
  );
  ctx.restore();
  strip();
  ctx.strokeStyle = pal.outline;
  ctx.lineWidth = R * 0.05;
  ctx.stroke();
  // Fringe.
  const end = pts[pts.length - 1]!;
  const prev = pts[pts.length - 2]!;
  const ang = Math.atan2(end.y - prev.y, end.x - prev.x);
  ctx.lineWidth = R * 0.035;
  for (let i = -1; i <= 1; i++) {
    const ox = Math.cos(ang + Math.PI / 2) * i * w * 0.6;
    const oy = Math.sin(ang + Math.PI / 2) * i * w * 0.6;
    ctx.beginPath();
    ctx.moveTo(end.x + ox, end.y + oy);
    ctx.lineTo(end.x + ox + Math.cos(ang) * R * 0.08, end.y + oy + Math.sin(ang) * R * 0.08);
    ctx.stroke();
  }
  // Knot.
  const knot = pts[0]!;
  ctx.beginPath();
  ctx.ellipse(knot.x, knot.y, R * 0.11, R * 0.09, pose.angle, 0, Math.PI * 2);
  ctx.fillStyle = mix(pal.cheek, pal.outline, 0.12);
  ctx.fill();
  ctx.stroke();
}

// --- Bow ----------------------------------------------------------------------------------------

function drawBow(
  ctx: CanvasRenderingContext2D,
  creature: Creature,
  pose: CreaturePose,
  pal: Palette,
): void {
  const R = pose.R;
  const p = restPoint(creature.shape, -Math.PI / 2 + 0.8);
  const color = '#ff6f9f';
  ctx.save();
  ctx.translate(p.x * R * 0.93, p.y * R * 0.93);
  ctx.rotate(0.55);
  const s = R * 0.2;
  const loop = (dir: number) => {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(dir * s * 0.6, -s * 1.1, dir * s * 1.5, -s * 0.5, dir * s * 1.25, s * 0.15);
    ctx.bezierCurveTo(dir * s * 1.05, s * 0.7, dir * s * 0.45, s * 0.45, 0, 0);
    ctx.closePath();
  };
  // Tails.
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(dir * s * 0.35, s * 0.95);
    ctx.lineTo(dir * s * 0.62, s * 0.78);
    ctx.closePath();
    ctx.fillStyle = mix(color, pal.outline, 0.15);
    ctx.fill();
    ctx.strokeStyle = pal.outline;
    ctx.lineWidth = R * 0.045;
    ctx.stroke();
  }
  for (const dir of [-1, 1]) {
    loop(dir);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = pal.outline;
    ctx.lineWidth = R * 0.045;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.ellipse(dir * s * 0.75, -s * 0.35, s * 0.18, s * 0.09, dir * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 0.28, s * 0.32, 0, 0, Math.PI * 2);
  ctx.fillStyle = mix(color, pal.outline, 0.1);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// --- Daisy --------------------------------------------------------------------------------------

function drawDaisy(ctx: CanvasRenderingContext2D, at: Vec2, R: number, pal: Palette): void {
  const petals = 7;
  const r = R * 0.12;
  ctx.save();
  ctx.translate(at.x, at.y);
  ctx.strokeStyle = pal.outline;
  ctx.lineWidth = R * 0.035;
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * Math.PI * 2;
    ctx.beginPath();
    ctx.ellipse(Math.cos(a) * r, Math.sin(a) * r, r * 0.75, r * 0.42, a, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.62, 0, Math.PI * 2);
  ctx.fillStyle = '#ffcc3d';
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath();
  ctx.arc(-r * 0.2, -r * 0.2, r * 0.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
