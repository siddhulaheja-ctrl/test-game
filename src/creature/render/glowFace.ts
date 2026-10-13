import { clamp, clamp01, lerp } from '../../core/math';
import { mix, rgba } from '../color';
import type { CreaturePose } from '../creature';
import { glow } from './parts';

/**
 * Glowing eyes and mouth for faces without skin: visors, screens, spirits. They read the same face
 * parameters as the regular face, so every expression works on every species.
 */

export interface GlowEyeOptions {
  x: number;
  y: number;
  rx: number;
  ry: number;
  /** −1 for the left eye, 1 for the right. */
  side: -1 | 1;
  color: string;
  /** Overall brightness 0..1.5. */
  intensity: number;
  /** Corner rounding 0..1 (0 = rounded rectangle "pixel" eye, 1 = ellipse). */
  roundness?: number;
  /** Size of the white-hot centre as a fraction of the eye (default follows pupil size). */
  core?: number;
}

/** Brightness that follows the mood: brighter when excited, dimmer when sad or sleepy. */
export function glowIntensity(pose: CreaturePose): number {
  const f = pose.face;
  return clamp(0.85 + 0.45 * f.sparkle - 0.3 * f.droop + 0.1 * f.blush, 0.35, 1.4);
}

function shapePath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  round: number,
): void {
  ctx.beginPath();
  if (round >= 0.99) ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  else ctx.roundRect(x - rx, y - ry, rx * 2, ry * 2, Math.min(rx, ry) * lerp(0.25, 1, round));
}

/** One glowing eye with lids (tilt), squint and blinks. */
export function drawGlowEye(
  ctx: CanvasRenderingContext2D,
  pose: CreaturePose,
  o: GlowEyeOptions,
): void {
  const f = pose.face;
  const open = clamp(f.eyeOpen, 0, 1.3);
  const round = o.roundness ?? 1;
  const I = o.intensity;
  const hot = mix(o.color, '#ffffff', 0.65);
  const x = o.x + pose.look.x * o.rx * 0.45;
  const y = o.y + pose.look.y * o.ry * 0.3;

  glow(ctx, x, y, Math.max(o.rx, o.ry) * 2.6, o.color, 0.32 * I);

  ctx.lineCap = 'round';
  if (open < 0.12) {
    // Closed: a glowing arc (^ when happy, ‿ when sleepy or blinking).
    ctx.strokeStyle = rgba(o.color, Math.min(1, 0.9 * I));
    ctx.lineWidth = o.ry * 0.45;
    ctx.beginPath();
    if (f.eyeSquint > 0.35) {
      ctx.moveTo(x - o.rx, y + o.ry * 0.25);
      ctx.quadraticCurveTo(x, y - o.ry * 0.9, x + o.rx, y + o.ry * 0.25);
    } else {
      ctx.moveTo(x - o.rx, y);
      ctx.quadraticCurveTo(x, y + o.ry * 0.7, x + o.rx, y);
    }
    ctx.stroke();
    ctx.strokeStyle = rgba(hot, Math.min(1, 0.8 * I));
    ctx.lineWidth = o.ry * 0.16;
    ctx.stroke();
    return;
  }

  const wide = Math.max(1, open);
  const rx = o.rx * (1 + (wide - 1) * 0.4);
  const ry = o.ry * lerp(0.2, 1, Math.min(1, open)) * wide;
  const cy = y + (o.ry - ry) * 0.3;

  ctx.save();
  // Upper lid slant (cross = inner corner down).
  const slope = f.lidTilt * 0.6 * (o.side < 0 ? 1 : -1);
  const lidY = cy - ry * (1 - Math.abs(f.lidTilt) * 0.35);
  ctx.beginPath();
  ctx.moveTo(x - rx * 2, lidY - slope * rx * 2);
  ctx.lineTo(x + rx * 2, lidY + slope * rx * 2);
  ctx.lineTo(x + rx * 2, cy + ry * 3);
  ctx.lineTo(x - rx * 2, cy + ry * 3);
  ctx.closePath();
  ctx.clip();
  // Happy squint pushes up from below.
  const sq = clamp01(f.eyeSquint);
  if (sq > 0.02) {
    ctx.beginPath();
    ctx.rect(x - rx * 3, cy - ry * 3, rx * 6, ry * 6);
    ctx.ellipse(x, cy + ry * (2.05 - sq * 1.3), rx * 2.4, ry * 1.2, 0, 0, Math.PI * 2);
    ctx.clip('evenodd');
  }
  shapePath(ctx, x, cy, rx, ry, round);
  const g = ctx.createRadialGradient(x, cy, 0, x, cy, Math.max(rx, ry));
  if (o.core !== undefined) {
    // Bright white centre with a coloured ring (scaled by pupil size: tiny when scared).
    const core = clamp(o.core * f.pupilScale, 0.1, 0.85);
    g.addColorStop(0, rgba('#ffffff', Math.min(1, I)));
    g.addColorStop(core, rgba(mix(o.color, '#ffffff', 0.75), Math.min(1, I)));
    g.addColorStop(Math.min(0.95, core + 0.18), rgba(o.color, Math.min(1, I)));
    g.addColorStop(1, rgba(mix(o.color, '#3a1a5a', 0.35), Math.min(1, I)));
  } else {
    const core = clamp01(0.35 * f.pupilScale);
    g.addColorStop(0, rgba(hot, Math.min(1, I)));
    g.addColorStop(core, rgba(mix(o.color, '#ffffff', 0.3), Math.min(1, I)));
    g.addColorStop(1, rgba(o.color, Math.min(1, 0.95 * I)));
  }
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();

  // Excited sparkle: a tiny cross glint.
  if (f.sparkle > 0.1) {
    const s = Math.max(rx, ry) * 0.55 * f.sparkle;
    ctx.strokeStyle = `rgba(255,255,255,${(0.85 * f.sparkle).toFixed(3)})`;
    ctx.lineWidth = s * 0.22;
    ctx.beginPath();
    ctx.moveTo(x + rx * 0.35 - s, cy - ry * 0.3);
    ctx.lineTo(x + rx * 0.35 + s, cy - ry * 0.3);
    ctx.moveTo(x + rx * 0.35, cy - ry * 0.3 - s);
    ctx.lineTo(x + rx * 0.35, cy - ry * 0.3 + s);
    ctx.stroke();
  }
}

