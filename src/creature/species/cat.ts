import { clamp, lerp, TAU, type Vec2 } from '../../core/math';
import { Rng } from '../../core/random';
import type { BodyShape, Palette } from '../appearance';
import { mix } from '../color';
import type { Creature, CreaturePose } from '../creature';
import type { FaceParams } from '../face';
import { feetY, glow, inLocal } from '../render/parts';
import type { SpeciesDef } from './types';

/**
 * A small black cat after the owner's reference: a plain silhouette, big round yellow eyes and a
 * tail that curls up beside it. Everything expressive is cat body language read from the shared
 * face parameters: pupils go to slits or dilate, lids slant, ears perk, swivel or flatten,
 * whiskers fan or pull back, the ":3" mouth opens to show fangs, and the tail lashes or puffs.
 *
 * Shapes are authored in "cat units": origin at the feet, y down, 110 units per body radius.
 */

const UNITS_PER_R = 110;
const INK_W = 3.6;

/** Hit-test / shadow envelope (units of R from the body centre). */
const SHAPE: BodyShape = {
  id: 'cat-sitting',
  name: 'Sitting cat',
  rx: 0.72,
  ryTop: 1.0,
  ryBottom: 0.85,
  nTop: 2.2,
  nBottom: 3,
  pear: 0,
  peak: 0,
};

/** Colour roles this character's renderer reads from `palette.colors`. */
type Role =
  | 'fur'
  | 'furLight'
  | 'earInner'
  | 'eye'
  | 'eyeRim'
  | 'eye2'
  | 'eyeRim2'
  | 'pupil'
  | 'nose'
  | 'beans'
  | 'mouthInner'
  | 'tongue'
  | 'whisker'
  | 'blush';

interface Kit {
  ink: string;
  fur: string;
  furLight: string;
  sheen: string;
  earInner: string;
  eyes: [{ eye: string; rim: string }, { eye: string; rim: string }];
  pupil: string;
  nose: string;
  beans: string;
  mouthInner: string;
  tongue: string;
  whisker: string;
  /** Closed-eye lines and the mouth line: visible on dark fur, never pure white. */
  line: string;
  blush: string;
}

function kit(p: Palette): Kit {
  const c = p.colors as Record<Role, string>;
  return {
    ink: p.outline,
    fur: c.fur,
    furLight: c.furLight,
    sheen: mix(c.fur, c.furLight, 0.6),
    earInner: c.earInner,
    eyes: [
      { eye: c.eye, rim: c.eyeRim },
      { eye: c.eye2, rim: c.eyeRim2 },
    ],
    pupil: c.pupil,
    nose: c.nose,
    beans: c.beans,
    mouthInner: c.mouthInner,
    tongue: c.tongue,
    whisker: c.whisker,
    line: mix(c.whisker, c.furLight, 0.45),
    blush: c.blush,
  };
}

function palette(id: string, name: string, outline: string, colors: Record<Role, string>): Palette {
  return { id, name, outline, accent: colors.eye, accent2: colors.blush, colors };
}

const BLACK_FUR = {
  fur: '#17171e',
  furLight: '#43465a',
  earInner: '#4a2f40',
  pupil: '#09090c',
  nose: '#2e2229',
  beans: '#6b3a52',
  mouthInner: '#6a2338',
  tongue: '#ec7f9c',
  whisker: '#d3d5df',
  blush: '#ff6f9e',
} as const;

const PALETTES: Record<string, Palette> = {
  midnight: palette('midnight', 'Midnight', '#060609', {
    ...BLACK_FUR,
    eye: '#ffe42e',
    eyeRim: '#c29f0c',
    eye2: '#ffe42e',
    eyeRim2: '#c29f0c',
  }),
  emerald: palette('emerald', 'Emerald Eyes', '#060609', {
    ...BLACK_FUR,
    eye: '#9be65a',
    eyeRim: '#3f8c2a',
    eye2: '#9be65a',
    eyeRim2: '#3f8c2a',
  }),
  copper: palette('copper', 'Copper Eyes', '#060609', {
    ...BLACK_FUR,
    eye: '#ffa245',
    eyeRim: '#b85a17',
    eye2: '#ffa245',
    eyeRim2: '#b85a17',
  }),
  oddEyes: palette('oddEyes', 'Odd Eyes', '#060609', {
    ...BLACK_FUR,
    eye: '#ffe42e',
    eyeRim: '#c29f0c',
    eye2: '#7fd0ff',
    eyeRim2: '#2f7fc0',
  }),
  smoke: palette('smoke', 'Smoke', '#1b1d25', {
    fur: '#4d5262',
    furLight: '#7c8398',
    earInner: '#9a7486',
    eye: '#ffc23a',
    eyeRim: '#c27d12',
    eye2: '#ffc23a',
    eyeRim2: '#c27d12',
    pupil: '#0d0d12',
    nose: '#9a6476',
    beans: '#d48aa3',
    mouthInner: '#6a2338',
    tongue: '#ef8ba6',
    whisker: '#e6e8ef',
    blush: '#ff7fa8',
  }),
};

// --- Per-creature extras (ear twitches, tail lashing) -------------------------------------------

interface CatState {
  rng: Rng;
  /** Seconds left in each ear's twitch ([left, right]). */
  ear: [number, number];
  nextEar: number;
  whisker: number;
  nextWhisker: number;
  nextFlick: number;
  lashDir: number;
  nextLash: number;
}

const EAR_TWITCH = 0.24;
const WHISKER_TWITCH = 0.3;
const states = new WeakMap<Creature, CatState>();

function stateOf(c: Creature): CatState {
  let s = states.get(c);
  if (!s) {
    const rng = new Rng(0xca7 ^ Math.round(c.x * 31 + c.y * 17));
    s = {
      rng,
      ear: [0, 0],
      nextEar: rng.range(2, 5),
      whisker: 0,
      nextWhisker: rng.range(3, 7),
      nextFlick: rng.range(3, 7),
      lashDir: 1,
      nextLash: 0,
    };
    states.set(c, s);
  }
  return s;
}

