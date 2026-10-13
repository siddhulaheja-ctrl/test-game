import { Loop } from '../../core/loop';
import { normalizeAppearance, type Appearance } from '../../creature/appearance';
import { Creature, STILL, type Motion } from '../../creature/creature';
import { listSpecies } from '../../creature/species';
import {
  EXPRESSION_NAMES,
  FACE_KEYS,
  FACE_RANGES,
  type Expression,
  type ExpressionWeights,
  type FaceParams,
} from '../../creature/face';
import { FIDGETS, type FidgetKind } from '../../creature/idleAnimator';
import { PARTICLE_KINDS, type ParticleKind } from '../../creature/particles';
import { drawCreature } from '../../creature/render/drawCreature';
import { buttons, checkbox, el, section, select, slider, store } from './controls';

type Background = 'checker' | 'light' | 'dark' | 'desktop';

interface LabState {
  appearance: Appearance;
  weights: ExpressionWeights;
  manual: boolean;
  manualFace: Partial<FaceParams>;
  background: Background;
  zoom: number;
  idle: boolean;
  followMouse: boolean;
  slowMo: boolean;
}

const params = new URLSearchParams(location.search);
const testMode = params.has('test');
const STORAGE_KEY = 'buddy.lab.v1';

const defaults: LabState = {
  appearance: normalizeAppearance({}),
  weights: { neutral: 1 },
  manual: false,
  manualFace: {},
  background: 'checker',
  zoom: 2,
  idle: true,
  followMouse: false,
  slowMo: false,
};
const state: LabState = testMode
  ? { ...defaults, background: 'light', zoom: Number(params.get('zoom') ?? 1.5), idle: false }
  : { ...defaults, ...store.get<Partial<LabState>>(STORAGE_KEY, {}) };
state.appearance = normalizeAppearance(state.appearance);
const save = () => {
  if (!testMode) store.set(STORAGE_KEY, state);
};

if (testMode) document.body.classList.add('test-mode');

// --- Stage --------------------------------------------------------------------------------------
const wrap = document.getElementById('stage-wrap')!;
const canvas = document.getElementById('stage') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
let cssW = 0;
let cssH = 0;

const creature = new Creature({
  seed: Number(params.get('seed') ?? 7),
  appearance: state.appearance,
});

function layout(): void {
  const dpr = window.devicePixelRatio || 1;
  cssW = wrap.clientWidth;
  cssH = wrap.clientHeight;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  creature.x = cssW / 2 / state.zoom;
  creature.y = (cssH * 0.8) / state.zoom;
}

function applyState(): void {
  wrap.className = `bg-${state.background}`;
  creature.setAppearance(state.appearance);
  creature.setMood(state.weights);
  creature.manualFace = state.manual ? { ...state.manualFace } : null;
  creature.anim.enabled = state.idle;
  layout();
}

function render(): void {
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(dpr * state.zoom, 0, 0, dpr * state.zoom, 0, 0);
  drawCreature(ctx, creature);
}

let speed = state.slowMo ? 0.25 : 1;
const loop = new Loop({
  update: (dt) => creature.update(dt * speed),
  render: () => {
    render();
    updateStatus();
  },
});

// --- Interaction --------------------------------------------------------------------------------
const toWorld = (e: MouseEvent) => {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) / state.zoom, y: (e.clientY - r.top) / state.zoom };
};
canvas.addEventListener('mousedown', (e) => {
  const p = toWorld(e);
  if (creature.hitShape().distanceOutside(p.x, p.y) <= 4) {
    creature.poke(p.x, p.y);
    creature.emit('sparkle', 3);
  }
});
canvas.addEventListener('mousemove', (e) => {
  if (state.followMouse) creature.lookAt(toWorld(e));
});
canvas.addEventListener('mouseleave', () => {
  if (state.followMouse) creature.lookAt(null);
});
window.addEventListener('resize', layout);

// --- Controls -----------------------------------------------------------------------------------
const controls = document.getElementById('controls')!;

