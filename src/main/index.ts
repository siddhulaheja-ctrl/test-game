import path from 'node:path';
import { app, BrowserWindow, ipcMain, screen, type WebContents } from 'electron';
import {
  DEFAULT_APP_STATE,
  IPC,
  sanitizeAppState,
  type AppState,
  type CursorPoint,
  type Handoff,
  type OverlayInfo,
  type ProcessMetrics,
} from '../shared/ipc';
import {
  FakeWindows,
  NoWindows,
  type FullscreenApp,
  type WindowProvider,
} from '../platform/windowProvider';
import { Win32Windows } from '../platform/win32/win32Windows';
import { bottom, right, sameRect, type Rect } from '../world/geometry';
import type { PetSnapshot } from '../behaviors/snapshot';
import type { DisplayInfo, WindowInfo, WorldSnapshot } from '../world/world';
import { fakeDisplays, realDisplays, type FakeDisplaySource } from './displays';
import { JsonStore } from './jsonStore';
import { OverlayWindow } from './overlayWindow';
import { pageLocation, preloadPath } from './paths';
import { BuddyTray } from './tray';
import { installTestHooks } from './testHooks';

const SETTINGS_VERSION = 1;
const CURSOR_POLL_MS = 33;
const WINDOW_POLL_MS = 250;
const RIDE_POLL_MS = 33;
const METRICS_POLL_MS = 1000;
/** Default safe zone: where Windows shows notification toasts (bottom-right of the primary). */
const NOTIFY_W = 380;
const NOTIFY_H = 200;

if (process.env.BUDDY_USER_DATA) app.setPath('userData', process.env.BUDDY_USER_DATA);
app.setAppUserModelId('com.desktopbuddy.app');

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  void app.whenReady().then(start);
}

/** One-line status messages in the terminal that started the app (no window titles, ever). */
const log = (msg: string) => console.info(`[buddy] ${msg}`);

function createWindowProvider(): WindowProvider {
  if (process.env.BUDDY_FAKE_WINDOWS === '1') return new FakeWindows();
  if (process.platform === 'win32') {
    try {
      return new Win32Windows(
        (r) => screen.screenToDipRect(null, r),
        (p) => screen.dipToScreenPoint(p),
      );
    } catch (err) {
      console.warn('[windows] Win32 window access unavailable:', (err as Error).message);
    }
  }
  return new NoWindows();
}

