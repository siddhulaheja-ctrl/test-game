import { Loop } from '../../core/loop';
import type { Vec2 } from '../../core/math';
import { Rng } from '../../core/random';
import { Trip } from '../../behaviors/library';
import { PetStage } from '../../ui/petStage';
import { bottom, containsPoint, right, type Rect } from '../../world/geometry';
import type { DisplayInfo, WindowInfo } from '../../world/world';

/**
 * A simulated desktop for developing and testing Stage 2 without a real one: two monitors at
 * different heights, draggable fake windows, a safe zone, and both characters. Drag windows by
 * their title bars, close them with the ×, and pick up, poke and throw the pets.
 */

const params = new URLSearchParams(location.search);
const testMode = params.has('test');
const rng = new Rng(Number(params.get('seed') ?? 11));
if (testMode) document.body.classList.add('test-mode');

const DISPLAYS: DisplayInfo[] = [
  {
    id: 1,
    primary: true,
    bounds: { x: 0, y: 0, width: 1440, height: 900 },
    workArea: { x: 0, y: 0, width: 1440, height: 852 },
  },
  {
    id: 2,
    bounds: { x: 1440, y: 60, width: 1280, height: 1024 },
    workArea: { x: 1440, y: 60, width: 1280, height: 984 },
  },
];
const TITLE = 30;
const NOTIFY_CORNER: Rect = { x: 1440 - 380, y: 852 - 200, width: 380, height: 200 };

interface FakeWindow extends WindowInfo {
  color: string;
  title: string;
}

const COLORS = ['#3d6fd6', '#d6643d', '#3da86b', '#8a4fd6', '#c9a227', '#d63d7a'];
let windowSeq = 0;
const makeWindow = (x: number, y: number, width: number, height: number): FakeWindow => ({
  id: `w${++windowSeq}`,
  bounds: { x, y, width, height },
  color: COLORS[windowSeq % COLORS.length]!,
  title: ['Notes', 'Browser', 'Music', 'Files', 'Mail', 'Terminal'][windowSeq % 6]!,
});

/** Top-most first, like a real window list. */
let windows: FakeWindow[] = [
  makeWindow(180, 430, 520, 330),
  makeWindow(620, 250, 460, 470),
  makeWindow(1650, 520, 560, 380),
];
let safeZones: Rect[] = [NOTIFY_CORNER];

const stage = new PetStage();
const rebuild = () => stage.setWorld({ displays: DISPLAYS, windows, safeZones });
rebuild();
stage.addPet('cat', { species: 'cat' }, { x: 300, y: 852 }, 101);
stage.addPet('pekka', { species: 'pekka' }, { x: 1000, y: 852 }, 202);

// --- View -----------------------------------------------------------------------------------------
const canvas = document.getElementById('stage') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const wrap = document.getElementById('wrap')!;
const desk = { x: 0, y: 0, width: 2720, height: 1084 };
let scale = 1;
let pad = { x: 0, y: 0 };
let showDebug = !testMode;

function layout(): void {
  const dpr = window.devicePixelRatio || 1;
  const w = wrap.clientWidth;
  const h = wrap.clientHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  scale = Math.min((w - 20) / desk.width, (h - 20) / desk.height);
  pad = { x: (w - desk.width * scale) / 2, y: (h - desk.height * scale) / 2 };
}
layout();
window.addEventListener('resize', layout);

const toDesk = (e: MouseEvent): Vec2 => {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left - pad.x) / scale, y: (e.clientY - r.top - pad.y) / scale };
};

function render(): void {
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * pad.x, dpr * pad.y);

  for (const d of DISPLAYS) drawDisplay(d);
  for (const w of [...windows].reverse()) drawWindow(w);
  for (const z of safeZones) drawZone(z);
  if (showDebug) drawDebug();
  // Pets only show on a monitor, like on a real desktop.
  ctx.save();
  ctx.beginPath();
  for (const d of DISPLAYS) ctx.rect(d.bounds.x, d.bounds.y, d.bounds.width, d.bounds.height);
  ctx.clip();
  stage.draw(ctx);
  ctx.restore();
  if (showDebug) drawLabels();
  status();
}

function drawDisplay(d: DisplayInfo): void {
  const b = d.bounds;
  const g = ctx.createLinearGradient(b.x, b.y, right(b), bottom(b));
  g.addColorStop(0, d.id === 1 ? '#2b5876' : '#42275a');
  g.addColorStop(1, d.id === 1 ? '#4e4376' : '#734b6d');
  ctx.fillStyle = g;
  ctx.fillRect(b.x, b.y, b.width, b.height);
  // Taskbar.
  const wa = d.workArea;
  ctx.fillStyle = 'rgba(20, 20, 28, 0.92)';
  ctx.fillRect(b.x, bottom(wa), b.width, bottom(b) - bottom(wa));
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = '16px Segoe UI, system-ui, sans-serif';
  ctx.fillText('12:34', right(b) - 70, bottom(b) - 16);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 2;
  ctx.strokeRect(b.x + 1, b.y + 1, b.width - 2, b.height - 2);
}