function update(c: Creature, dt: number): void {
  const s = stateOf(c);
  s.ear[0] = Math.max(0, s.ear[0] - dt);
  s.ear[1] = Math.max(0, s.ear[1] - dt);
  s.whisker = Math.max(0, s.whisker - dt);
  if (!c.anim.enabled) return;

  // Ear twitches: one ear flicks now and then, sometimes twice.
  s.nextEar -= dt;
  if (s.nextEar <= 0) {
    s.ear[s.rng.int(0, 1)] = EAR_TWITCH;
    s.nextEar = s.rng.chance(0.3) ? EAR_TWITCH + 0.12 : s.rng.range(2.5, 7);
  }
  s.nextWhisker -= dt;
  if (s.nextWhisker <= 0) {
    s.whisker = WHISKER_TWITCH;
    s.nextWhisker = s.rng.range(3, 9);
  }

  // Tail: lashes side to side when annoyed, quivers when excited, otherwise an occasional flick.
  const w = c.mixer.weights();
  if (w.annoyed > 0.35) {
    s.nextLash -= dt;
    if (s.nextLash <= 0) {
      c.kickChains(s.lashDir * 4.5 * w.annoyed, -1);
      s.lashDir = -s.lashDir;
      s.nextLash = 0.5;
    }
  } else if (w.excited > 0.5) {
    s.nextLash -= dt;
    if (s.nextLash <= 0) {
      c.kickChains(s.lashDir * 0.9, -0.4);
      s.lashDir = -s.lashDir;
      s.nextLash = 0.09;
    }
  } else {
    s.nextFlick -= dt;
    if (s.nextFlick <= 0) {
      c.kickChains(s.rng.range(-2, 2), -0.6);
      s.nextFlick = s.rng.range(4, 9);
    }
  }
}

/** A short 0 → 1 → 0 pulse while a twitch timer runs down. */
const twitch = (left: number, duration: number) =>
  left > 0 ? Math.sin(Math.PI * (1 - left / duration)) : 0;

// --- Moods read from the face parameters --------------------------------------------------------

interface Moods {
  /** Hiss and bristle (scared). */
  fright: number;
  /** Slit pupils, flattened ears (annoyed). */
  anger: number;
  /** Smiling. */
  joy: number;
  /** Big wet eyes (sad). */
  sorrow: number;
  /** Pupil dilation: ~0.45 thin slit … ~1.5 fully round. */
  dilation: number;
}

function moods(f: FaceParams): Moods {
  const fright = clamp(f.mouthWobble * Math.max(0, -f.browTilt) * 1.6, 0, 1);
  const anger = clamp(Math.max(0, f.browTilt) * Math.max(0, f.lidTilt) * 1.6, 0, 1);
  const joy = clamp((f.mouthCurve - 0.4) / 0.6, 0, 1);
  const sorrow = clamp(-f.mouthCurve, 0, 1) * clamp(-f.lidTilt * 1.3, 0, 1);
  const dilation =
    f.pupilScale + 2.2 * Math.max(0, f.eyeOpen - 1) + 0.45 * Math.max(0, -f.browTilt) - 0.5 * anger;
  return { fright, anger, joy, sorrow, dilation };
}

// --- Species ------------------------------------------------------------------------------------

export const CAT: SpeciesDef = {
  id: 'cat',
  name: 'Black Cat',
  tagline: 'A small black cat with big yellow eyes and a lot of opinions.',
  personality:
    'Curious, a little dramatic, judges your tabs in silence. Drops the act and gets serious ' +
    'when it has advice.',
  palettes: PALETTES,
  defaultPalette: 'midnight',
  shape: SHAPE,
  dangly: [
    {
      // Tail: rises from behind the right haunch and curls up and over at the tip.
      rootAngle: 0.95,
      rootInset: 0.8,
      restAngle: -0.15,
      curl: -0.3,
      droopCurl: 0.2,
      segments: 7,
      segLen: 0.15,
      stiffness: 0.22,
      friction: 0.88,
      // A frightened cat's tail shoots up, bottle-brush style.
      droopFor: (f) => f.droop - moods(f).fright * 1.2,
    },
  ],
  softness: 0.75,
  // Quick, springy and a good climber.
  movement: {
    walkSpeed: 70,
    runSpeed: 260,
    jumpUp: 250,
    jumpAcross: 230,
    canClimb: true,
    climbSpeed: 95,
    stepHz: 3.2,
  },
  shadowScale: 0.85,
  update,
  draw(ctx, c, basePose) {
    const k = kit(c.palette);
    const pose = { ...basePose, face: catFace(basePose.face, c.mixer.weights().happy) };
    const f = pose.face;
    const m = moods(f);
    const s = stateOf(c);
    drawTail(ctx, c, pose, k, m);
    inLocal(ctx, pose, () => {
      const scale = pose.R / UNITS_PER_R;
      ctx.translate(0, feetY(pose));
      ctx.scale(scale, scale);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      const ears: [number, number] = [twitch(s.ear[0], EAR_TWITCH), twitch(s.ear[1], EAR_TWITCH)];
      // Walking or dangling: the cat gets up off its haunches and its legs show.
      const stand = Math.min(1, pose.motion.walk);
      const legsOut = Math.max(stand, pose.motion.held);
      if (legsOut > 0.02) drawHindLegs(ctx, k, pose, stand, legsOut);
      ctx.save();
      ctx.translate(0, -BODY_RISE * stand);
      drawSilhouette(ctx, k, f, m, ears);
      const shift = { x: (pose.faceShift.x / scale) * 0.7, y: (pose.faceShift.y / scale) * 0.7 };
      drawFace(ctx, k, pose, m, shift, twitch(s.whisker, WHISKER_TWITCH));
      ctx.restore();
      drawFrontLegs(ctx, c, pose, k, stand, legsOut);
    });
  },
};

/**
 * The cat's own take on "happy" (the owner's pick): eyes shut in "^^" arcs and an open smile,
 * without the blush. Blended by the happy weight so transitions stay smooth.
 */
function catFace(f: FaceParams, happy: number): FaceParams {
  if (happy <= 0) return f;
  const target: Partial<FaceParams> = { eyeOpen: 0, eyeSquint: 0.8, mouthOpen: 0.4, blush: 0 };
  const out = { ...f };
  for (const key of Object.keys(target) as (keyof FaceParams)[]) {
    out[key] = lerp(f[key], target[key]!, happy);
  }
  return out;
}

// --- Paths ---------------------------------------------------------------------------------------

/** Quadratic [cx, cy, x, y] or cubic [c1x, c1y, c2x, c2y, x, y] segment. */
type Seg = readonly number[];

/**
 * Trace a left/right symmetric closed outline: `segs` run down the right side from `start` (on
 * the centre line) back to the centre line; the left side is the mirror, traced in reverse.
 */
