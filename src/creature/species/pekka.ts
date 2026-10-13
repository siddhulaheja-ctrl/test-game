import { clamp, lerp } from '../../core/math';
import type { BodyShape, Palette } from '../appearance';
import { mix } from '../color';
import type { CreaturePose } from '../creature';
import { feetY, glow, inLocal } from '../render/parts';
import type { SpeciesDef } from './types';

/**
 * P.E.K.K.A (fan version), replicating the owner's reference artwork.
 *
 * All shapes are authored in "reference space": pixel coordinates measured on a 3x enlargement of
 * the reference image (character centre x = 392, ground y = 495, about 460 px tall). The drawing
 * maps that space onto the creature's pose, so squash, tilt, hops and expressions still apply.
 *
 * Fan content: P.E.K.K.A is © Supercell. This is non-commercial fan art, not affiliated with or
 * endorsed by Supercell (see Supercell's Fan Content Policy). The Supercell logo on the chest is
 * replaced by a plain gem plaque.
 */

/** Reference-space anchors. */
const CX = 392;
const GROUND = 495;
/** Reference pixels per body radius. */
const PX_PER_R = 230;

/** Hit-test / shadow envelope (units of R from the body centre). */
const SHAPE: BodyShape = {
  id: 'pekka-knight',
  name: 'Knight',
  rx: 1.1,
  ryTop: 1.15,
  ryBottom: 0.5,
  nTop: 2.4,
  nBottom: 3,
  pear: 0,
  peak: 0,
};

/** Colour roles for this character, derived from the shared Palette shape. */
interface Kit {
  ink: string;
  steelLight: string;
  steel: string;
  steelDark: string;
  shine: string;
  socket: string;
  socketRim: string;
  eye: string;
  ring: string;
  accentLight: string;
  accent: string;
  accentDark: string;
  gem: string;
}

function kit(p: Palette): Kit {
  return {
    ink: p.outline,
    steelLight: p.bodyLight,
    steel: p.body,
    steelDark: p.bodyShade,
    shine: mix(p.bodyLight, '#ffffff', 0.4),
    socket: p.belly,
    socketRim: mix(p.belly, p.bodyShade, 0.45),
    eye: p.irisAlt,
    ring: p.iris,
    accentLight: mix(p.antennaTip, '#ffffff', 0.32),
    accent: p.antennaTip,
    accentDark: mix(p.antennaTip, '#2a0a5a', 0.45),
    gem: p.cheek,
  };
}

const base = { mouth: '#1c2335', tongue: '#ff8aa2', accent: '#ffffff' } as const;

/** Palette fields: body/bodyLight/bodyShade = steel, outline = ink, belly = eye socket,
 * iris = eye ring, irisAlt = eye centre, antennaTip = horns/swords/spikes, cheek = chest gem. */
const PALETTES: Record<string, Palette> = {
  steel: {
    ...base,
    id: 'steel',
    name: 'Reference Steel',
    body: '#6d8198',
    bodyLight: '#8195ab',
    bodyShade: '#55687f',
    outline: '#1d1428',
    belly: '#1e2537',
    cheek: '#3f8fe0',
    iris: '#a43fcf',
    irisAlt: '#ddd6e3',
    antennaTip: '#a64ccb',
  },
  violet: {
    ...base,
    id: 'violet',
    name: 'Classic Violet',
    body: '#6a5a9a',
    bodyLight: '#8676b4',
    bodyShade: '#4f427c',
    outline: '#1a1229',
    belly: '#160f24',
    cheek: '#ffcf5a',
    iris: '#ff4fc4',
    irisAlt: '#ffe0f4',
    antennaTip: '#e8509e',
  },
  arenaBlue: {
    ...base,
    id: 'arenaBlue',
    name: 'Arena Blue',
    body: '#5d7aa6',
    bodyLight: '#7593bf',
    bodyShade: '#45608a',
    outline: '#101a2c',
    belly: '#0f1726',
    cheek: '#ffffff',
    iris: '#2fb8f0',
    irisAlt: '#dff6ff',
    antennaTip: '#3aa8e8',
  },
  arenaRed: {
    ...base,
    id: 'arenaRed',
    name: 'Arena Red',
    body: '#727a8c',
    bodyLight: '#8a92a4',
    bodyShade: '#5a6173',
    outline: '#171a24',
    belly: '#16131a',
    cheek: '#ffffff',
    iris: '#e8443f',
    irisAlt: '#ffe2de',
    antennaTip: '#df4a44',
  },
  amber: {
    ...base,
    id: 'amber',
    name: 'Max Level Amber',
    body: '#5e4a82',
    bodyLight: '#78629e',
    bodyShade: '#473766',
    outline: '#160e24',
    belly: '#120b1e',
    cheek: '#ffb53d',
    iris: '#f0a52a',
    irisAlt: '#fff1d2',
    antennaTip: '#eda53a',
  },
};

