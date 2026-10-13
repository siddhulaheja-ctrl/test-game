import type { Palette } from '../appearance';
import { mix } from '../color';
import { particleAlpha, type Particle } from '../particles';
import { dropPath, heartPath, starPath } from './path';

const HEART = '#ff6b9a';
const SWEAT = '#8fd8ff';

export function drawParticles(
  ctx: CanvasRenderingContext2D,
  particles: readonly Particle[],
  pal: Palette,
): void {
  const base = ctx.globalAlpha;
  for (const p of particles) {
    const a = particleAlpha(p);
    if (a <= 0.005) continue;
    ctx.globalAlpha = base * a;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    drawOne(ctx, p, pal);
    ctx.restore();
  }
  ctx.globalAlpha = base;
}

function drawOne(ctx: CanvasRenderingContext2D, p: Particle, pal: Palette): void {
  const s = p.size;
  const t = p.age / p.life;
  const outlineW = Math.max(1, s * 0.16);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  switch (p.kind) {
    case 'sparkle': {
      const r = s * (0.6 + 0.4 * Math.sin(t * Math.PI));
      ctx.fillStyle = p.seed > 0.5 ? pal.accent : '#ffffff';
      ctx.beginPath();
      starPath(ctx, 0, 0, r, 0.16);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.18, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'heart': {
      const pulse = 1 + 0.12 * Math.sin(p.age * 9);
      const r = s * pulse * 0.6;
      ctx.translate(Math.sin(p.age * 3 + p.seed * 6) * s * 0.4, 0);
      ctx.beginPath();
      heartPath(ctx, 0, 0, r);
      ctx.fillStyle = p.seed > 0.7 ? '#ff8fb8' : HEART;
      ctx.fill();
      ctx.strokeStyle = mix(HEART, pal.outline, 0.6);
      ctx.lineWidth = outlineW * 0.8;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath();
      ctx.ellipse(-r * 0.42, -r * 0.35, r * 0.18, r * 0.12, -0.6, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'sweat': {
      const r = s * 0.5;
      ctx.rotate(Math.atan2(p.vy, p.vx) + Math.PI / 2 + Math.PI);
      ctx.beginPath();
      dropPath(ctx, 0, 0, r);
      ctx.fillStyle = SWEAT;
      ctx.fill();
      ctx.strokeStyle = mix(SWEAT, '#1d3a5a', 0.55);
      ctx.lineWidth = outlineW * 0.7;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.arc(-r * 0.35, -r * 0.1, r * 0.22, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'zzz': {
      const w = s * 0.55;
      ctx.translate(Math.sin(p.age * 2 + p.seed * 5) * s * 0.35, 0);
      ctx.beginPath();
      ctx.moveTo(-w, -w);
      ctx.lineTo(w, -w);
      ctx.lineTo(-w, w);
      ctx.lineTo(w, w);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = s * 0.34;
      ctx.stroke();
      ctx.strokeStyle = mix(pal.outline, '#7c86d8', 0.5);
      ctx.lineWidth = s * 0.18;
      ctx.stroke();
      break;
    }
    case 'note': {
      const r = s * 0.28;
      ctx.translate(Math.sin(p.age * 4 + p.seed * 6) * s * 0.3, 0);
      const col = p.seed > 0.5 ? pal.accent : mix(pal.accent, pal.cheek, 0.6);
      ctx.strokeStyle = mix(col, pal.outline, 0.6);
      ctx.fillStyle = col;
      ctx.lineWidth = outlineW * 0.6;
      const double = p.seed > 0.6;
      const heads = double ? [-r * 1.4, r * 1.4] : [0];
      for (const hx of heads) {
        ctx.beginPath();
        ctx.ellipse(hx - r * 0.3, r * 1.4, r, r * 0.72, -0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(hx + r * 0.62, r * 1.3);
        ctx.lineTo(hx + r * 0.62, -r * 1.9);
        ctx.lineWidth = r * 0.4;
        ctx.stroke();
        ctx.lineWidth = outlineW * 0.6;
      }
      ctx.beginPath();
      if (double) {
        ctx.moveTo(-r * 1.4 + r * 0.62, -r * 1.9);
        ctx.lineTo(r * 1.4 + r * 0.62, -r * 1.6);
        ctx.lineWidth = r * 0.6;
      } else {
        ctx.moveTo(r * 0.62, -r * 1.9);
        ctx.quadraticCurveTo(r * 1.7, -r * 1.2, r * 1.3, -r * 0.2);
        ctx.lineWidth = r * 0.4;
      }
      ctx.stroke();
      break;
    }
    case 'dust': {
      const r = s * (0.5 + t * 0.9);
      ctx.fillStyle = 'rgba(206, 198, 186, 0.8)';
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.arc(r * 0.6, r * 0.25, r * 0.65, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'exclaim':
    case 'question': {
      const pop = Math.min(1, p.age / 0.12);
      const sc = 0.6 + 0.4 * pop + 0.12 * Math.sin(Math.min(1, p.age / 0.3) * Math.PI);
      ctx.scale(sc, sc);
      ctx.font = `900 ${Math.round(s * 1.25)}px "Segoe UI", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const glyph = p.kind === 'exclaim' ? '!' : '?';
      ctx.lineWidth = s * 0.28;
      ctx.strokeStyle = '#ffffff';
      ctx.strokeText(glyph, 0, 0);
      ctx.fillStyle = p.kind === 'exclaim' ? '#ff5d6c' : pal.outline;
      ctx.fillText(glyph, 0, 0);
      break;
    }
  }
}