function symmetricPath(ctx: CanvasRenderingContext2D, start: Vec2, segs: readonly Seg[]): void {
  const end = (i: number): Vec2 => {
    if (i < 0) return start;
    const s = segs[i]!;
    return { x: s[s.length - 2]!, y: s[s.length - 1]! };
  };
  ctx.moveTo(start.x, start.y);
  for (const s of segs) {
    if (s.length === 6) ctx.bezierCurveTo(s[0]!, s[1]!, s[2]!, s[3]!, s[4]!, s[5]!);
    else ctx.quadraticCurveTo(s[0]!, s[1]!, s[2]!, s[3]!);
  }
  for (let i = segs.length - 1; i >= 0; i--) {
    const s = segs[i]!;
    const from = end(i - 1);
    if (s.length === 6) ctx.bezierCurveTo(-s[2]!, s[3]!, -s[0]!, s[1]!, -from.x, from.y);
    else ctx.quadraticCurveTo(-s[0]!, s[1]!, -from.x, from.y);
  }
  ctx.closePath();
}

const HEAD_TOP = -194;
const HEAD: readonly Seg[] = [
  [36, -194, 62, -178, 66, -148],
  [70, -131, 78, -120],
  [69, -117, 66, -112],
  [71, -106, 69, -100],
  [52, -88, 0, -88],
];
const headPath = (ctx: CanvasRenderingContext2D) => {
  ctx.beginPath();
  symmetricPath(ctx, { x: 0, y: HEAD_TOP }, HEAD);
};

const BODY: readonly Seg[] = [
  [30, -122, 44, -100, 47, -78],
  [51, -58, 48, -42, 53, -30],
  [72, -22, 70, -2, 54, 0],
  [28, 2, 0, 1],
];
const bodyPath = (ctx: CanvasRenderingContext2D) => {
  ctx.beginPath();
  symmetricPath(ctx, { x: 0, y: -122 }, BODY);
};

const hindFeetPath = (ctx: CanvasRenderingContext2D) => {
  ctx.beginPath();
  for (const side of [-1, 1]) {
    ctx.moveTo(side * 66, -5);
    ctx.ellipse(side * 51, -5, 15, 6.5, 0, 0, TAU);
  }
};

/** Ear geometry around its pivot (base midpoint), for the left ear; x is mirrored for the right. */
interface EarPose {
  pivot: Vec2;
  angle: number;
  len: number;
}

function earPoses(f: FaceParams, m: Moods, twitches: [number, number]): [EarPose, EarPose] {
  return ([-1, 1] as const).map((side, i) => {
    const curiousRight = side > 0 ? f.browAsym : 0;
    // Positive = rotate outward (tip away from the centre line).
    const rot =
      0.04 -
      f.browHeight * 0.1 +
      f.droop * 0.55 +
      m.anger * 0.8 +
      m.fright * 1.05 -
      curiousRight * 0.28 +
      twitches[i]! * 0.42;
    const len =
      1 +
      f.browHeight * 0.1 -
      m.anger * 0.22 -
      m.fright * 0.38 -
      f.droop * 0.1 +
      curiousRight * 0.1 -
      twitches[i]! * 0.08;
    return { pivot: { x: side * 43, y: -174 }, angle: side * rot, len };
  }) as [EarPose, EarPose];
}

function earPath(ctx: CanvasRenderingContext2D, e: EarPose, side: number, inset = 0): void {
  const s = side;
  const L = e.len;
  // Unrotated left-ear points relative to the pivot; `inset` shrinks toward the centre.
  const shrink = (x: number, y: number, cx: number, cy: number): [number, number] => [
    lerp(x, cx, inset),
    lerp(y, cy, inset),
  ];
  const cx = -6;
  const cy = -16 * L;
  const outer = shrink(-22, 16, cx, cy);
  const inner = shrink(22, -14, cx, cy);
  const tip = shrink(-16, -56 * L, cx, cy);
  const cOuter = shrink(-30, -16 * L, cx, cy);
  const cInner = shrink(8, -40 * L, cx, cy);
  ctx.save();
  ctx.translate(e.pivot.x, e.pivot.y);
  ctx.rotate(e.angle);
  ctx.scale(s < 0 ? 1 : -1, 1);
  ctx.beginPath();
  ctx.moveTo(outer[0], outer[1]);
  ctx.quadraticCurveTo(cOuter[0], cOuter[1], tip[0], tip[1]);
  ctx.quadraticCurveTo(cInner[0], cInner[1], inner[0], inner[1]);
  ctx.closePath();
  ctx.restore();
}

/** Fur bristling along the back and head when frightened (outward spikes). */
const BRISTLE: readonly (readonly [number, number, number, number])[] = [
  // x, y, normal x, normal y (right side; mirrored for the left)
  [47, -84, 0.95, -0.3],
  [50, -64, 1, 0],
  [51, -46, 1, 0.05],
  [60, -27, 0.85, -0.5],
  [26, -188, 0.4, -0.92],
  [0, -194, 0, -1],
  [62, -160, 0.95, -0.3],
];

function bristlePath(ctx: CanvasRenderingContext2D, amount: number): void {
  ctx.beginPath();
  if (amount < 0.04) return;
  for (const side of [-1, 1]) {
    for (const [x, y, nx, ny] of BRISTLE) {
      if (x === 0 && side < 0) continue;
      const px = x * side;
      const nX = nx * side;
      const tx = -ny;
      const ty = nX;
      const len = 11 * amount;
      ctx.moveTo(px + tx * 6 - nX * 2, y + ty * 6 - ny * 2);
      ctx.lineTo(px + nX * len, y + ny * len);
      ctx.lineTo(px - tx * 6 - nX * 2, y - ty * 6 - ny * 2);
      ctx.closePath();
    }
  }
}

// --- Silhouette ----------------------------------------------------------------------------------

/**
 * Body, hind feet, ears and head as one silhouette: every part is outlined first, then every part
 * is filled, so the outline only shows around the outside (as in the reference).
 */