function start(): void {
  const settings = new JsonStore<AppState>({
    file: path.join(app.getPath('userData'), 'settings.json'),
    version: SETTINGS_VERSION,
    defaults: DEFAULT_APP_STATE,
  });
  let state: AppState = settings.load();

  const displays = process.env.BUDDY_FAKE_DISPLAYS
    ? fakeDisplays(process.env.BUDDY_FAKE_DISPLAYS)
    : realDisplays();
  const windows = createWindowProvider();
  const overlays = new Map<number, OverlayWindow>();
  const loaded = new Set<number>();
  /** Which display's overlay owns each pet. */
  const owners = new Map<string, number>();
  /** Windows each overlay's pets stand on (polled fast). */
  const watched = new Map<number, string[]>();
  let windowList: WindowInfo[] = [];
  let fullscreen: number[] = [];
  let labWindow: BrowserWindow | null = null;
  let windowErrorLogged = false;

  const primaryId = () => (displays.list().find((d) => d.primary) ?? displays.list()[0])!.id;
  const overlayFor = (wc: WebContents) =>
    [...overlays.values()].find((o) => o.win.webContents === wc);
  const sendTo = (displayId: number, channel: string, payload: unknown) => {
    const o = overlays.get(displayId);
    if (o && !o.win.isDestroyed() && loaded.has(displayId))
      o.win.webContents.send(channel, payload);
  };
  const broadcast = (channel: string, payload: unknown) => {
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) w.webContents.send(channel, payload);
    }
  };

  // --- World ------------------------------------------------------------------------------------
  const safeZones = (): Rect[] => {
    const zones = [...state.safeZones];
    const p = displays.list().find((d) => d.primary);
    if (state.avoidNotificationCorner && p) {
      const wa = p.workArea;
      zones.push({
        x: right(wa) - NOTIFY_W,
        y: bottom(wa) - NOTIFY_H,
        width: NOTIFY_W,
        height: NOTIFY_H,
      });
    }
    return zones;
  };
  const world = (): WorldSnapshot => ({
    displays: displays.list(),
    windows: windowList,
    safeZones: safeZones(),
  });
  const sendWorld = () => {
    const w = world();
    for (const id of overlays.keys()) sendTo(id, IPC.world, w);
  };

  // --- Overlays (one per display) ---------------------------------------------------------------
  const applyVisibility = () => {
    for (const [id, o] of overlays) {
      const hide = !state.visible || (state.fullscreenMode === 'hide' && fullscreen.includes(id));
      if (hide) o.hide();
      else o.show();
    }
  };

  /** Pets waiting for a re-created overlay to load (display id → snapshots). */
  const pendingAdopt = new Map<number, PetSnapshot[]>();
  /** Displays whose overlay is being re-created right now. */
  const recreating = new Set<number>();

  function createOverlay(d: DisplayInfo): void {
    const o = new OverlayWindow(d);
    overlays.set(d.id, o);
    o.win.webContents.on('did-finish-load', () => {
      loaded.add(d.id);
      o.win.webContents.send(IPC.world, world());
      const snaps = (pendingAdopt.get(d.id) ?? []).filter((s) => owners.get(s.id) === d.id);
      pendingAdopt.delete(d.id);
      for (const snap of snaps) o.win.webContents.send(IPC.handoff, { snap, toDisplay: d.id });
      const adopted = new Set(snaps.map((s) => s.id));
      const mine = [...owners]
        .filter(([id, disp]) => disp === d.id && !adopted.has(id))
        .map(([id]) => id);
      if (mine.length) {
        o.win.webContents.send(IPC.pets, { spawn: mine.map((id) => ({ id, species: id })) });
      }
      o.win.webContents.send(IPC.displayFlags, { fullscreen });
    });
    o.win.once('ready-to-show', applyVisibility);
  }

  /** Ask an overlay for snapshots of its pets (empty if it doesn't answer quickly). */
  function evacuate(o: OverlayWindow): Promise<PetSnapshot[]> {
    if (!loaded.has(o.info.id) || o.win.isDestroyed()) return Promise.resolve([]);
    const wc = o.win.webContents;
    return new Promise((resolve) => {
      const done = (snaps: PetSnapshot[]) => {
        clearTimeout(timer);
        ipcMain.removeListener(IPC.evacuated, onReply);
        resolve(snaps);
      };
      const onReply = (e: Electron.IpcMainEvent, snaps: unknown) => {
        if (e.sender === wc) done(Array.isArray(snaps) ? (snaps as PetSnapshot[]) : []);
      };
      const timer = setTimeout(() => done([]), 800);
      ipcMain.on(IPC.evacuated, onReply);
      wc.send(IPC.evacuate);
    });
  }

  /**
   * The work area changed (taskbar shown or hidden, resolution or scale changed). Resizing a
   * transparent window in place can leave Windows hit-testing its old area, so clicks on pets in
   * the new part fall through. Re-create the window at the new size and hand the pets over.
   */
  async function recreateOverlay(d: DisplayInfo): Promise<void> {
    const old = overlays.get(d.id);
    if (!old || recreating.has(d.id)) return;
    recreating.add(d.id);
    log(`display ${d.id} work area changed: re-creating its overlay`);
    const snaps = await evacuate(old);
    old.destroy();
    loaded.delete(d.id);
    watched.delete(d.id);
    pendingAdopt.set(d.id, snaps);
    createOverlay(d);
    windows.setOwnWindows([...overlays.values()].map((o) => o.nativeId()));
    recreating.delete(d.id);
    // It may have changed again meanwhile.
    syncOverlays();
  }

  function syncOverlays(): void {
    const list = displays.list();
    for (const d of list) {
      const existing = overlays.get(d.id);
      if (!existing) createOverlay(d);
      else if (recreating.has(d.id)) continue;
      else if (!sameRect(existing.info.workArea, d.workArea)) void recreateOverlay(d);
      else existing.setInfo(d);
    }
    // Displays that went away: their pets move to the primary display.
    for (const [id, o] of overlays) {
      if (list.some((d) => d.id === id)) continue;
      o.destroy();
      overlays.delete(id);
      loaded.delete(id);
      watched.delete(id);
      const orphans = [...owners].filter(([, disp]) => disp === id).map(([pet]) => pet);
      for (const pet of orphans) owners.set(pet, primaryId());
      if (orphans.length)
        sendTo(primaryId(), IPC.pets, { spawn: orphans.map((p) => ({ id: p, species: p })) });
    }
    windows.setOwnWindows([...overlays.values()].map((o) => o.nativeId()));
    sendWorld();
  }

  /** Spawn or remove pets to match the chosen characters. */
  function syncCharacters(): void {
    for (const id of state.characters) {
      if (owners.has(id)) continue;
      owners.set(id, primaryId());
      sendTo(primaryId(), IPC.pets, { spawn: [{ id, species: id }] });
    }
    for (const [id, disp] of owners) {
      if (state.characters.includes(id as AppState['characters'][number])) continue;
      owners.delete(id);
      sendTo(disp, IPC.pets, { remove: [id] });
    }
  }

  // --- State ------------------------------------------------------------------------------------
  const setState = (patch: Partial<AppState>) => {
    const zonesChanged =
      ('safeZones' in patch &&
        JSON.stringify(patch.safeZones) !== JSON.stringify(state.safeZones)) ||
      ('avoidNotificationCorner' in patch &&
        patch.avoidNotificationCorner !== state.avoidNotificationCorner);
    state = { ...state, ...patch };
    settings.save(state);
    tray.update(state);
    tray.setStatus(statusText());
    applyVisibility();
    broadcast(IPC.appState, state);
    syncCharacters();
    if (zonesChanged) sendWorld();
    restartTimers();
  };

  const openLab = () => {
    if (labWindow && !labWindow.isDestroyed()) {
      labWindow.focus();
      return;
    }
    labWindow = new BrowserWindow({
      width: 1280,
      height: 840,
      title: 'Desktop Buddy: Creature Lab',
      backgroundColor: '#1d1b26',
      autoHideMenuBar: true,
      webPreferences: { preload: preloadPath, contextIsolation: true, sandbox: true },
    });
    const loc = pageLocation('lab');
    if ('url' in loc) void labWindow.loadURL(loc.url);
    else void labWindow.loadFile(loc.file);
    labWindow.on('closed', () => (labWindow = null));
  };

  const tray = new BuddyTray({
    toggleVisible: () => setState({ visible: !state.visible }),
    setQuietMode: (on) => setState({ quietMode: on }),
    setDebugOverlay: (on) => setState({ debugOverlay: on }),
    setCharacter: (id, on) =>
      setState({
        characters: on
          ? [...new Set([...state.characters, id])]
          : state.characters.filter((c) => c !== id),
      }),
    setFullscreenMode: (mode) => setState({ fullscreenMode: mode }),
    setAvoidNotificationCorner: (on) => setState({ avoidNotificationCorner: on }),
    openLab,
    quit: () => app.quit(),
  });
  tray.update(state);

  // --- IPC -------------------------------------------------------------------------------------
  ipcMain.on(IPC.setInteractive, (e, interactive: unknown) => {
    overlayFor(e.sender)?.setInteractive(interactive === true);
  });
  ipcMain.handle(IPC.getAppState, () => state);
  ipcMain.on(IPC.patchAppState, (_e, patch: unknown) => setState(sanitizeAppState(patch)));
  ipcMain.handle(IPC.overlayInfo, (e): OverlayInfo | null => {
    const o = overlayFor(e.sender);
    if (!o) return null;
    const wa = o.info.workArea;
    return {
      displayId: o.info.id,
      origin: { x: wa.x, y: wa.y },
      primary: o.info.id === primaryId(),
    };
  });
  ipcMain.on(IPC.handoff, (e, h: Handoff) => {
    const from = overlayFor(e.sender);
    if (!from || typeof h?.snap?.id !== 'string' || !owners.has(h.snap.id)) return;
    const target =
      overlays.has(h.toDisplay) && loaded.has(h.toDisplay) ? h.toDisplay : from.info.id;
    owners.set(h.snap.id, target);
    sendTo(target, IPC.handoff, { snap: h.snap, toDisplay: target });
  });
  ipcMain.on(IPC.watchWindows, (e, ids: unknown) => {
    const o = overlayFor(e.sender);
    if (o && Array.isArray(ids))
      watched.set(
        o.info.id,
        ids.filter((x): x is string => typeof x === 'string'),
      );
    restartTimers();
  });
  ipcMain.on(IPC.pointerUp, (e, p: { x: number; y: number }) => {
    // The overlay that captured the press reports the release; the pet may live in another one.
    for (const [id, o] of overlays)
      if (o.win.webContents !== e.sender) sendTo(id, IPC.pointerUp, p);
  });

  // --- Polling: cursor, windows, ridden windows, metrics -----------------------------------------
  const timers: Record<string, NodeJS.Timeout | null> = {
    cursor: null,
    windows: null,
    ride: null,
    metrics: null,
  };
  let lastCursor: CursorPoint = { x: NaN, y: NaN };

  const every = (name: string, want: boolean, ms: number, fn: () => void) => {
    if (want && !timers[name]) timers[name] = setInterval(fn, ms);
    else if (!want && timers[name]) {
      clearInterval(timers[name]!);
      timers[name] = null;
    }
  };

  /** What's under the cursor while a pet is hovered, and how often we had to raise an overlay. */
  const diag = { under: 'n/a', raised: 0 };
  let lastCoverCheck = 0;
  let lastRaise = 0;

  /**
   * While the cursor is over a pet, make sure clicks will actually reach it: if another window is
   * on top of the overlay at that point, put the overlay back on top.
   */
  function checkCovered(p: { x: number; y: number }): void {
    const now = Date.now();
    if (!windows.windowAt || now - lastCoverCheck < 200) return;
    lastCoverCheck = now;
    const hovered = [...overlays.values()].find((o) => o.isInteractive() && o.win.isVisible());
    if (!hovered) {
      diag.under = 'n/a';
      return;
    }
    let hit: { own: boolean; className: string } | null = null;
    try {
      hit = windows.windowAt(p.x, p.y);
    } catch {
      hit = null;
    }
    diag.under = !hit ? 'nothing' : hit.own ? 'our overlay' : `other (${hit.className || '?'})`;
    if (hit && !hit.own && now - lastRaise > 1000) {
      lastRaise = now;
      diag.raised++;
      log(`a window (${hit.className || 'unknown'}) covered the pets: putting them back on top`);
      hovered.raise();
    }
  }

  function pollCursor(): void {
    const p = screen.getCursorScreenPoint();
    checkCovered(p);
    const left = windows.leftButtonDown();
    const next: CursorPoint =
      left === null ? { x: p.x, y: p.y } : { x: p.x, y: p.y, leftDown: left };
    if (next.x === lastCursor.x && next.y === lastCursor.y && next.leftDown === lastCursor.leftDown)
      return;
    lastCursor = next;
    for (const id of overlays.keys()) sendTo(id, IPC.cursor, next);
  }

  function readWindows(): WindowInfo[] {
    try {
      return windows.list();
    } catch (err) {
      if (!windowErrorLogged) console.warn('[windows] listing failed:', (err as Error).message);
      windowErrorLogged = true;
      return [];
    }
  }

  function pollWindows(): void {
    const next = readWindows();
    const changed =
      next.length !== windowList.length ||
      next.some((w, i) => w.id !== windowList[i]!.id || !sameRect(w.bounds, windowList[i]!.bounds));
    if (changed) {
      windowList = next;
      sendWorld();
    }
    pollFullscreen();
  }

  function pollRidden(): void {
    let changed = false;
    const ids = new Set([...watched.values()].flat());
    windowList = windowList.flatMap((w) => {
      if (!ids.has(w.id)) return [w];
      let b: Rect | null = null;
      try {
        b = windows.bounds(w.id);
      } catch {
        b = null;
      }
      if (!b) {
        changed = true;
        return [];
      }
      if (!sameRect(b, w.bounds)) {
        changed = true;
        return [{ id: w.id, bounds: b }];
      }
      return [w];
    });
    if (changed) sendWorld();
  }

  function pollFullscreen(): void {
    let rects: FullscreenApp[] = [];
    try {
      rects = windows.fullscreen();
    } catch {
      rects = [];
    }
    const covered = displays
      .list()
      .filter((d) =>
        rects.some(
          (r) =>
            r.x <= d.bounds.x + 2 &&
            r.y <= d.bounds.y + 2 &&
            right(r) >= right(d.bounds) - 2 &&
            bottom(r) >= bottom(d.bounds) - 2,
        ),
      )
      .map((d) => d.id);
    if (covered.join() === fullscreen.join()) return;
    const ended = fullscreen.filter((id) => !covered.includes(id));
    fullscreen = covered;
    const app = rects[0]?.className ?? 'unknown';
    if (covered.length) {
      log(
        `fullscreen app (${app}) on display ${covered.join(', ')}: ` +
          (state.fullscreenMode === 'hide' ? 'hiding pets there' : 'pets go quiet'),
      );
    } else log('fullscreen app gone: pets back');
    applyVisibility();
    // A fullscreen app going away can leave the overlays below other windows: put them back.
    for (const id of ended) {
      const o = overlays.get(id);
      if (o?.win.isVisible()) o.raise();
    }
    tray.setStatus(statusText());
    for (const id of overlays.keys()) sendTo(id, IPC.displayFlags, { fullscreen });
  }

  function restartTimers(): void {
    every('cursor', state.visible, CURSOR_POLL_MS, pollCursor);
    every('windows', true, WINDOW_POLL_MS, pollWindows);
    every(
      'ride',
      state.visible && [...watched.values()].some((l) => l.length > 0),
      RIDE_POLL_MS,
      pollRidden,
    );
    every('metrics', state.debugOverlay && state.visible, METRICS_POLL_MS, () => {
      const metrics = app.getAppMetrics();
      const m: ProcessMetrics = {
        cpuPercent: metrics.reduce((sum, p) => sum + p.cpu.percentCPUUsage, 0),
        // Private memory where the OS reports it (Windows): working sets double-count shared pages.
        memoryMB:
          metrics.reduce((sum, p) => sum + (p.memory.privateBytes ?? p.memory.workingSetSize), 0) /
          1024,
      };
      broadcast(IPC.metrics, { ...m, underCursor: diag.under, raised: diag.raised });
    });
  }

  function statusText(): string {
    if (!state.visible) return 'Pets hidden (Show Buddy to bring them back)';
    if (state.fullscreenMode === 'hide' && fullscreen.length) {
      return 'Pets hidden while a fullscreen app is open';
    }
    const n = owners.size;
    return n ? `${n} pet${n === 1 ? '' : 's'} out` : 'No characters chosen';
  }

  // --- Start ------------------------------------------------------------------------------------
  log(`window access: ${windows.name}`);
  windowList = readWindows();
  syncOverlays();
  syncCharacters();
  displays.onChange(() => syncOverlays());
  restartTimers();
  for (const o of overlays.values()) {
    const b = o.info.workArea;
    log(`overlay for display ${o.info.id}: ${b.width}x${b.height} at ${b.x},${b.y}`);
  }
  log(`characters: ${state.characters.join(', ') || 'none'}${state.visible ? '' : ' (hidden)'}`);
  tray.setStatus(statusText());

  app.on('second-instance', () => setState({ visible: true }));
  app.on('before-quit', () => {
    for (const t of Object.values(timers)) if (t) clearInterval(t);
    tray.destroy();
  });
  // The pets live in the tray: closing the lab must not quit the app.
  app.on('window-all-closed', () => {});

  if (process.env.BUDDY_E2E === '1') {
    installTestHooks({
      overlays: () => [...overlays.values()],
      tray,
      getState: () => state,
      setState,
      openLab,
      windows,
      owners: () => Object.fromEntries(owners),
      fullscreen: () => fullscreen,
      pollNow: pollWindows,
      setDisplays: 'set' in displays ? (list) => (displays as FakeDisplaySource).set(list) : null,
    });
  }
}
