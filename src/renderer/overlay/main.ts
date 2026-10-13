import { Idle, Trip } from '../../behaviors/library';
import { Loop } from '../../core/loop';
import type { Vec2 } from '../../core/math';
import { DEFAULT_APP_STATE, type AppState, type DisplayFlags } from '../../shared/ipc';
import { DebugOverlay } from '../../ui/debugOverlay';
import { InteractivityTracker } from '../../ui/interactivity';
import { PetStage } from '../../ui/petStage';

/**
 * One overlay window per display. Each runs a PetStage for the pets currently on its display;
 * pets that walk (or are thrown) onto another display are handed over through main.
 */

const canvas = document.getElementById('stage') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const bridge = window.buddy;

let appState: AppState = { ...DEFAULT_APP_STATE };
let flags: DisplayFlags = { fullscreen: [] };
let width = 0;
let height = 0;

const stage = new PetStage({
  onHandoff: (snap, toDisplay) => bridge?.sendHandoff({ snap, toDisplay }),
});

function resize(): void {
  const dpr = window.devicePixelRatio || 1;
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
}
resize();
window.addEventListener('resize', resize);

/** Desktop point ↔ this window. */
const toDesk = (x: number, y: number): Vec2 => ({ x: x + stage.origin.x, y: y + stage.origin.y });

// --- Pets ---------------------------------------------------------------------------------------
function applyQuiet(): void {
  const fullscreenHere = stage.displayId !== null && flags.fullscreen.includes(stage.displayId);
  stage.quiet = appState.quietMode || (fullscreenHere && appState.fullscreenMode === 'quiet');
  for (const p of stage.pets) {
    p.creature.alpha = stage.quiet ? 0.55 : 1;
    p.creature.anim.calm = stage.quiet;
    p.creature.particles.enabled = !stage.quiet;
  }
}

function spawn(id: string, species: string): void {
  if (stage.pet(id)) return;
  // New pets start on this display's floor, spread out so they don't overlap.
  const x = stage.origin.x + width * (0.72 - 0.16 * stage.pets.length);
  stage.addPet(
    id,
    { species },
    { x, y: stage.origin.y + height },
    (Date.now() & 0xffff) + id.length,
  );
  applyQuiet();
}

let watchedKey = '';
let watchTimer = 0;
/** Tell main which windows our pets stand on or cling to, so it polls those faster. */
function reportWatched(dt: number): void {
  watchTimer -= dt;
  if (watchTimer > 0) return;
  watchTimer = 0.3;
  const ids = new Set<string>();
  for (const p of stage.pets) {
    const c = p.mover.contact;
    if (c.kind === 'surface' && c.surface.windowId) ids.add(c.surface.windowId);
    if (c.kind === 'wall') ids.add(c.wall.windowId);
  }
  const key = [...ids].sort().join(',');
  if (key !== watchedKey) {
    watchedKey = key;
    bridge?.watchWindows([...ids]);
  }
}

// --- Loop ---------------------------------------------------------------------------------------
function update(dt: number): void {
  stage.update(dt);
  resend -= dt;
  if (resend <= 0) {
    resend = 0.5;
    bridge?.setInteractive(interactivity.isInteractive);
  }
  if (debug.visible) {
    debug.set(
      'ptr',
      `${interactivity.isInteractive ? 'over a pet' : 'click-through'}, press: ${lastPress}`,
    );
    debug.set('pets', stage.pets.map((p) => `${p.id} ${p.state}`).join(', ') || 'none');
  }
  reportWatched(dt);
  if (stage.activity() > 0.05) loop.markActive();
  refreshInteractivity();
}

function render(): void {
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  stage.draw(ctx);
  debug.render(loop.fps, loop.isIdle);
}

const loop = new Loop({ update, render });
const debug = new DebugOverlay(document.body);

// --- Click-through, poke, drag and throw ---------------------------------------------------------
const interactivity = new InteractivityTracker((on) => bridge?.setInteractive(on));
/** Cursor in this window's coordinates. */
let cursor: Vec2 | null = null;
// Set by the e2e test hook so the real cursor can't race the simulated one.
let simulatedCursor = false;

function refreshInteractivity(): void {
  interactivity.hold = stage.isDragging;
  interactivity.update(cursor, stage.hitShape());
}

function cursorAt(local: Vec2): void {
  cursor = local;
  stage.pointerMove(toDesk(local.x, local.y));
  refreshInteractivity();
}