function drawSilhouette(
  ctx: CanvasRenderingContext2D,
  k: Kit,
  f: FaceParams,
  m: Moods,
  twitches: [number, number],
): void {
  const ears = earPoses(f, m, twitches);
  const parts: (() => void)[] = [
    () => bristlePath(ctx, m.fright),
    () => bodyPath(ctx),
    () => hindFeetPath(ctx),
    () => earPath(ctx, ears[0], -1),
    () => earPath(ctx, ears[1], 1),
    () => headPath(ctx),
  ];
  ctx.strokeStyle = k.ink;
  ctx.lineWidth = INK_W * 2;
  for (const p of parts) {
    p();
    ctx.stroke();
  }

  // Fills: a soft sheen from the top left keeps the black from reading as a flat hole.
  const bodyFill = ctx.createRadialGradient(-22, -90, 4, -10, -60, 95);
  bodyFill.addColorStop(0, k.sheen);
  bodyFill.addColorStop(1, k.fur);
  ctx.fillStyle = bodyFill;
  bristlePath(ctx, m.fright);
  ctx.fill();
  bodyPath(ctx);
  ctx.fill();
  ctx.fillStyle = k.fur;
  hindFeetPath(ctx);
  ctx.fill();

  ears.forEach((e, i) => {
    const side = i === 0 ? -1 : 1;
    ctx.fillStyle = k.fur;
    earPath(ctx, e, side);
    ctx.fill();
    // Inner ear with a few tufts of fur.
    ctx.fillStyle = k.earInner;
    earPath(ctx, e, side, 0.32);
    ctx.fill();
    ctx.save();
    ctx.translate(e.pivot.x, e.pivot.y);
    ctx.rotate(e.angle);
    ctx.scale(side < 0 ? 1 : -1, 1);
    ctx.strokeStyle = k.furLight;
    ctx.globalAlpha *= 0.55;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(4, -6);
    ctx.quadraticCurveTo(-2, -22 * e.len, -6, -34 * e.len);
    ctx.moveTo(10, -10);
    ctx.quadraticCurveTo(4, -22 * e.len, 0, -28 * e.len);
    ctx.stroke();
    ctx.restore();
  });

  ctx.fillStyle = headGradient(ctx, k);
  headPath(ctx);
  ctx.fill();

  // Rim light along the top of the head.
  ctx.save();
  headPath(ctx);
  ctx.clip();
  ctx.strokeStyle = k.furLight;
  ctx.globalAlpha *= 0.5;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, -138, 54, -Math.PI * 0.86, -Math.PI * 0.58);
  ctx.stroke();
  ctx.restore();

  // Chest fluff under the chin.
  ctx.strokeStyle = k.furLight;
  ctx.lineWidth = 1.8;
  ctx.save();
  ctx.globalAlpha *= 0.55;
  ctx.beginPath();
  for (const [x, y, w] of [
    [-8, -80, 5],
    [5, -77, 5],
    [-2, -70, 4],
  ] as const) {
    ctx.moveTo(x - w, y - 4);
    ctx.lineTo(x, y);
    ctx.lineTo(x + w, y - 4);
  }
  ctx.stroke();
  ctx.restore();
}

/** Faint hints of the resting front legs: the gap between them and the tops of the paws. */
function drawLegHints(ctx: CanvasRenderingContext2D, k: Kit, lifted: [number, number]): void {
  ctx.save();
  ctx.strokeStyle = k.furLight;
  ctx.lineWidth = 1.8;
  ctx.globalAlpha *= 0.35 * (1 - Math.max(...lifted));
  ctx.beginPath();
  ctx.moveTo(0, -44);
  ctx.quadraticCurveTo(1.5, -22, 0, -4);
  for (const side of [-1, 1]) {
    ctx.moveTo(side * 9, -9);
    ctx.quadraticCurveTo(side * 19, -17, side * 29, -9);
  }
  ctx.stroke();
  ctx.restore();
}

/** The head's fur shading; eyelids reuse it (offset by the face shift) so they blend in. */
function headGradient(ctx: CanvasRenderingContext2D, k: Kit, dx = 0, dy = 0): CanvasGradient {
  const g = ctx.createRadialGradient(-24 + dx, -176 + dy, 4, -10 + dx, -150 + dy, 92);
  g.addColorStop(0, k.sheen);
  g.addColorStop(1, k.fur);
  return g;
}

// --- Front legs and paws -------------------------------------------------------------------------

/**
 * Front legs: resting on the ground, lifted to the chest ("bunny paws") as arms raise, and the
 * right one beckons like a lucky cat while waving. Raised paws show their toe beans.
 */
/** How far the body rises off its haunches when standing to walk (cat units). */
const BODY_RISE = 14;

/** Hind legs, behind the body: trotting while walking, hanging loose while carried. */
function drawHindLegs(
  ctx: CanvasRenderingContext2D,
  k: Kit,
  pose: CreaturePose,
  stand: number,
  show: number,
) {
  const M = pose.motion;
  const walk = Math.min(1, M.walk);
  for (const side of [-1, 1] as const) {
    // Diagonal gait: each hind leg moves with the opposite front leg.
    const step = Math.sin(pose.walkPhase + (side > 0 ? 0 : Math.PI));
    const lift = Math.max(0, step) * walk;
    const hip = { x: side * 40, y: -34 - BODY_RISE * stand };
    const walking = { x: side * 46 + M.facing * 6 * step * walk, y: -5 - 9 * lift };
    const hanging = { x: side * 38 + Math.sin(pose.time * 2.6 + side) * 2, y: 2 };
    const foot = {
      x: lerp(walking.x, hanging.x, M.held),
      y: lerp(walking.y, hanging.y, M.held),
    };
    ctx.save();
    ctx.globalAlpha *= clamp(show * 4, 0, 1);
    ctx.beginPath();
    ctx.moveTo(hip.x, hip.y);
    ctx.lineTo(foot.x, foot.y);
    ctx.strokeStyle = k.ink;
    ctx.lineWidth = 18 + INK_W * 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(foot.x, foot.y, 13, 7, 0, 0, TAU);
    ctx.lineWidth = INK_W * 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(hip.x, hip.y);
    ctx.lineTo(foot.x, foot.y);
    ctx.strokeStyle = k.fur;
    ctx.lineWidth = 18;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(foot.x, foot.y, 13, 7, 0, 0, TAU);
    ctx.fillStyle = k.fur;
    ctx.fill();
    ctx.restore();
  }
}