/**
 * A glowing mouth line that follows mouthCurve / mouthOpen / mouthWobble.
 * Open mouths become a glowing slot; yawns (mouthRound) become an "O".
 */
export function drawGlowMouth(
  ctx: CanvasRenderingContext2D,
  pose: CreaturePose,
  x: number,
  y: number,
  halfWidth: number,
  color: string,
  intensity: number,
  lineWidth: number,
): void {
  const f = pose.face;
  const hw = halfWidth * f.mouthWidth;
  const sag = f.mouthCurve * halfWidth * 0.55;
  const open = clamp01(f.mouthOpen);
  const round = Math.max(0, pose.mouthRound);
  ctx.save();
  ctx.translate(x, y);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  glow(ctx, 0, sag * 0.5, hw * 1.8, color, 0.22 * intensity);
  const curve = (t: number) => Math.pow(4 * t * (1 - t), 0.6);
  if (open < 0.08 && round < 0.1) {
    ctx.beginPath();
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      const px = lerp(-hw, hw, t);
      const py =
        sag * 4 * t * (1 - t) + Math.sin(t * Math.PI * 4) * f.mouthWobble * lineWidth * 0.6;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
  } else if (round > 0.3) {
    ctx.beginPath();
    ctx.ellipse(
      0,
      0,
      lerp(hw, halfWidth * 0.55, round),
      halfWidth * (0.25 + open * 0.6),
      0,
      0,
      Math.PI * 2,
    );
  } else {
    const upper = sag * 0.45 - open * halfWidth * 0.25;
    const lower = sag + open * halfWidth * 0.9;
    ctx.beginPath();
    ctx.moveTo(-hw, 0);
    for (let i = 1; i <= 16; i++) ctx.lineTo(lerp(-hw, hw, i / 16), upper * curve(i / 16));
    for (let i = 15; i >= 0; i--) ctx.lineTo(lerp(-hw, hw, i / 16), lower * curve(i / 16));
    ctx.closePath();
    ctx.fillStyle = rgba(color, 0.35 * intensity);
    ctx.fill();
  }
  ctx.strokeStyle = rgba(color, Math.min(1, 0.95 * intensity));
  ctx.lineWidth = lineWidth;
  ctx.stroke();
  ctx.strokeStyle = rgba(mix(color, '#ffffff', 0.6), Math.min(1, 0.8 * intensity));
  ctx.lineWidth = lineWidth * 0.35;
  ctx.stroke();
  ctx.restore();
}
