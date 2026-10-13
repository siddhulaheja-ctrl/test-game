import { clamp, clamp01, lerp } from '../../core/math';
import type { EyeStyle, Palette } from '../appearance';
import { mix, rgba } from '../color';
import type { CreaturePose } from '../creature';
import { DEFAULT_FACE_LAYOUT, type FaceLayout } from '../species/types';
import { starPath } from './path';

/** Default face anchor points in local space (relative to body centre), units of body radius. */
export const FACE_LAYOUT: FaceLayout = DEFAULT_FACE_LAYOUT;

export interface EyeGeom {
  x: number;
  y: number;
  rx: number;
  ry: number;
  side: -1 | 1;
}

/** Eye centres and radii in local px (relative to the body centre, face shift applied). */
export function eyeGeometry(
  pose: CreaturePose,
  style: EyeStyle,
  layout: FaceLayout = FACE_LAYOUT,
): [EyeGeom, EyeGeom] {
  const { faceShift } = pose;
  const R = pose.R * layout.eyeScale;
  const make = (side: -1 | 1): EyeGeom => {
    const i = side < 0 ? 0 : 1;
    const size = style.sizes[i];
    return {
      x: side * style.spacing * R + faceShift.x,
      y: layout.eyeY * pose.R + style.offsets[i] * R + faceShift.y,
      rx: style.rx * R * size,
      ry: style.ry * R * size,
      side,
    };
  };
  return [make(-1), make(1)];
}

/**
 * Draw the whole face. The context must already be in local space with the origin at the body
 * centre (the caller translates to `pose.center`).
 */
export function drawFace(
  ctx: CanvasRenderingContext2D,
  pose: CreaturePose,
  palette: Palette,
  style: EyeStyle,
  layout: FaceLayout = FACE_LAYOUT,
): void {
  const eyes = eyeGeometry(pose, style, layout);
  drawCheeks(ctx, pose, palette, layout);
  for (const e of eyes) drawEye(ctx, e, pose, palette, style);
  for (const e of eyes) drawBrow(ctx, e, pose, palette);
  drawMouth(ctx, pose, palette, layout);
}