function drawFrontLegs(
  ctx: CanvasRenderingContext2D,
  c: Creature,
  pose: CreaturePose,
  k: Kit,
  stand: number,
  legsOut: number,
) {
  const f = pose.face;
  const M = pose.motion;
  const walk = Math.min(1, M.walk);
  const waving = c.anim.currentFidget === 'wave';
  const wave = pose.arms[1] - lerp(1.15, -0.75, f.armRaise);
  // Waves and yawns lift the generic "arms"; a cat keeps its paws down unless the mood says so.
  const exprRaise = waving || c.anim.isYawning ? c.mixer.face().armRaise : f.armRaise;
  const legs = ([-1, 1] as const).map((side) => {
    const beckon = side > 0 && waving ? clamp(f.armRaise / 0.9, 0, 1) : 0;
    const raise = clamp(exprRaise, 0, 1);
    // Resting paw: sitting, trotting (alternate steps), or hanging while carried.
    const step = Math.sin(pose.walkPhase + (side > 0 ? Math.PI : 0));
    const stepLift = Math.max(0, step) * walk;
    const trot = { x: side * 19 + M.facing * 7 * step * walk, y: -6 - 11 * stepLift };
    const hang = { x: side * 17 + Math.sin(pose.time * 3 + side) * 2, y: 4 };
    const sit = { x: side * 19, y: -8 };
    const rest = {
      x: lerp(lerp(sit.x, trot.x, walk), hang.x, M.held),
      y: lerp(lerp(sit.y, trot.y, walk), hang.y, M.held),
    };
    const up = { x: side * (26 + raise * 4), y: -8 - 62 * raise };
    const high = { x: side * 40, y: -120 };
    const paw = {
      x: lerp(lerp(rest.x, up.x, raise), high.x, beckon),
      y: lerp(lerp(rest.y, up.y, raise), high.y, beckon),
    };
    // Clinging to a window side: both paws reach up beside the head and grip, taking turns.
    const grip = {
      x: M.climbSide * 62 + side * 9,
      y: -122 - side * M.climbSide * 16 + Math.sin(pose.time * 9 + (side > 0 ? Math.PI : 0)) * 6,
    };
    paw.x = lerp(paw.x, grip.x, M.climb);
    paw.y = lerp(paw.y, grip.y, M.climb);
    const lifted = Math.max(raise * (1 - M.held), beckon, M.climb);
    const angle = side * (beckon * (0.25 + wave * 1.6) - raise * 0.25);
    const show = Math.max(clamp((lifted - 0.3) * 5, 0, 1), clamp(legsOut * 4, 0, 1));
    // Walking legs come out from under the chest; lifted ones reach from the shoulder.
    const shoulderY = lerp(-48, -74, clamp(lifted, 0, 1)) - BODY_RISE * stand;
    const shoulder = { x: side * 21, y: shoulderY };
    return { shoulder, paw, lifted, angle, show };
  });
  drawLegHints(ctx, k, [legs[0]!.show, legs[1]!.show]);
  for (const l of legs) drawLeg(ctx, k, l.shoulder, l.paw, l.lifted, l.angle, l.show);
}

function drawLeg(
  ctx: CanvasRenderingContext2D,
  k: Kit,
  shoulder: Vec2,
  paw: Vec2,
  lifted: number,
  pawAngle: number,
  show: number,
): void {
  const pawPath = () => {
    ctx.beginPath();
    ctx.ellipse(paw.x, paw.y, 13, lerp(7.5, 11.5, lifted), pawAngle, 0, TAU);
  };
  // A lifted leg is drawn over the body (outline, then fur); resting legs are part of the
  // silhouette, so only their toes show.
  if (show > 0) {
    ctx.save();
    ctx.globalAlpha *= show;
    ctx.beginPath();
    ctx.moveTo(shoulder.x, shoulder.y);
    ctx.lineTo(paw.x, paw.y);
    ctx.strokeStyle = k.ink;
    ctx.lineWidth = 20 + INK_W * 2;
    ctx.stroke();
    pawPath();
    ctx.lineWidth = INK_W * 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(shoulder.x, shoulder.y);
    ctx.lineTo(paw.x, paw.y);
    ctx.strokeStyle = k.fur;
    ctx.lineWidth = 20;
    ctx.stroke();
    pawPath();
    ctx.fillStyle = k.fur;
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  ctx.translate(paw.x, paw.y);
  ctx.rotate(pawAngle);
  if (lifted > 0.35) {
    // Toe beans: a palm pad and three toes.
    ctx.globalAlpha *= clamp((lifted - 0.35) * 4, 0, 1);
    ctx.fillStyle = k.beans;
    ctx.beginPath();
    ctx.ellipse(0, 3, 5.2, 4, 0, 0, TAU);
    for (const [x, y] of [
      [-6.5, -3.5],
      [0, -6.5],
      [6.5, -3.5],
    ] as const) {
      ctx.moveTo(x + 2.6, y);
      ctx.ellipse(x, y, 2.6, 2.3, 0, 0, TAU);
    }
    ctx.fill();
  } else {
    // Toes seen from the front.
    ctx.strokeStyle = k.furLight;
    ctx.globalAlpha *= 0.6 * (1 - lifted * 2.5);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-4, 1);
    ctx.lineTo(-4, 6);
    ctx.moveTo(4, 1);
    ctx.lineTo(4, 6);
    ctx.stroke();
  }
  ctx.restore();
}

// --- Tail (world space; the chain is simulated by the creature) ---------------------------------

function catmull(a: Vec2, b: Vec2, c: Vec2, d: Vec2, t: number): Vec2 {
  const t2 = t * t;
  const t3 = t2 * t;
  const f = (p0: number, p1: number, p2: number, p3: number) =>
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  return { x: f(a.x, b.x, c.x, d.x), y: f(a.y, b.y, c.y, d.y) };
}