function buildControls(): void {
  // Character and appearance
  const ap = section(controls, 'Character & appearance');
  select(
    ap,
    'Character',
    listSpecies().map((sp) => ({ value: sp.id, label: sp.name })),
    state.appearance.species,
    (v) => {
      setAppearance({ species: v });
      buildAppearance();
    },
  );
  const tagline = el('div', { className: 'hint' });
  ap.append(tagline);
  const apBody = el('div');
  ap.append(apBody);
  function buildAppearance(): void {
    apBody.textContent = '';
    const sp = creature.species;
    tagline.textContent = sp.tagline;
    select(
      apBody,
      'Palette',
      Object.values(sp.palettes).map((p) => ({ value: p.id, label: p.name })),
      state.appearance.palette,
      (v) => setAppearance({ palette: v }),
    );
    slider(apBody, 'Size', { min: 0.6, max: 2, step: 0.05, value: state.appearance.size }, (v) =>
      setAppearance({ size: v }),
    );
  }
  buildAppearance();

  // Expressions
  const ex = section(controls, 'Expressions');
  const exprButtons = buttons(
    ex,
    EXPRESSION_NAMES.map((name) => ({
      label: name,
      id: name,
      onClick: (e: MouseEvent) => {
        if (e.shiftKey) creature.express(name, 1, 1.8);
        else setWeights({ [name]: 1 });
      },
    })),
  );
  ex.append(el('div', { className: 'hint', textContent: 'Mix (blend any combination)' }));
  const mixSliders = new Map<Expression, ReturnType<typeof slider>>();
  for (const name of EXPRESSION_NAMES) {
    mixSliders.set(
      name,
      slider(ex, name, { min: 0, max: 1, value: state.weights[name] ?? 0 }, (v) => {
        setWeights({ ...state.weights, [name]: v }, false);
      }),
    );
  }
  function setWeights(w: ExpressionWeights, syncSliders = true): void {
    state.weights = w;
    creature.setMood(w);
    save();
    if (syncSliders) for (const [n, s] of mixSliders) s.set(w[n] ?? 0);
    for (const b of exprButtons)
      b.classList.toggle('active', (w[b.dataset.id as Expression] ?? 0) >= 0.999);
  }
  setWeights(state.weights);

  // Face parameters
  const fp = section(controls, 'Face parameters', false);
  checkbox(fp, 'Override blended face with these values', state.manual, (on) => {
    state.manual = on;
    creature.manualFace = on ? { ...state.manualFace } : null;
    save();
  });
  const current = creature.mixer.face();
  for (const key of FACE_KEYS) {
    const [min, max] = FACE_RANGES[key];
    slider(fp, key, { min, max, value: state.manualFace[key] ?? current[key] }, (v) => {
      state.manualFace[key] = v;
      if (state.manual) creature.manualFace = { ...state.manualFace };
      save();
    });
  }

  // Animations
  const an = section(controls, 'Animations');
  buttons(an, [
    { label: 'Blink', onClick: () => creature.blink() },
    { label: 'Double blink', onClick: () => creature.blink(true) },
    { label: 'Yawn', onClick: () => creature.yawn() },
    { label: 'Hop', onClick: () => creature.hop(1) },
    { label: 'Big hop', onClick: () => creature.hop(1.6) },
    { label: 'Poke', onClick: () => creature.poke(creature.x + 20, creature.y - creature.R) },
    { label: 'Squash', onClick: () => creature.squash(0.25) },
    { label: 'Stretch', onClick: () => creature.squash(-0.25) },
  ]);
  an.append(el('div', { className: 'hint', textContent: 'Fidgets' }));
  buttons(
    an,
    FIDGETS.map((f: FidgetKind) => ({ label: f, onClick: () => creature.fidget(f) })),
  );
  an.append(el('div', { className: 'hint', textContent: 'Look' }));
  buttons(an, [
    { label: '← left', onClick: () => creature.anim.setFocus({ x: -1, y: 0 }) },
    { label: '↑ up', onClick: () => creature.anim.setFocus({ x: 0, y: -1 }) },
    { label: '→ right', onClick: () => creature.anim.setFocus({ x: 1, y: 0 }) },
    { label: '↓ down', onClick: () => creature.anim.setFocus({ x: 0, y: 1 }) },
    { label: 'release', onClick: () => creature.anim.setFocus(null) },
  ]);
  const checks2 = el('div', { className: 'checks' });
  an.append(checks2);
  checkbox(checks2, 'Follow mouse', state.followMouse, (on) => {
    state.followMouse = on;
    if (!on) creature.lookAt(null);
    save();
  });
  checkbox(checks2, 'Idle animations', state.idle, (on) => {
    state.idle = on;
    creature.anim.enabled = on;
    save();
  });

  // Particles
  const pa = section(controls, 'Particles');
  buttons(
    pa,
    PARTICLE_KINDS.map((k: ParticleKind) => ({
      label: k,
      onClick: () => creature.emit(k, k === 'zzz' ? 3 : k === 'dust' ? 6 : 5),
    })),
  );

  // Stage
  const st = section(controls, 'Stage');
  select(
    st,
    'Background',
    [
      { value: 'checker', label: 'Transparent (checker)' },
      { value: 'light', label: 'Light' },
      { value: 'dark', label: 'Dark' },
      { value: 'desktop', label: 'Desktop wallpaper' },
    ] as const,
    state.background,
    (v) => {
      state.background = v;
      wrap.className = `bg-${v}`;
      save();
    },
  );
  slider(st, 'Zoom', { min: 1, max: 4, step: 0.25, value: state.zoom }, (v) => {
    state.zoom = v;
    layout();
    save();
  });
  const sim = el('div', { className: 'checks' });
  st.append(sim);
  checkbox(sim, 'Slow motion (¼×)', state.slowMo, (on) => {
    state.slowMo = on;
    speed = on ? 0.25 : 1;
    save();
  });
  buttons(st, [
    {
      label: 'Pause / play',
      onClick: () => (loop.running ? loop.pause() : loop.start()),
    },
    { label: 'Step 1/60 s', onClick: () => loop.advance(1 / 60) },
    { label: 'Settle', onClick: () => creature.settle() },
    {
      label: 'Reset lab',
      onClick: () => {
        store.set(STORAGE_KEY, {});
        location.reload();
      },
    },
  ]);
}