export const PEKKA: SpeciesDef = {
  id: 'pekka',
  name: 'P.E.K.K.A',
  tagline: 'Fan version: an armoured knight with twin swords and a soft spot for butterflies.',
  personality:
    'Stoic and few-worded, fiercely protective, secretly sweet. Celebrates with butterflies.',
  palettes: PALETTES,
  defaultPalette: 'steel',
  shape: SHAPE,
  eyeStyles: [],
  accessories: [],
  dangly: [],
  softness: 0.3,
  // The reference's resting look is stern: inner corners of the eye sockets slant down.
  faceBias: { lidTilt: 0.35 },
  shadowScale: 0.75,
  draw(ctx, c, pose) {
    const k = kit(c.palette);
    inLocal(ctx, pose, () => {
      const s = pose.R / PX_PER_R;
      ctx.translate(0, feetY(pose));
      ctx.scale(s, s);
      ctx.translate(-CX, -GROUND);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      drawSwords(ctx, pose, k);
      drawHorns(ctx, k);
      drawShoulderPlates(ctx, k);
      drawHelmet(ctx, pose, k);
      drawLowerBody(ctx, k);
      drawChest(ctx, k);
      drawArms(ctx, pose, k);
    });
  },
};

// --- Helpers (reference space) ----------------------------------------------------------------

const INK_W = 6;
type Pt = { x: number; y: number };

function ink(ctx: CanvasRenderingContext2D, k: Kit, w = INK_W): void {
  ctx.strokeStyle = k.ink;
  ctx.lineWidth = w;
  ctx.stroke();
}

function poly(ctx: CanvasRenderingContext2D, pts: readonly (readonly [number, number])[]): void {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
}

/** Mirror an x coordinate across the character's centre line (side −1 = as authored). */
const mx = (x: number, side: -1 | 1) => (side < 0 ? x : 2 * CX - x);

/** Fill with hard-edged bands across a gradient axis: [colour, fraction] from `from` to `to`. */
function bands(
  ctx: CanvasRenderingContext2D,
  from: Pt,
  to: Pt,
  list: readonly (readonly [string, number])[],
): CanvasGradient {
  const g = ctx.createLinearGradient(from.x, from.y, to.x, to.y);
  let acc = 0;
  for (const [col, w] of list) {
    g.addColorStop(acc, col);
    acc = Math.min(1, acc + w);
    g.addColorStop(acc, col);
  }
  return g;
}

// --- Swords -----------------------------------------------------------------------------------