function drawTail(
  ctx: CanvasRenderingContext2D,
  c: Creature,
  pose: CreaturePose,
  k: Kit,
  m: Moods,
): void {
  const chain = c.chains[0];
  if (!chain) return;
  const pts = chain.points;
  const n = pts.length;
  const samples: Vec2[] = [];
  const STEPS = 4;
  for (let i = 0; i < n - 1; i++) {
    const a = pts[Math.max(0, i - 1)]!;
    const d = pts[Math.min(n - 1, i + 2)]!;
    for (let s = 0; s < STEPS; s++) samples.push(catmull(a, pts[i]!, pts[i + 1]!, d, s / STEPS));
  }
  samples.push(pts[n - 1]!);

  const R = pose.R;
  const puff = m.fright;
  const left: Vec2[] = [];
  const right: Vec2[] = [];
  const N = samples.length;
  for (let i = 0; i < N; i++) {
    const p = samples[i]!;
    const q = samples[Math.min(N - 1, i + 1)]!;
    const o = samples[Math.max(0, i - 1)]!;
    const tx = q.x - o.x;
    const ty = q.y - o.y;
    const len = Math.hypot(tx, ty) || 1;
    const nx = -ty / len;
    const ny = tx / len;
    const t = i / (N - 1);
    let w = R * lerp(0.1, 0.075, t) * (1 + puff * lerp(0.45, 0.9, t));
    if (puff > 0.04 && i > 1) w *= 1 + 0.16 * puff * (i % 2 === 0 ? 1 : -0.4);
    left.push({ x: p.x + nx * w, y: p.y + ny * w });
    right.push({ x: p.x - nx * w, y: p.y - ny * w });
  }
  const tip = samples[N - 1]!;
  const tipW = Math.hypot(left[N - 1]!.x - tip.x, left[N - 1]!.y - tip.y);
  const end = samples[N - 2]!;
  const tipAngle = Math.atan2(tip.y - end.y, tip.x - end.x);

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.beginPath();
  left.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.arc(tip.x, tip.y, tipW, tipAngle + Math.PI / 2, tipAngle - Math.PI / 2, true);
  for (let i = N - 1; i >= 0; i--) ctx.lineTo(right[i]!.x, right[i]!.y);
  ctx.closePath();
  ctx.strokeStyle = k.ink;
  ctx.lineWidth = (INK_W * 2 * R) / UNITS_PER_R;
  ctx.stroke();
  ctx.fillStyle = k.fur;
  ctx.fill();
  // Sheen along the upper edge.
  ctx.beginPath();
  for (let i = 2; i < N - 1; i++) {
    const p = samples[i]!;
    const l = left[i]!;
    const x = lerp(p.x, l.x, 0.55);
    const y = lerp(p.y, l.y, 0.55);
    if (i === 2) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = k.furLight;
  ctx.globalAlpha *= 0.45;
  ctx.lineWidth = R * 0.022;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.restore();
}

// --- Face ----------------------------------------------------------------------------------------

const EYE_X = 29;
const EYE_Y = -141;
const EYE_R = 20;

function drawFace(
  ctx: CanvasRenderingContext2D,
  k: Kit,
  pose: CreaturePose,
  m: Moods,
  shift: Vec2,
  whiskerTwitch: number,
): void {
  const f = pose.face;
  ctx.save();
  ctx.translate(shift.x, shift.y);
  const lidFill = headGradient(ctx, k, -shift.x, -shift.y);

  // Blush first so the eyes and whiskers sit on top of it.
  const blush = clamp((f.blush - 0.45) * 2, 0, 0.8);
  if (blush > 0) {
    for (const side of [-1, 1]) glow(ctx, side * 38, -119, 15, k.blush, blush);
  }

  for (const side of [-1, 1] as const) {
    const colors = k.eyes[side < 0 ? 0 : 1];
    const cy = EYE_Y - (side > 0 ? f.browAsym * 4 : 0);
    drawEye(ctx, k, colors, side * EYE_X, cy, side, f, m, pose.look, lidFill);
    drawBrowWhiskers(ctx, k, side * EYE_X, cy, side, f);
  }
  drawMuzzle(ctx, k, pose, m, whiskerTwitch);
  ctx.restore();
}

function drawEye(
  ctx: CanvasRenderingContext2D,
  k: Kit,
  colors: { eye: string; rim: string },
  cx: number,
  cy: number,
  side: -1 | 1,
  f: FaceParams,
  m: Moods,
  look: Vec2,
  lidFill: CanvasGradient,
): void {
  const open = f.eyeOpen;
  const r = EYE_R * (1 + Math.max(0, open - 1) * 0.45) * (1 + m.sorrow * 0.06);
  if (open < 0.1) {
    drawClosedEye(ctx, k, cx, cy, side, f.eyeSquint > 0.35);
    return;
  }

  const eyePath = () => {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
  };
  ctx.save();
  eyePath();
  ctx.clip();

  // Iris: bright centre fading to a deeper rim, with fine radial fibres.
  const g = ctx.createRadialGradient(cx, cy + r * 0.25, r * 0.1, cx, cy, r);
  g.addColorStop(0, mix(colors.eye, '#ffffff', 0.25));
  g.addColorStop(0.55, colors.eye);
  g.addColorStop(1, colors.rim);
  ctx.fillStyle = g;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.strokeStyle = colors.rim;
  ctx.lineWidth = 1.1;
  ctx.save();
  ctx.globalAlpha *= 0.35;
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU + 0.1;
    ctx.moveTo(cx + Math.cos(a) * r * 0.38, cy + Math.sin(a) * r * 0.38);
    ctx.lineTo(cx + Math.cos(a) * r * 0.9, cy + Math.sin(a) * r * 0.9);
  }
  ctx.stroke();
  ctx.restore();

  // Pupil: a pointed slit when calm or cross, dilating to a big round pupil when excited,
  // startled or pleading.
  const t = clamp((m.dilation - 0.45) / 1.05, 0, 1);
  const pw = r * lerp(0.1, 0.62, t);
  const ph = r * lerp(0.86, 0.7, t);
  const px = cx + look.x * r * 0.3;
  const py = cy + look.y * r * 0.22;
  const round = Math.pow(t, 0.8);
  const c = pw * (4 / 3);
  ctx.beginPath();
  ctx.moveTo(px, py - ph);
  ctx.bezierCurveTo(px + c, py - ph * round, px + c, py + ph * round, px, py + ph);
  ctx.bezierCurveTo(px - c, py + ph * round, px - c, py - ph * round, px, py - ph);
  ctx.fillStyle = k.pupil;
  ctx.fill();

  // Catchlights stay put while the pupil moves; bigger when pleading or sparkly.
  const shine = 1 + m.sorrow * 0.45 + f.sparkle * 0.25;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(cx - r * 0.34, cy - r * 0.38, r * 0.22 * shine, 0, TAU);
  ctx.moveTo(cx + r * 0.42, cy + r * 0.3);
  ctx.arc(cx + r * 0.32, cy + r * 0.3, r * 0.1 * shine, 0, TAU);
  ctx.fill();
  if (f.sparkle > 0.1) {
    const sr = r * 0.42 * f.sparkle;
    const sx = cx + r * 0.3;
    const sy = cy - r * 0.42;
    ctx.beginPath();
    ctx.moveTo(sx, sy - sr);
    ctx.quadraticCurveTo(sx + sr * 0.12, sy - sr * 0.12, sx + sr, sy);
    ctx.quadraticCurveTo(sx + sr * 0.12, sy + sr * 0.12, sx, sy + sr);
    ctx.quadraticCurveTo(sx - sr * 0.12, sy + sr * 0.12, sx - sr, sy);
    ctx.quadraticCurveTo(sx - sr * 0.12, sy - sr * 0.12, sx, sy - sr);
    ctx.fill();
  }
  if (m.sorrow > 0.05) {
    // Welling tears along the lower edge.
    ctx.strokeStyle = '#ffffff';
    ctx.globalAlpha *= 0.7 * m.sorrow;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.82, Math.PI * 0.18, Math.PI * 0.82);
    ctx.stroke();
    ctx.globalAlpha /= 0.7 * m.sorrow;
  }

  // Inner half of the eye's outline; the lids cover it where they close over the eye.
  eyePath();
  ctx.strokeStyle = k.ink;
  ctx.lineWidth = INK_W * 1.6;
  ctx.stroke();

  // Upper lid: lowers with eyeOpen and slants with lidTilt (+ = inner corner down, cross).
  const o = clamp(open, 0, 1);
  const lidBase = cy - r * 1.02 + (1 - o) * r * 1.9;
  const slant = f.lidTilt * r * 0.6;
  const innerX = cx - side * r;
  const outerX = cx + side * r;
  const innerY = lidBase + slant;
  const outerY = lidBase - slant;
  const lidMid = (innerY + outerY) / 2 + r * 0.16 * o;
  const upperLid = () => {
    ctx.moveTo(outerX, outerY);
    ctx.quadraticCurveTo(cx, lidMid + r * 0.08, innerX, innerY);
  };
  ctx.beginPath();
  ctx.moveTo(outerX + side * 4, cy - r - 6);
  ctx.lineTo(outerX + side * 4, outerY);
  ctx.lineTo(outerX, outerY);
  ctx.quadraticCurveTo(cx, lidMid + r * 0.08, innerX, innerY);
  ctx.lineTo(innerX - side * 4, innerY);
  ctx.lineTo(innerX - side * 4, cy - r - 6);
  ctx.closePath();
  ctx.fillStyle = lidFill;
  ctx.fill();

  // Lower lid: rises into a happy crescent with eyeSquint.
  const sq = f.eyeSquint;
  const lowY = cy + r * (1.02 - sq * 0.8);
  const lowC = cy + r * (1.02 - sq * 2.4);
  const lowerLid = () => {
    ctx.moveTo(cx - r - 2, lowY);
    ctx.quadraticCurveTo(cx, lowC, cx + r + 2, lowY);
  };
  if (sq > 0.02) {
    ctx.beginPath();
    lowerLid();
    ctx.lineTo(cx + r + 4, cy + r + 6);
    ctx.lineTo(cx - r - 4, cy + r + 6);
    ctx.closePath();
    ctx.fill();
  }

  // Lid edges.
  ctx.strokeStyle = k.ink;
  ctx.lineWidth = 3;
  ctx.beginPath();
  if (o < 0.97 || Math.abs(f.lidTilt) > 0.05) upperLid();
  if (sq > 0.02) lowerLid();
  ctx.stroke();
  ctx.restore();
}