function drawWindow(w: FakeWindow): void {
  const b = w.bounds;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(b.x + 6, b.y + 8, b.width, b.height);
  ctx.fillStyle = '#f4f3f8';
  ctx.fillRect(b.x, b.y, b.width, b.height);
  ctx.fillStyle = w.color;
  ctx.fillRect(b.x, b.y, b.width, TITLE);
  ctx.fillStyle = '#fff';
  ctx.font = '600 15px Segoe UI, system-ui, sans-serif';
  ctx.fillText(w.title, b.x + 12, b.y + 20);
  ctx.fillText('×', right(b) - 22, b.y + 21);
  ctx.fillStyle = '#d9d7e3';
  for (let i = 0; i < 6; i++) {
    const lw = (b.width - 40) * (0.5 + 0.5 * Math.abs(Math.sin(i * 1.7 + b.width)));
    ctx.fillRect(b.x + 20, b.y + TITLE + 22 + i * 26, lw, 10);
  }
}

function drawZone(z: Rect): void {
  ctx.save();
  ctx.fillStyle = 'rgba(255, 200, 60, 0.12)';
  ctx.fillRect(z.x, z.y, z.width, z.height);
  ctx.setLineDash([8, 6]);
  ctx.strokeStyle = 'rgba(255, 200, 60, 0.7)';
  ctx.lineWidth = 2;
  ctx.strokeRect(z.x, z.y, z.width, z.height);
  ctx.fillStyle = 'rgba(255, 220, 120, 0.9)';
  ctx.font = '14px Segoe UI, system-ui, sans-serif';
  ctx.fillText('safe zone', z.x + 10, z.y + 22);
  ctx.restore();
}

function drawDebug(): void {
  ctx.save();
  ctx.lineWidth = 3;
  for (const s of stage.world.surfaces) {
    ctx.strokeStyle = 'rgba(120, 255, 170, 0.85)';
    ctx.beginPath();
    ctx.moveTo(s.x1, s.y);
    ctx.lineTo(s.x2, s.y);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 90, 90, 0.9)';
    for (const [a, b] of s.avoid) {
      ctx.beginPath();
      ctx.moveTo(a, s.y);
      ctx.lineTo(b, s.y);
      ctx.stroke();
    }
  }
  ctx.strokeStyle = 'rgba(255, 170, 60, 0.8)';
  for (const w of stage.world.walls) {
    ctx.beginPath();
    ctx.moveTo(w.x, w.y1);
    ctx.lineTo(w.x, w.y2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawLabels(): void {
  ctx.save();
  ctx.font = '600 14px Segoe UI, system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (const p of stage.pets) {
    const x = p.mover.x;
    const y = p.mover.y - p.mover.size.height - 34;
    const text = `${p.state} · ${p.brain.current?.name ?? ''}`;
    const w = ctx.measureText(text).width + 12;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x - w / 2, y - 15, w, 20);
    ctx.fillStyle = '#fff';
    ctx.fillText(text, x, y);
  }
  ctx.restore();
}

// --- Simulation -----------------------------------------------------------------------------------
let speed = 1;
const loop = new Loop({
  update: (dt) => {
    for (let i = 0; i < speed; i++) stage.update(dt);
  },
  render,
});

// --- Input ----------------------------------------------------------------------------------------
let windowDrag: { w: FakeWindow; dx: number; dy: number } | null = null;

const windowAt = (p: Vec2) => windows.find((w) => containsPoint(w.bounds, p.x, p.y));

canvas.addEventListener('mousedown', (e) => {
  const p = toDesk(e);
  if (stage.pointerDown(p)) return;
  const w = windowAt(p);
  if (!w) return;
  if (p.y < w.bounds.y + TITLE && p.x > right(w.bounds) - 34) {
    closeWindow(w.id);
    return;
  }
  // Clicking a window raises it; the title bar drags it.
  windows = [w, ...windows.filter((q) => q !== w)];
  if (p.y < w.bounds.y + TITLE) windowDrag = { w, dx: p.x - w.bounds.x, dy: p.y - w.bounds.y };
  rebuild();
});
window.addEventListener('mousemove', (e) => {
  const p = toDesk(e);
  stage.pointerMove(p);
  if (windowDrag) moveWindow(windowDrag.w.id, p.x - windowDrag.dx, p.y - windowDrag.dy);
});
window.addEventListener('mouseup', (e) => {
  stage.pointerUp(toDesk(e));
  windowDrag = null;
});