/** While this window gets its own mouse events they are fresher than main's 30 Hz poll. */
let lastLocalMove = -Infinity;
window.addEventListener('mousemove', (e) => {
  if (simulatedCursor) return;
  lastLocalMove = performance.now();
  cursorAt({ x: e.clientX, y: e.clientY });
});
bridge?.onCursor((p) => {
  if (simulatedCursor) return;
  // Windows reports the button globally: a release anywhere ends a drag, even if the mouseup
  // event never reached this window.
  if (p.leftDown === false && stage.isDragging) stage.pointerUp({ x: p.x, y: p.y });
  if (performance.now() - lastLocalMove < 250) return;
  cursorAt({ x: p.x - stage.origin.x, y: p.y - stage.origin.y });
});
// The window was shown or moved and is click-through again: start over from the cursor.
bridge?.onInputReset(() => {
  interactivity.reset();
  if (stage.isDragging && cursor) stage.pointerUp(toDesk(cursor.x, cursor.y));
  refreshInteractivity();
});
// Re-send the mouse state now and then, so main and this window can never stay out of step.
let resend = 0;
/** Last press, for the debug overlay (helps diagnose input on a real desktop). */
let lastPress = 'none';
function mouseDown(x: number, y: number): void {
  if (!interactivity.isInteractive) {
    lastPress = 'ignored (click-through)';
    return;
  }
  lastPress = stage.pointerDown(toDesk(x, y)) ? 'on a pet' : 'missed';
  loop.markActive();
}
function mouseUp(x: number, y: number): void {
  const p = toDesk(x, y);
  stage.pointerUp(p);
  // The dragged pet may have moved to another display's overlay while held.
  bridge?.sendPointerUp(p);
  refreshInteractivity();
}
window.addEventListener('mousedown', (e) => {
  if (!simulatedCursor && e.button === 0) mouseDown(e.clientX, e.clientY);
});
window.addEventListener('mouseup', (e) => {
  if (!simulatedCursor && e.button === 0) mouseUp(e.clientX, e.clientY);
});
bridge?.onPointerUp((p) => {
  if (stage.isDragging) stage.pointerUp(p);
});

// --- Messages from main -----------------------------------------------------------------------------
bridge?.onWorld((w) => stage.setWorld(w));
bridge?.onPets((cmd) => {
  for (const s of cmd.spawn ?? []) spawn(s.id, s.species);
  for (const id of cmd.remove ?? []) stage.removePet(id);
});
bridge?.onHandoff((h) => {
  stage.adopt(h.snap);
  applyQuiet();
  loop.markActive();
});
bridge?.onDisplayFlags((f) => {
  flags = f;
  applyQuiet();
});

function applyAppState(s: AppState): void {
  appState = s;
  debug.visible = s.debugOverlay;
  applyQuiet();
  if (s.visible) loop.start();
  else {
    loop.pause();
    interactivity.reset();
  }
}
bridge?.onAppState(applyAppState);
bridge?.onMetrics((m) => debug.setMetrics(m));

void (async () => {
  const info = bridge ? await bridge.getOverlayInfo() : null;
  if (info) {
    stage.displayId = info.displayId;
    stage.origin = info.origin;
  }
  applyAppState(bridge ? await bridge.getAppState() : appState);
})();

// --- Test hooks ------------------------------------------------------------------------------------
const petInfo = () =>
  stage.pets.map((p) => {
    const c = p.mover.contact;
    return {
      id: p.id,
      state: p.state,
      behavior: p.brain.current?.name ?? null,
      history: p.brain.history.slice(-8),
      x: p.mover.x,
      y: p.mover.y,
      contact: c.kind,
      windowId:
        c.kind === 'surface' ? c.surface.windowId : c.kind === 'wall' ? c.wall.windowId : null,
    };
  });

(window as unknown as { __overlay: unknown }).__overlay = {
  /** Simulate the cursor at a point in this window's coordinates. */
  simulateCursor(x: number, y: number) {
    simulatedCursor = true;
    cursorAt({ x, y });
  },
  /** Centre of the first pet's drawn body (including any hop), in this window's coordinates. */
  petCenter: () => {
    const p = stage.pets[0];
    if (!p) return { x: -1000, y: -1000 };
    const pose = p.creature.getPose();
    const y = pose.feet.y + pose.center.y * pose.sy;
    return { x: pose.feet.x - stage.origin.x, y: y - stage.origin.y };
  },
  pets: petInfo,
  displayId: () => stage.displayId,
  /** Keep every pet still for a while (so a test can aim at it). */
  hold(seconds: number) {
    for (const p of stage.pets) p.brain.interrupt(p, new Idle(seconds));
  },
  /** Place a pet on the surface at (or below) a desktop point and let it stand there. */
  place(id: string, x: number, y: number, seconds = 30) {
    const p = stage.pet(id);
    if (!p) return false;
    p.mover.place(stage.world, x, y);
    p.brain.interrupt(p, new Idle(seconds));
    return true;
  },
  /** Send a pet to the surface at (or below) a desktop point. */
  goTo(id: string, x: number, y: number) {
    const p = stage.pet(id);
    const s = stage.world.surfaceAt(x, y, 2) ?? stage.world.landingBetween(x, y, Infinity);
    if (!p || !s) return false;
    p.brain.interrupt(p, new Trip({ surface: s, x }, { name: 'goTo', run: true }), new Idle(30));
    return true;
  },
  isInteractive: () => interactivity.isInteractive,
  lastPress: () => lastPress,
  /** Tests: forget the real pointer (CI can't move it) and listen only to simulated input. */
  ignoreRealCursor() {
    simulatedCursor = true;
    cursor = null;
    stage.cursor.clear();
    refreshInteractivity();
  },
  /** Drive the mouse handlers directly (the real pointer is ignored from then on). */
  mouse(type: 'move' | 'down' | 'up', x: number, y: number) {
    simulatedCursor = true;
    if (type === 'move') cursorAt({ x, y });
    else if (type === 'down') mouseDown(x, y);
    else mouseUp(x, y);
  },
};