/** Closed eye: "^" when smiling, a soft "u" when asleep or blinking, with two little lashes. */
function drawClosedEye(
  ctx: CanvasRenderingContext2D,
  k: Kit,
  cx: number,
  cy: number,
  side: number,
  happy: boolean,
): void {
  const w = EYE_R * 0.9;
  ctx.strokeStyle = k.line;
  ctx.lineWidth = 3.4;
  ctx.beginPath();
  if (happy) {
    ctx.moveTo(cx - w, cy + 4);
    ctx.quadraticCurveTo(cx, cy - EYE_R * 0.75, cx + w, cy + 4);
  } else {
    ctx.moveTo(cx - w, cy);
    ctx.quadraticCurveTo(cx, cy + EYE_R * 0.6, cx + w, cy);
    // Lashes at the outer corner.
    const ox = cx + side * w;
    ctx.moveTo(ox - side * 2, cy + 2);
    ctx.lineTo(ox + side * 4, cy + 6);
    ctx.moveTo(ox - side * 6, cy + 5);
    ctx.lineTo(ox - side * 2, cy + 10);
  }
  ctx.stroke();
}

/** Eyebrow whiskers: two fine hairs above each eye that lift, slant and arch with the brows. */
function drawBrowWhiskers(
  ctx: CanvasRenderingContext2D,
  k: Kit,
  cx: number,
  cy: number,
  side: number,
  f: FaceParams,
): void {
  const raise = f.browHeight * 6 + (side > 0 ? f.browAsym * 7 : 0);
  const base = { x: cx - side * EYE_R * 0.15, y: cy - EYE_R - 6 - raise * 0.4 };
  // Angry: hairs flatten toward the eye; worried: they lift at the inner end.
  const lift = -0.9 - f.browHeight * 0.25 - f.browTilt * -0.35;
  ctx.save();
  ctx.strokeStyle = k.whisker;
  ctx.globalAlpha *= 0.6;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  for (const [dx, len, extra] of [
    [0, 22, 0],
    [side * 5, 17, 0.25],
  ] as const) {
    const a = side > 0 ? lift - extra : Math.PI - lift + extra;
    const x0 = base.x + dx;
    const y0 = base.y - raise * 0.6 + f.browTilt * 3;
    const x1 = x0 + Math.cos(a) * len;
    const y1 = y0 + Math.sin(a) * len;
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(lerp(x0, x1, 0.5) - side * 2, lerp(y0, y1, 0.5) - 3, x1, y1);
  }
  ctx.stroke();
  ctx.restore();
}

/** Nose, ":3" mouth (opening to fangs, a yawn or a blep) and whiskers. */
function drawMuzzle(
  ctx: CanvasRenderingContext2D,
  k: Kit,
  pose: CreaturePose,
  m: Moods,
  whiskerTwitch: number,
): void {
  const f = pose.face;
  drawWhiskers(ctx, k, pose, m, whiskerTwitch);

  // Whisker pads: three dots each side.
  ctx.fillStyle = k.furLight;
  ctx.save();
  ctx.globalAlpha *= 0.6;
  ctx.beginPath();
  for (const side of [-1, 1]) {
    for (const [x, y] of [
      [10, -114],
      [14, -110],
      [10, -106],
    ] as const) {
      ctx.moveTo(side * x + 1.1, y);
      ctx.arc(side * x, y, 1.1, 0, TAU);
    }
  }
  ctx.fill();
  ctx.restore();

  const my = -110;
  const round = Math.max(0, pose.mouthRound);
  const blep = Math.max(0, -pose.mouthRound);
  const mw = 8.5 * f.mouthWidth;
  const curve = f.mouthCurve;
  const corner = my - curve * 3.5;

  if (round > 0.08) {
    drawYawn(ctx, k, my, round);
  } else if (f.mouthOpen > 0.07) {
    drawOpenMouth(ctx, k, f, m, my, mw, corner);
  } else {
    // Closed ":3" (or a frown, wobbly when nervous).
    ctx.beginPath();
    ctx.moveTo(0, -116);
    ctx.lineTo(0, my);
    for (const side of [-1, 1]) {
      const bulge = curve >= 0 ? 3 + curve * 3 : curve * 4;
      const steps = 8;
      ctx.moveTo(0, my);
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        // Quadratic from (0, my) via (side*mw/2, my+bulge) to (side*mw, corner).
        const x = 2 * (1 - t) * t * ((side * mw) / 2) + t * t * side * mw;
        const y =
          (1 - t) * (1 - t) * my +
          2 * (1 - t) * t * (my + bulge) +
          t * t * corner +
          Math.sin(t * Math.PI * 3) * f.mouthWobble * 1.6;
        ctx.lineTo(x, y);
      }
    }
    ctx.strokeStyle = k.line;
    ctx.lineWidth = 2.2;
    ctx.stroke();
    if (blep > 0.05) {
      // Blep: the tip of the tongue pokes out.
      ctx.beginPath();
      ctx.ellipse(0, my + 3 + 2.5 * blep, 3.6, 3.2 * blep + 1, 0, 0, TAU);
      ctx.fillStyle = k.tongue;
      ctx.fill();
      ctx.strokeStyle = k.ink;
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
  }

  // Nose: a small rounded triangle with a highlight.
  ctx.beginPath();
  ctx.moveTo(-5.5, -122);
  ctx.quadraticCurveTo(0, -124, 5.5, -122);
  ctx.quadraticCurveTo(5, -119.5, 0, -116);
  ctx.quadraticCurveTo(-5, -119.5, -5.5, -122);
  ctx.closePath();
  ctx.fillStyle = k.nose;
  ctx.fill();
  ctx.strokeStyle = k.ink;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.fillStyle = k.furLight;
  ctx.beginPath();
  ctx.arc(-2, -121.5, 1.1, 0, TAU);
  ctx.fill();
}