export function drawCheeks(
  ctx: CanvasRenderingContext2D,
  pose: CreaturePose,
  pal: Palette,
  layout: FaceLayout = FACE_LAYOUT,
): void {
  const { R, face, faceShift } = pose;
  const a = 0.22 + face.blush * 0.5;
  for (const side of [-1, 1]) {
    const x = side * layout.cheekX * R + faceShift.x * 0.8;
    const y = layout.cheekY * R + faceShift.y * 0.8;
    const g = ctx.createRadialGradient(x, y, 0, x, y, R * 0.2);
    g.addColorStop(0, rgba(pal.cheek, a));
    g.addColorStop(0.55, rgba(pal.cheek, a * 0.7));
    g.addColorStop(1, rgba(pal.cheek, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, R * 0.2, R * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    // Little anime blush lines when very flustered.
    const lines = clamp01((face.blush - 0.55) / 0.35);
    if (lines > 0) {
      ctx.strokeStyle = rgba(mix(pal.cheek, pal.outline, 0.35), lines * 0.8);
      ctx.lineWidth = R * 0.022;
      ctx.lineCap = 'round';
      for (let i = -1; i <= 1; i++) {
        const lx = x + i * R * 0.07;
        ctx.beginPath();
        ctx.moveTo(lx + R * 0.025, y - R * 0.04);
        ctx.lineTo(lx - R * 0.025, y + R * 0.04);
        ctx.stroke();
      }
    }
  }
}

/** Openness after blinks, 0..1.3. */
const openness = (pose: CreaturePose) => clamp(pose.face.eyeOpen, 0, 1.3);

function drawEye(
  ctx: CanvasRenderingContext2D,
  e: EyeGeom,
  pose: CreaturePose,
  pal: Palette,
  style: EyeStyle,
): void {
  const { R, face, look } = pose;
  const o = openness(pose);
  const lw = R * 0.05;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (o < 0.12) {
    drawClosedEye(ctx, e, pose, pal, style);
    return;
  }

  // Openness squashes the eye vertically; "wide" (>1) enlarges it a little.
  const wide = Math.max(1, o);
  const rx = e.rx * (1 + (wide - 1) * 0.5);
  const ry = e.ry * lerp(0.22, 1, Math.min(1, o)) * wide;
  const cx = e.x;
  const cy = e.y + (e.ry - ry) * 0.35; // closing eyes settle slightly downward

  // Upper lid: a slanted line. Positive lidTilt lowers the inner corner (cross), negative the outer.
  const slope = face.lidTilt * 0.55 * (e.side < 0 ? 1 : -1);
  const lidY = cy - ry * (1 - Math.abs(face.lidTilt) * 0.32);
  // Lower lid: an ellipse pushing up from below (happy squint).
  const sq = clamp01(face.eyeSquint);
  const lowCy = cy + ry * (2.05 - sq * 1.25);
  const lowRx = rx * 2.4;
  const lowRy = ry * 1.2;

  const eyePath = () => {
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  };
  const clipLids = () => {
    // Below the upper lid line.
    ctx.beginPath();
    ctx.moveTo(cx - rx * 2, lidY - slope * rx * 2);
    ctx.lineTo(cx + rx * 2, lidY + slope * rx * 2);
    ctx.lineTo(cx + rx * 2, cy + ry * 3);
    ctx.lineTo(cx - rx * 2, cy + ry * 3);
    ctx.closePath();
    ctx.clip();
    // Outside the lower-lid ellipse.
    ctx.beginPath();
    ctx.rect(cx - rx * 3, cy - ry * 3, rx * 6, ry * 6);
    ctx.ellipse(cx, lowCy, lowRx, lowRy, 0, 0, Math.PI * 2);
    ctx.clip('evenodd');
  };

  ctx.save();
  clipLids();
  eyePath();
  ctx.save();
  ctx.clip();

  const irisCol = style.sizes[0] !== style.sizes[1] && e.side > 0 ? pal.irisAlt : pal.iris;
  if (style.sclera) {
    // Sclera with a soft shadow under the lid.
    const sg = ctx.createLinearGradient(cx, cy - ry, cx, cy + ry);
    sg.addColorStop(0, mix('#ffffff', pal.bodyShade, 0.28));
    sg.addColorStop(0.35, '#ffffff');
    sg.addColorStop(1, '#f4f7fb');
    ctx.fillStyle = sg;
    ctx.fillRect(cx - rx, cy - ry, rx * 2, ry * 2);

    // Iris follows the look direction.
    const ir = Math.min(e.rx, e.ry) * 0.8 * (0.85 + 0.15 * face.pupilScale);
    const ix = cx + look.x * (rx - ir * 0.75) * 0.75;
    const iy = cy + look.y * (ry - ir * 0.6) * 0.6 + ry * 0.06;
    const ig = ctx.createRadialGradient(ix, iy + ir * 0.45, ir * 0.1, ix, iy, ir);
    ig.addColorStop(0, mix(irisCol, '#ffffff', 0.35));
    ig.addColorStop(0.55, irisCol);
    ig.addColorStop(1, mix(irisCol, '#10131c', 0.65));
    ctx.fillStyle = ig;
    ctx.beginPath();
    ctx.arc(ix, iy, ir, 0, Math.PI * 2);
    ctx.fill();
    // Pupil.
    const pr = ir * 0.56 * face.pupilScale;
    ctx.fillStyle = '#141824';
    ctx.beginPath();
    ctx.arc(ix, iy, pr, 0, Math.PI * 2);
    ctx.fill();
    drawHighlights(ctx, ix, iy, ir, face.sparkle);
  } else {
    // Bean eyes: one glossy dark shape that shifts slightly with the look.
    const bx = cx + look.x * rx * 0.25;
    const by = cy + look.y * ry * 0.18;
    const bg = ctx.createRadialGradient(bx, by + ry * 0.5, ry * 0.1, bx, by, ry * 1.1);
    bg.addColorStop(0, mix(pal.outline, irisCol, 0.45));
    bg.addColorStop(1, '#151925');
    ctx.fillStyle = bg;
    ctx.fillRect(cx - rx * 1.5, cy - ry * 1.5, rx * 3, ry * 3);
    drawHighlights(ctx, bx, by - ry * 0.05, Math.max(rx, ry * 0.75), face.sparkle);
  }
  ctx.restore(); // eye clip

  // Outline of the visible shape: eye ellipse edge (inside the lid clip)…
  if (style.sclera) {
    ctx.strokeStyle = pal.outline;
    ctx.lineWidth = lw * 0.7;
    eyePath();
    ctx.stroke();
  }
  ctx.restore(); // lid clip

  // …plus the lid lines themselves, clipped to the eye.
  ctx.save();
  eyePath();
  ctx.clip();
  ctx.strokeStyle = pal.outline;
  ctx.lineWidth = style.sclera ? lw * 0.9 : lw * 0.6;
  const lidVisible = lidY > cy - ry + 0.5 || Math.abs(slope) > 0.01;
  if (lidVisible) {
    ctx.beginPath();
    ctx.moveTo(cx - rx * 1.2, lidY - slope * rx * 1.2);
    ctx.lineTo(cx + rx * 1.2, lidY + slope * rx * 1.2);
    ctx.stroke();
  }
  if (sq > 0.05) {
    ctx.beginPath();
    ctx.ellipse(cx, lowCy, lowRx, lowRy, 0, Math.PI, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  if (style.lashes && o > 0.3) drawLashes(ctx, cx, cy, rx, ry, e.side, pose, pal);
}

export function drawHighlights(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  sparkle: number,
): void {
  ctx.fillStyle = 'rgba(255,255,255,0.96)';
  ctx.beginPath();
  ctx.ellipse(x - r * 0.34, y - r * 0.4, r * 0.3, r * 0.26, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.arc(x + r * 0.34, y + r * 0.3, r * 0.12, 0, Math.PI * 2);
  ctx.fill();
  if (sparkle > 0.05) {
    ctx.fillStyle = `rgba(255,255,255,${(0.6 + 0.4 * sparkle).toFixed(3)})`;
    ctx.beginPath();
    starPath(ctx, x + r * 0.3, y - r * 0.38, r * 0.34 * sparkle, 0.2);
    ctx.fill();
  }
}

function drawLashes(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  side: -1 | 1,
  pose: CreaturePose,
  pal: Palette,
): void {
  ctx.strokeStyle = pal.outline;
  ctx.lineWidth = pose.R * 0.035;
  ctx.lineCap = 'round';
  // Three lashes on the outer-upper arc.
  for (let i = 0; i < 3; i++) {
    const a = -Math.PI / 2 + side * (0.55 + i * 0.32);
    const x0 = cx + Math.cos(a) * rx;
    const y0 = cy + Math.sin(a) * ry;
    const len = pose.R * (0.09 - i * 0.012);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0 + Math.cos(a - side * 0.25) * len, y0 + Math.sin(a - side * 0.25) * len);
    ctx.stroke();
  }
}

function drawClosedEye(
  ctx: CanvasRenderingContext2D,
  e: EyeGeom,
  pose: CreaturePose,
  pal: Palette,
  style: EyeStyle,
): void {
  const { R, face } = pose;
  const rx = e.rx * (style.sclera ? 0.95 : 1.5);
  ctx.strokeStyle = pal.outline;
  ctx.lineWidth = R * 0.055;
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (face.eyeSquint > 0.35) {
    // Happy closed eyes: ^ ^
    ctx.moveTo(e.x - rx, e.y + e.ry * 0.25);
    ctx.quadraticCurveTo(e.x, e.y - e.ry * 0.75, e.x + rx, e.y + e.ry * 0.25);
  } else {
    // Relaxed closed eyes (blink, sleep): ‿ ‿
    ctx.moveTo(e.x - rx, e.y + e.ry * 0.05);
    ctx.quadraticCurveTo(e.x, e.y + e.ry * 0.6, e.x + rx, e.y + e.ry * 0.05);
  }
  ctx.stroke();
  if (style.lashes) {
    ctx.lineWidth = R * 0.03;
    for (let i = 0; i < 2; i++) {
      const t = 0.72 + i * 0.2;
      const x = lerp(e.x, e.x + e.side * rx, t);
      const y = e.y + e.ry * 0.25;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + e.side * R * 0.03, y + R * 0.06);
      ctx.stroke();
    }
  }
}

function drawBrow(
  ctx: CanvasRenderingContext2D,
  e: EyeGeom,
  pose: CreaturePose,
  pal: Palette,
): void {
  const { R, face } = pose;
  const raiseAsym = e.side > 0 ? face.browAsym : -face.browAsym * 0.25;
  // Brows fade in with emotion, so the resting face stays soft and simple.
  const alpha = clamp01(
    0.18 +
      Math.abs(face.browTilt) * 0.65 +
      Math.abs(face.browAsym) * 0.55 +
      Math.max(0, face.browHeight) * 0.35,
  );
  if (alpha < 0.03) return;
  const cx = e.x + e.side * R * 0.02;
  const cy = e.y - e.ry * 1.12 - R * 0.07 - face.browHeight * R * 0.09 - raiseAsym * R * 0.1;
  const half = R * 0.085;
  const ang =
    face.browTilt * 0.42 * (e.side < 0 ? 1 : -1) + (e.side > 0 ? -face.browAsym * 0.25 : 0);
  const dx = Math.cos(ang) * half;
  const dy = Math.sin(ang) * half;
  ctx.strokeStyle = rgba(pal.outline, alpha);
  ctx.lineWidth = R * 0.05;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - dx, cy - dy);
  ctx.quadraticCurveTo(cx, cy - R * 0.03, cx + dx, cy + dy);
  ctx.stroke();
}

export function drawMouth(
  ctx: CanvasRenderingContext2D,
  pose: CreaturePose,
  pal: Palette,
  layout: FaceLayout = FACE_LAYOUT,
): void {
  const { R, face, faceShift, mouthRound } = pose;
  const mx = faceShift.x * 0.9;
  const my = layout.mouthY * R + faceShift.y * 0.9;
  const hw = R * 0.16 * face.mouthWidth;
  const sag = face.mouthCurve * R * 0.12;
  const open = clamp01(face.mouthOpen);
  const round = Math.max(0, mouthRound);
  const lw = R * 0.05;

  ctx.save();
  ctx.translate(mx, my);
  ctx.strokeStyle = pal.outline;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (open < 0.05 && round < 0.05) {
    // Closed mouth line, optionally wobbly.
    ctx.beginPath();
    const steps = 18;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = lerp(-hw, hw, t);
      const y = 4 * sag * t * (1 - t) + Math.sin(t * Math.PI * 4) * face.mouthWobble * R * 0.025;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    // Dimples at the corners of a big smile.
    if (face.mouthCurve > 0.6) {
      ctx.lineWidth = lw * 0.7;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(
          s * hw * 1.02,
          -R * 0.02,
          R * 0.035,
          s < 0 ? 0.6 : Math.PI - 1.6,
          s < 0 ? 1.6 : Math.PI - 0.6,
        );
        ctx.stroke();
      }
    }
    // Blep: a little tongue poking out.
    const blep = Math.max(0, -mouthRound);
    if (blep > 0.05) {
      const ty = 4 * sag * 0.25;
      ctx.fillStyle = pal.tongue;
      ctx.beginPath();
      ctx.ellipse(R * 0.04, ty + R * 0.05 * blep, R * 0.065, R * 0.075 * blep, 0, 0, Math.PI);
      ctx.fill();
      ctx.lineWidth = lw * 0.6;
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

  if (round > 0.3) {
    // Yawn: a round "O".
    const rx = lerp(hw, R * 0.12, round);
    const ry = R * (0.05 + open * 0.17);
    const oy = open * R * 0.05;
    const oPath = () => {
      ctx.beginPath();
      ctx.ellipse(0, oy, rx, ry, 0, 0, Math.PI * 2);
    };
    oPath();
    ctx.fillStyle = pal.mouth;
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = pal.tongue;
    ctx.beginPath();
    ctx.ellipse(0, oy + ry * 0.75, rx * 0.75, ry * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    oPath();
    ctx.stroke();
    ctx.restore();
    return;
  }

  // Open mouth: upper and lower curves. The exponent rounds the lens shape into a soft oval.
  const upper = sag * 0.45 - open * R * 0.06;
  const lower = sag * (sag > 0 ? 1 : 0.6) + open * R * 0.34 * (0.75 + 0.25 * face.mouthWidth);
  const wobble = (t: number) => Math.sin(t * Math.PI * 4) * face.mouthWobble * R * 0.02;
  const curve = (t: number) => Math.pow(4 * t * (1 - t), 0.6);
  const mouthPath = () => {
    ctx.beginPath();
    ctx.moveTo(-hw, 0);
    const steps = 16;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      ctx.lineTo(lerp(-hw, hw, t), upper * curve(t) + wobble(t));
    }
    for (let i = steps - 1; i >= 0; i--) {
      const t = i / steps;
      ctx.lineTo(lerp(-hw, hw, t), lower * curve(t));
    }
    ctx.closePath();
  };
  mouthPath();
  ctx.fillStyle = pal.mouth;
  ctx.fill();
  ctx.save();
  ctx.clip();
  // Tongue.
  ctx.fillStyle = pal.tongue;
  ctx.beginPath();
  ctx.ellipse(
    hw * 0.1,
    lower * 0.85,
    hw * 0.58,
    Math.max(R * 0.045, lower * 0.32),
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();
  ctx.strokeStyle = rgba(pal.mouth, 0.35);
  ctx.lineWidth = lw * 0.4;
  ctx.beginPath();
  ctx.moveTo(hw * 0.1, lower * 0.62);
  ctx.lineTo(hw * 0.1, lower * 0.9);
  ctx.stroke();
  // One tiny fang (weird but cute).
  if (open > 0.12) {
    const fx = -hw * 0.42;
    const fy = upper * curve(0.29); // upper lip height at x = −0.42·hw
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(fx - R * 0.035, fy - R * 0.01);
    ctx.lineTo(fx + R * 0.035, fy - R * 0.01);
    ctx.lineTo(fx, fy + R * 0.065);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  ctx.strokeStyle = pal.outline;
  ctx.lineWidth = lw;
  mouthPath();
  ctx.stroke();
  ctx.restore();
}
