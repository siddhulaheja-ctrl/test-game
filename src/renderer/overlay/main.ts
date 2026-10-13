import { Loop } from '../../core/loop';
import { DEFAULT_APP_STATE, type AppState, type CursorPoint } from '../../shared/ipc';
import { DebugOverlay } from '../../ui/debugOverlay';
import { InteractivityTracker, ellipseHit } from '../../ui/interactivity';

const canvas = document.getElementById('stage') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const bridge = window.glorp;

let appState: AppState = { ...DEFAULT_APP_STATE };
let cursor: CursorPoint | null = null;
let width = 0;
let height = 0;

function resize(): void {
  const dpr = window.devicePixelRatio || 1;
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
resize();
window.addEventListener('resize', resize);

// --- Stage 0 placeholder creature ---------------------------------------------------------------
const pet = { x: 0, y: 0, r: 44, t: 0, squash: 0 };
const placePet = () => {
  pet.x = width - 140;
  pet.y = height - 8;
};
placePet();
window.addEventListener('resize', placePet);

function update(dt: number): void {
  pet.t += dt;
  pet.squash *= Math.pow(0.02, dt);
  loop.markActive();
}

function drawPlaceholder(): void {
  const breathe = Math.sin(pet.t * 2.2) * 0.03 + pet.squash;
  const rx = pet.r * (1 + breathe * 0.6);
  const ry = pet.r * 0.86 * (1 - breathe);
  const cy = pet.y - ry;
  ctx.globalAlpha = appState.quietMode ? 0.45 : 1;
  ctx.beginPath();
  ctx.ellipse(pet.x, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#8ce0be';
  ctx.fill();
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = '#2e544a';
  ctx.stroke();
  ctx.fillStyle = '#222834';
  for (const dx of [-14, 14]) {
    ctx.beginPath();
    ctx.ellipse(pet.x + dx, cy - 4, 5, 8, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function render(): void {
  ctx.clearRect(0, 0, width, height);
  drawPlaceholder();
  debug.render(loop.fps, loop.isIdle);
}

const loop = new Loop({ update, render });
const debug = new DebugOverlay(document.body);

// --- Click-through ------------------------------------------------------------------------------
const interactivity = new InteractivityTracker((on) => bridge?.setInteractive(on));
const petHitShape = () => ellipseHit(pet.x, pet.y - pet.r * 0.86, pet.r, pet.r * 0.86);
const refreshInteractivity = () => interactivity.update(cursor, petHitShape());

// Set by the e2e test hook so the real cursor can't race the simulated one.
let simulatedCursor = false;
window.addEventListener('mousemove', (e) => {
  if (simulatedCursor) return;
  cursor = { x: e.clientX, y: e.clientY };
  refreshInteractivity();
});
bridge?.onCursor((p) => {
  if (simulatedCursor) return;
  cursor = p;
  refreshInteractivity();
});
window.addEventListener('mousedown', () => {
  if (interactivity.isInteractive) pet.squash = 0.18;
});

// --- App state ----------------------------------------------------------------------------------
function applyAppState(s: AppState): void {
  appState = s;
  debug.visible = s.debugOverlay;
  if (s.visible) loop.start();
  else {
    loop.pause();
    interactivity.reset();
  }
}
bridge?.onAppState(applyAppState);
bridge?.onMetrics((m) => debug.setMetrics(m));
void (bridge ? bridge.getAppState() : Promise.resolve(appState)).then(applyAppState);

// Test hook: simulate the cursor without moving the real one.
(window as unknown as { __overlay: unknown }).__overlay = {
  simulateCursor(x: number, y: number) {
    simulatedCursor = true;
    cursor = { x, y };
    refreshInteractivity();
  },
  petCenter: () => ({ x: pet.x, y: pet.y - pet.r * 0.86 }),
  isInteractive: () => interactivity.isInteractive,
};