function moveWindow(id: string, x: number, y: number): void {
  windows = windows.map((w) =>
    w.id === id ? { ...w, bounds: { ...w.bounds, x: Math.round(x), y: Math.round(y) } } : w,
  );
  rebuild();
}

function closeWindow(id: string): void {
  windows = windows.filter((w) => w.id !== id);
  rebuild();
}

function newWindow(): void {
  const d = rng.pick(DISPLAYS).workArea;
  const width = rng.range(320, 620);
  const height = rng.range(220, 460);
  windows = [
    makeWindow(
      rng.range(d.x, right(d) - width),
      rng.range(d.y + 80, bottom(d) - height),
      width,
      height,
    ),
    ...windows,
  ];
  rebuild();
}

// --- Toolbar --------------------------------------------------------------------------------------
const bar = document.getElementById('bar')!;
const button = (label: string, fn: () => void) => {
  const b = document.createElement('button');
  b.textContent = label;
  b.addEventListener('click', fn);
  bar.append(b);
};
const toggle = (label: string, on: boolean, fn: (on: boolean) => void) => {
  const l = document.createElement('label');
  const i = document.createElement('input');
  i.type = 'checkbox';
  i.checked = on;
  i.addEventListener('change', () => fn(i.checked));
  l.append(i, label);
  bar.append(l);
};
button('New window', newWindow);
button('Close top window', () => windows[0] && closeWindow(windows[0].id));
button('Shuffle windows', () => {
  for (const w of windows) {
    const d = rng.pick(DISPLAYS).workArea;
    moveWindow(
      w.id,
      rng.range(d.x, right(d) - w.bounds.width),
      rng.range(d.y + 80, bottom(d) - w.bounds.height),
    );
  }
});
toggle('Quiet Mode', false, (on) => (stage.quiet = on));
toggle('Notification safe zone', true, (on) => {
  safeZones = on ? [NOTIFY_CORNER] : [];
  rebuild();
});
toggle('Show surfaces', showDebug, (on) => (showDebug = on));
toggle('4× speed', false, (on) => (speed = on ? 4 : 1));
for (const [id, species] of [
  ['cat', 'cat'],
  ['pekka', 'pekka'],
] as const) {
  toggle(species === 'cat' ? 'Black Cat' : 'P.E.K.K.A', true, (on) => {
    if (on) stage.addPet(id, { species }, { x: 700, y: 852 });
    else stage.removePet(id);
  });
}
const statusEl = document.createElement('span');
statusEl.id = 'status';
bar.append(statusEl);
function status(): void {
  statusEl.textContent = `${loop.fps.toFixed(0)} fps · ${stage.pets
    .map((p) => `${p.id}: ${p.state}`)
    .join(' · ')}`;
}

if (!testMode) loop.start();
else render();

// --- Test API -------------------------------------------------------------------------------------
const api = {
  ready: true,
  stage,
  /** Advance the simulation deterministically (60 Hz steps), then draw. */
  step(seconds: number): void {
    loop.advance(seconds);
  },
  render,
  setWindows(list: { x: number; y: number; width: number; height: number }[]): void {
    windows = list.map((r) => makeWindow(r.x, r.y, r.width, r.height));
    rebuild();
  },
  moveWindow,
  closeWindow,
  windows: () => windows.map((w) => ({ id: w.id, bounds: { ...w.bounds } })),
  /** Place a pet on the surface at (or below) a desktop point. */
  place(id: string, x: number, y: number): void {
    const pet = stage.pet(id);
    if (!pet) return;
    pet.mover.place(stage.world, x, y);
    pet.brain.interrupt(pet);
  },
  cursor: (x: number, y: number) => stage.pointerMove({ x, y }),
  down: (x: number, y: number) => stage.pointerDown({ x, y }),
  up: (x: number, y: number) => stage.pointerUp({ x, y }),
  /** Send a pet on a trip to the surface at (or below) a desktop point. */
  goTo(id: string, x: number, y: number): boolean {
    const pet = stage.pet(id);
    const s = stage.world.surfaceAt(x, y, 2) ?? stage.world.landingBetween(x, y, Infinity);
    if (!pet || !s) return false;
    pet.brain.interrupt(pet, new Trip({ surface: s, x }, { name: 'goTo' }));
    return true;
  },
  setDebug(on: boolean): void {
    showDebug = on;
  },
};
(window as unknown as { playground: typeof api }).playground = api;
