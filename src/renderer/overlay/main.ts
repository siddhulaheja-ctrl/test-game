import { Loop } from '../../core/loop';
import { DEFAULT_APP_STATE, type AppState, type CursorPoint } from '../../shared/ipc';
import { DebugOverlay } from '../../ui/debugOverlay';
import { InteractivityTracker } from '../../ui/interactivity';
import { Creature } from '../../creature/creature';
import { drawCreature } from '../../creature/render/drawCreature';

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

// --- Creature ---------------------------------------------------------------------------------
const creature = new Creature({ seed: (Date.now() & 0xffff) + 1 });
const placeCreature = () => {
  creature.x = width - 140;
  creature.y = height - 4;
};
placeCreature();
creature.settle();
window.addEventListener('resize', placeCreature);

function update(dt: number): void {
  creature.update(dt);
  // Keep full frame rate while anything visible is moving; drop to idle fps otherwise.
  if (creature.activity() > 0.05) loop.markActive();
}

function render(): void {
  ctx.clearRect(0, 0, width, height);
  drawCreature(ctx, creature);
  debug.render(loop.fps, loop.isIdle);
}

const loop = new Loop({ update, render });
const debug = new DebugOverlay(document.body);

// --- Click-through ------------------------------------------------------------------------------
const interactivity = new InteractivityTracker((on) => bridge?.setInteractive(on));
const refreshInteractivity = () => interactivity.update(cursor, creature.hitShape());

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
window.addEventListener('mousedown', (e) => {
  if (!interactivity.isInteractive) return;
  creature.poke(e.clientX, e.clientY);
  creature.emit('sparkle', 3);
});

// --- App state ----------------------------------------------------------------------------------
function applyAppState(s: AppState): void {
  appState = s;
  debug.visible = s.debugOverlay;
  creature.alpha = s.quietMode ? 0.55 : 1;
  creature.anim.calm = s.quietMode;
  creature.particles.enabled = !s.quietMode;
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
  petCenter: () => {
    const p = creature.getPose();
    return { x: p.feet.x, y: p.feet.y + p.center.y * p.sy };
  },
  creature,
  isInteractive: () => interactivity.isInteractive,
};