function setAppearance(patch: Partial<Appearance>): void {
  state.appearance = normalizeAppearance({ ...state.appearance, ...patch });
  creature.setAppearance(state.appearance);
  layout();
  save();
}

const status = document.getElementById('status')!;
let lastStatus = 0;
function updateStatus(): void {
  const now = performance.now();
  if (now - lastStatus < 250) return;
  lastStatus = now;
  status.textContent = '';
  const items = [
    `fps ${loop.fps.toFixed(0)}`,
    `mood ${creature.mixer.dominant()}`,
    `reaction ${creature.mixer.activeReaction ?? '–'}`,
    `fidget ${creature.anim.currentFidget ?? '–'}`,
    `particles ${creature.particles.count}`,
  ];
  for (const t of items) status.append(el('span', { textContent: t }));
}

// --- Boot ---------------------------------------------------------------------------------------
applyState();
if (!testMode) {
  buildControls();
  creature.settle();
  loop.start();
} else {
  creature.settle();
  render();
}

/** Programmatic API for screenshot tests and the console. */
const api = {
  creature,
  ready: true,
  /** Show a fixed pose: appearance, expression mix, optional face overrides; no animation. */
  show(opts: {
    appearance?: Partial<Appearance>;
    expression?: Expression;
    weights?: ExpressionWeights;
    face?: Partial<FaceParams>;
    look?: { x: number; y: number };
    /** Movement pose (walking, climbing, carried, asleep…). */
    motion?: Partial<Motion>;
  }): void {
    if (opts.appearance) setAppearance(opts.appearance);
    creature.motion = { ...STILL, ...opts.motion };
    creature.setMood(opts.weights ?? { [opts.expression ?? 'neutral']: 1 });
    creature.manualFace = opts.face ?? null;
    creature.reset();
    if (opts.look) {
      creature.anim.setFocus(opts.look);
      creature.anim.layer.lookX = opts.look.x;
      creature.anim.layer.lookY = opts.look.y;
      creature.settle();
    }
    render();
  },
  /** Advance the simulation deterministically, then draw. */
  step(seconds: number): void {
    loop.advance(seconds);
  },
  render,
};
(window as unknown as { lab: typeof api }).lab = api;