/** Straight blades with a chisel tip and three lengthwise stripes, crossed behind the body. */
function drawSwords(ctx: CanvasRenderingContext2D, pose: CreaturePose, k: Kit): void {
  const f = pose.face;
  // Arms up: blades rotate toward vertical; the right one also follows a wave.
  const wave = (pose.arms[1] - lerp(1.15, -0.75, f.armRaise)) * 0.5;
  // Reference: guard (207, 292) → tip (40, 72).
  const refAngle = Math.atan2(72 - 292, 40 - 207);
  for (const side of [-1, 1] as const) {
    const gx = mx(214, side);
    const gy = 304 - f.armRaise * 22;
    const raise = f.armRaise * 0.42 + (side > 0 ? -wave : 0);
    const angle = side < 0 ? refAngle + raise : Math.PI - refAngle - raise;
    const len = 270;
    const w = 23;
    if (f.sparkle > 0.3) {
      glow(
        ctx,
        gx + Math.cos(angle) * 150,
        gy + Math.sin(angle) * 150,
        170,
        k.accent,
        0.3 * f.sparkle,
      );
    }
    ctx.save();
    ctx.translate(gx, gy);
    ctx.rotate(angle);
    // Blade along +x. `outer` is the local y sign of the edge facing away from the body.
    const outer = side < 0 ? -1 : 1;
    const blade = () => {
      ctx.beginPath();
      ctx.moveTo(12, -w);
      // Chisel tip: the outer edge runs longer than the inner edge.
      ctx.lineTo(len - (outer < 0 ? 0 : 26), -w);
      ctx.lineTo(len - (outer < 0 ? 26 : 0), w);
      ctx.lineTo(12, w);
      ctx.closePath();
    };
    blade();
    ctx.fillStyle = bands(ctx, { x: 0, y: outer * w }, { x: 0, y: -outer * w }, [
      [k.accentLight, 0.5],
      [k.accent, 0.32],
      [k.accentDark, 0.18],
    ]);
    ctx.fill();
    ink(ctx, k);
    // Steel crossguard (the grip disappears behind the shoulder sphere).
    ctx.beginPath();
    ctx.roundRect(-13, -36, 26, 72, 7);
    ctx.fillStyle = bands(ctx, { x: -13, y: 0 }, { x: 13, y: 0 }, [
      [k.steelDark, 0.45],
      [k.steelLight, 0.55],
    ]);
    ctx.fill();
    ink(ctx, k);
    ctx.restore();
  }
}

// --- Horns ------------------------------------------------------------------------------------

/** Crescents rising from behind the ear plates, tips pointing straight up. */
function drawHorns(ctx: CanvasRenderingContext2D, k: Kit): void {
  for (const side of [-1, 1] as const) {
    // Centre line: base (270,194) → (204,190) → (168,138) → tip (192,40).
    const P = (
      [
        [270, 194],
        [204, 190],
        [168, 138],
        [192, 40],
      ] as const
    ).map(([x, y]) => ({ x: mx(x, side), y }));
    const at = (t: number): Pt => {
      const u = 1 - t;
      const a = u * u * u;
      const b = 3 * u * u * t;
      const c = 3 * u * t * t;
      const d = t * t * t;
      return {
        x: a * P[0]!.x + b * P[1]!.x + c * P[2]!.x + d * P[3]!.x,
        y: a * P[0]!.y + b * P[1]!.y + c * P[2]!.y + d * P[3]!.y,
      };
    };
    const N = 28;
    const edges: Pt[][] = [[], [], [], []]; // outer, split 1, split 2, inner
    const fractions = [1, 0, -0.55, -1];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const a = at(Math.max(0, t - 0.01));
      const b = at(Math.min(1, t + 0.01));
      const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      // Normal toward the convex (outside) side of the crescent.
      const nx = (side < 0 ? 1 : -1) * ((b.y - a.y) / d);
      const ny = (side < 0 ? 1 : -1) * (-(b.x - a.x) / d);
      const p = at(t);
      const half = 18 * Math.pow(1 - t, 0.8) + 1;
      fractions.forEach((fr, j) =>
        edges[j]!.push({ x: p.x + nx * half * fr, y: p.y + ny * half * fr }),
      );
    }
    const band = (a: Pt[], b: Pt[]) => {
      ctx.beginPath();
      a.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      for (let i = b.length - 1; i >= 0; i--) ctx.lineTo(b[i]!.x, b[i]!.y);
      ctx.closePath();
    };
    const [outer, s1, s2, inner] = edges as [Pt[], Pt[], Pt[], Pt[]];
    band(outer, s1);
    ctx.fillStyle = k.accentLight;
    ctx.fill();
    band(s1, s2);
    ctx.fillStyle = k.accent;
    ctx.fill();
    band(s2, inner);
    ctx.fillStyle = k.accentDark;
    ctx.fill();
    band(outer, inner);
    ink(ctx, k);
  }
}