function drawOpenMouth(
  ctx: CanvasRenderingContext2D,
  k: Kit,
  f: FaceParams,
  m: Moods,
  my: number,
  mw: number,
  corner: number,
): void {
  const h = 4 + f.mouthOpen * 16;
  const w = mw + 2 + f.mouthOpen * 2;
  const top = my - 1;
  const shape = () => {
    ctx.beginPath();
    ctx.moveTo(-w, corner);
    // Top edge dips at the centre like the ":3".
    ctx.quadraticCurveTo(-w * 0.5, top + 2, 0, top);
    ctx.quadraticCurveTo(w * 0.5, top + 2, w, corner);
    // Bottom edge: wavy when frightened (a hiss).
    const steps = 10;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = lerp(w, -w, t);
      const bottom = Math.max(corner, top) + h * Math.sin(Math.PI * t);
      ctx.lineTo(x, bottom + Math.sin(t * Math.PI * 4) * f.mouthWobble * 1.5);
    }
    ctx.closePath();
  };
  shape();
  ctx.fillStyle = k.mouthInner;
  ctx.fill();
  ctx.save();
  shape();
  ctx.clip();
  ctx.fillStyle = k.tongue;
  ctx.beginPath();
  ctx.ellipse(0, top + h + 4, w * 0.62, h * 0.55, 0, 0, TAU);
  ctx.fill();
  // Fangs, longer when hissing.
  if (h > 6) {
    const fang = 3.5 + m.fright * 3;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    for (const side of [-1, 1]) {
      const x = side * w * 0.5;
      const y = lerp(top, corner, 0.5) + 0.5;
      ctx.moveTo(x - 2.2, y - 1);
      ctx.lineTo(x + 2.2, y - 1);
      ctx.lineTo(x, y + fang);
      ctx.closePath();
    }
    ctx.fill();
  }
  ctx.restore();
  shape();
  ctx.strokeStyle = k.ink;
  ctx.lineWidth = 2;
  ctx.stroke();
}

/** Yawn: a big pink "O" with a curled tongue and four little fangs. */
function drawYawn(ctx: CanvasRenderingContext2D, k: Kit, my: number, round: number): void {
  const w = 5 + round * 8;
  const h = 5 + round * 15;
  const cy = my + h * 0.55;
  const shape = () => {
    ctx.beginPath();
    ctx.ellipse(0, cy, w, h * 0.62, 0, 0, TAU);
  };
  shape();
  ctx.fillStyle = k.mouthInner;
  ctx.fill();
  ctx.save();
  shape();
  ctx.clip();
  ctx.fillStyle = k.tongue;
  ctx.beginPath();
  ctx.ellipse(0, cy + h * 0.42, w * 0.75, h * 0.3, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  const top = cy - h * 0.62;
  const bottom = cy + h * 0.62;
  const fang = 2.5 + round * 2;
  for (const side of [-1, 1]) {
    const x = side * w * 0.5;
    ctx.moveTo(x - 2, top);
    ctx.lineTo(x + 2, top);
    ctx.lineTo(x, top + fang + 1);
    ctx.closePath();
    ctx.moveTo(x - 1.8, bottom);
    ctx.lineTo(x + 1.8, bottom);
    ctx.lineTo(x, bottom - fang);
    ctx.closePath();
  }
  ctx.fill();
  ctx.restore();
  shape();
  ctx.strokeStyle = k.ink;
  ctx.lineWidth = 2;
  ctx.stroke();
}

/**
 * Whiskers fan up and forward when happy or curious, droop when sad or sleepy, and pull back
 * tight (trembling) when frightened or cross. Every now and then they twitch.
 */
function drawWhiskers(
  ctx: CanvasRenderingContext2D,
  k: Kit,
  pose: CreaturePose,
  m: Moods,
  twitchAmt: number,
): void {
  const f = pose.face;
  const tense = Math.max(m.fright, m.anger * 0.7);
  const tilt = -0.12 * m.joy + 0.3 * f.droop + 0.22 * tense - 0.08 * f.browAsym;
  const spread = 1 + 0.25 * m.joy + 0.3 * f.browAsym - 0.45 * tense;
  const length = 34 * (1 - 0.18 * tense + 0.06 * m.joy);
  const tremble = m.fright * Math.sin(pose.time * 38) * 0.05;
  ctx.save();
  ctx.strokeStyle = k.whisker;
  ctx.globalAlpha *= 0.85;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (const side of [-1, 1]) {
    [-0.2, 0.03, 0.25].forEach((base, i) => {
      const a = base * spread + tilt + tremble - twitchAmt * 0.12 * (i === 0 ? 1.4 : 1);
      const x0 = side * (16 + (i === 1 ? 2 : 0));
      const y0 = -113 + i * 4;
      const L = length * (i === 1 ? 1.06 : 1);
      const x1 = x0 + side * Math.cos(a) * L;
      const y1 = y0 + Math.sin(a) * L;
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo(
        lerp(x0, x1, 0.55),
        lerp(y0, y1, 0.55) - 2.5 + f.droop * 3,
        x1,
        y1 + 1.5 + f.droop * 3,
      );
    });
  }
  ctx.stroke();
  ctx.restore();
}