// --- Shoulder plates behind the spheres ----------------------------------------------------------

function drawShoulderPlates(ctx: CanvasRenderingContext2D, k: Kit): void {
  for (const side of [-1, 1] as const) {
    poly(ctx, [
      [mx(232, side), 262],
      [mx(286, side), 236],
      [mx(304, side), 292],
      [mx(250, side), 318],
    ]);
    ctx.fillStyle = side < 0 ? k.steelLight : k.steel;
    ctx.fill();
    ink(ctx, k);
  }
}

// --- Helmet and face --------------------------------------------------------------------------

function helmetPath(ctx: CanvasRenderingContext2D): void {
  const l = 292;
  const r = 505;
  const top = 105;
  const rad = (r - l) / 2;
  ctx.beginPath();
  ctx.moveTo(l, 310);
  ctx.lineTo(l, top + rad);
  ctx.arc((l + r) / 2, top + rad, rad, Math.PI, 0);
  ctx.lineTo(r, 310);
  ctx.closePath();
}

function drawHelmet(ctx: CanvasRenderingContext2D, pose: CreaturePose, k: Kit): void {
  const f = pose.face;
  // Ear plates (the horns attach behind them).
  for (const side of [-1, 1] as const) {
    poly(ctx, [
      [mx(268, side), 146],
      [mx(294, side), 140],
      [mx(296, side), 214],
      [mx(270, side), 218],
    ]);
    ctx.fillStyle = side < 0 ? k.steelLight : k.steel;
    ctx.fill();
    ink(ctx, k);
  }
  helmetPath(ctx);
  ctx.fillStyle = k.steel;
  ctx.fill();
  // Lighter strip down the left side of the helmet.
  ctx.save();
  helmetPath(ctx);
  ctx.clip();
  ctx.fillStyle = k.steelLight;
  ctx.beginPath();
  ctx.ellipse(318, 270, 40, 210, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  helmetPath(ctx);
  ink(ctx, k);
  // Dome highlights (top right).
  ctx.fillStyle = k.shine;
  ctx.beginPath();
  ctx.arc(451, 151, 9, 0, Math.PI * 2);
  ctx.moveTo(441, 136);
  ctx.arc(437, 136, 4, 0, Math.PI * 2);
  ctx.fill();

  // Eye sockets: triangles (outer-top, inner-top, rounded bottom point). The top edge's slant
  // follows lidTilt; the stern resting slant comes from the species face bias.
  const look = { x: pose.look.x * 6, y: pose.look.y * 4 };
  const tilt = clamp(f.lidTilt, -1, 1);
  const open = clamp(f.eyeOpen, 0, 1.3);
  for (const side of [-1, 1] as const) {
    const outerTop = { x: mx(304, side), y: 178 + Math.max(0, -tilt) * 34 };
    const innerTop = { x: mx(386, side), y: Math.max(168, 178 + tilt * 50) };
    const bottomY = 262 - f.eyeSquint * 12;
    const socket = () => {
      ctx.beginPath();
      ctx.moveTo(outerTop.x, outerTop.y);
      ctx.lineTo(innerTop.x, innerTop.y);
      ctx.quadraticCurveTo(mx(358, side), 236, mx(330, side), bottomY);
      ctx.quadraticCurveTo(mx(303, side), bottomY + 4, mx(302, side), bottomY - 18);
      ctx.closePath();
    };
    socket();
    ctx.fillStyle = k.socket;
    ctx.fill();
    ctx.save();
    socket();
    ctx.clip();
    // Inner bevel: a lighter line just inside the socket edge.
    socket();
    ctx.strokeStyle = k.socketRim;
    ctx.lineWidth = 17;
    ctx.stroke();
    socket();
    ctx.strokeStyle = k.socket;
    ctx.lineWidth = 9;
    ctx.stroke();
    const ex = mx(344, side) + look.x;
    const ey = 204 + look.y - (side > 0 ? f.browAsym * 6 : 0);
    drawEye(ctx, ex, ey, open, f.eyeSquint, f.pupilScale, k);
    ctx.restore();
    socket();
    ink(ctx, k);
  }

  // Nose plate in the V between the sockets.
  ctx.beginPath();
  ctx.roundRect(CX - 10, 244, 20, 54, 8);
  ctx.fillStyle = k.steelDark;
  ctx.fill();
  ink(ctx, k, 5);
  ctx.beginPath();
  ctx.roundRect(CX - 5.5, 250, 11, 14, 5);
  ctx.fillStyle = k.steelLight;
  ctx.fill();
}

/** Light centre inside a thick purple ring; closes to an arc, squints from below. */
function drawEye(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  open: number,
  squint: number,
  pupil: number,
  k: Kit,
): void {
  if (open < 0.12) {
    ctx.beginPath();
    if (squint > 0.35) {
      ctx.moveTo(x - 18, y + 4);
      ctx.quadraticCurveTo(x, y - 14, x + 18, y + 4);
    } else {
      ctx.moveTo(x - 18, y);
      ctx.quadraticCurveTo(x, y + 10, x + 18, y);
    }
    ctx.strokeStyle = k.ring;
    ctx.lineWidth = 7;
    ctx.stroke();
    return;
  }
  const sy = lerp(0.25, 1, Math.min(1, open)) * Math.max(1, open);
  ctx.save();
  if (squint > 0.02) {
    ctx.beginPath();
    ctx.rect(x - 60, y - 60, 120, 120);
    ctx.ellipse(x, y + 40 - squint * 26, 40, 24, 0, 0, Math.PI * 2);
    ctx.clip('evenodd');
  }
  ctx.translate(x, y);
  ctx.scale(1, sy);
  ctx.beginPath();
  ctx.arc(0, 0, 20, 0, Math.PI * 2);
  ctx.fillStyle = k.ring;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, 15 * clamp(pupil, 0.5, 1.25), 0, Math.PI * 2);
  ctx.fillStyle = k.eye;
  ctx.fill();
  ctx.restore();
}

// --- Lower body -------------------------------------------------------------------------------

/** Flat disc feet set well apart, a wide hip block and a centre plate. */
function drawLowerBody(ctx: CanvasRenderingContext2D, k: Kit): void {
  for (const side of [-1, 1] as const) {
    const fx = mx(326, side);
    ctx.beginPath();
    ctx.ellipse(fx, 483, 30, 13, 0, 0, Math.PI * 2);
    ctx.fillStyle = k.steelLight;
    ctx.fill();
    ink(ctx, k, 5);
    ctx.beginPath();
    ctx.ellipse(fx, 479, 15, 6, 0, 0, Math.PI * 2);
    ctx.fillStyle = k.steel;
    ctx.fill();
    ink(ctx, k, 3.5);
    ctx.beginPath();
    ctx.ellipse(fx - 1, 477, 6, 2.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = k.shine;
    ctx.fill();
  }
  ctx.beginPath();
  ctx.roundRect(282, 384, 220, 84, 28);
  ctx.fillStyle = k.steel;
  ctx.fill();
  ink(ctx, k);
  ctx.beginPath();
  ctx.rect(364, 440, 56, 52);
  ctx.fillStyle = k.steelDark;
  ctx.fill();
  ink(ctx, k, 5);
}

/** Faceted chest plate covering the chin, with a centre seam and a gem plaque. */
function drawChest(ctx: CanvasRenderingContext2D, k: Kit): void {
  const outline: [number, number][] = [
    [250, 300],
    [318, 288],
    [CX, 304],
    [466, 288],
    [534, 300],
    [532, 384],
    [CX, 458],
    [252, 384],
  ];
  poly(ctx, outline);
  ctx.fillStyle = k.steel;
  ctx.fill();
  ctx.save();
  poly(ctx, outline);
  ctx.clip();
  // Upper-left facet lightest, lower-right darkest.
  poly(ctx, [
    [240, 280],
    [CX, 280],
    [CX, 372],
    [240, 352],
  ]);
  ctx.fillStyle = k.steelLight;
  ctx.fill();
  poly(ctx, [
    [CX, 372],
    [545, 352],
    [545, 470],
    [CX, 470],
  ]);
  ctx.fillStyle = k.steelDark;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(250, 352);
  ctx.lineTo(CX, 372);
  ctx.lineTo(534, 352);
  ink(ctx, k, 4.5);
  ctx.restore();
  poly(ctx, outline);
  ink(ctx, k);
  ctx.beginPath();
  ctx.moveTo(CX, 304);
  ctx.lineTo(CX, 458);
  ink(ctx, k, 4.5);
  // Gem plaque (a plain gem in place of the original logo).
  ctx.beginPath();
  ctx.roundRect(420, 306, 46, 40, 5);
  ctx.fillStyle = k.socket;
  ctx.fill();
  ink(ctx, k, 4);
  poly(ctx, [
    [443, 312],
    [458, 326],
    [443, 340],
    [428, 326],
  ]);
  ctx.fillStyle = k.gem;
  ctx.fill();
  poly(ctx, [
    [443, 312],
    [450, 320],
    [443, 326],
    [436, 320],
  ]);
  ctx.fillStyle = mix(k.gem, '#ffffff', 0.55);
  ctx.fill();
}

// --- Arms and shoulder spheres ----------------------------------------------------------------

function drawArms(ctx: CanvasRenderingContext2D, pose: CreaturePose, k: Kit): void {
  const lift = pose.face.armRaise * 18;
  for (const side of [-1, 1] as const) {
    // Elbow plate with a bolt, beside the hip.
    ctx.beginPath();
    ctx.roundRect(side < 0 ? 292 : 2 * CX - 292 - 30, 378 - lift, 30, 27, 6);
    ctx.fillStyle = k.steelLight;
    ctx.fill();
    ink(ctx, k, 5);
    ctx.beginPath();
    ctx.arc(mx(305, side), 391 - lift, 4, 0, Math.PI * 2);
    ctx.fillStyle = k.steelDark;
    ctx.fill();
    // Forearm bar from under the sphere to the elbow plate.
    ctx.save();
    ctx.translate(mx(270, side), 400 - lift);
    ctx.rotate(-side * 0.35);
    ctx.beginPath();
    ctx.roundRect(-20, -6, 40, 12, 5);
    ctx.fillStyle = k.steelLight;
    ctx.fill();
    ink(ctx, k, 4.5);
    ctx.restore();

    const cx = mx(243, side);
    const cy = 352 - lift * 0.5;
    const r = 57;
    // Spikes on the outer lower half: outward, down-outward, down.
    for (const a of [Math.PI, 2.47, 1.86]) {
      const ang = side < 0 ? a : Math.PI - a;
      const nx = Math.cos(ang);
      const ny = Math.sin(ang);
      const bx = cx + nx * (r - 4);
      const by = cy + ny * (r - 4);
      const tip: [number, number] = [bx + nx * 36, by + ny * 36];
      const l: [number, number] = [bx - ny * 15, by + nx * 15];
      const rr: [number, number] = [bx + ny * 15, by - nx * 15];
      poly(ctx, [l, tip, [bx, by]]);
      ctx.fillStyle = k.accentLight;
      ctx.fill();
      poly(ctx, [[bx, by], tip, rr]);
      ctx.fillStyle = k.accent;
      ctx.fill();
      poly(ctx, [l, tip, rr]);
      ink(ctx, k, 4.5);
    }
    // Sphere: darker base, big lighter disc offset up-left, shine arc and dot.
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = k.steelDark;
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.beginPath();
    ctx.arc(cx - 7, cy - 8, r * 0.93, 0, Math.PI * 2);
    ctx.fillStyle = k.steel;
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ink(ctx, k);
    ctx.beginPath();
    ctx.arc(cx - 2, cy - 2, r * 0.72, Math.PI * 1.18, Math.PI * 1.45);
    ctx.strokeStyle = k.shine;
    ctx.lineWidth = 7;
    ctx.stroke();
    ctx.fillStyle = k.shine;
    ctx.beginPath();
    ctx.arc(cx + 30, cy - 26, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}
