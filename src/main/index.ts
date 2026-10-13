import path from 'node:path';
import { app, BrowserWindow, ipcMain, screen } from 'electron';
import { DEFAULT_APP_STATE, IPC, type AppState, type ProcessMetrics } from '../shared/ipc';
import { JsonStore } from './jsonStore';
import { OverlayWindow } from './overlayWindow';
import { pageLocation, preloadPath } from './paths';
import { BuddyTray } from './tray';
import { installTestHooks } from './testHooks';

const SETTINGS_VERSION = 1;
const CURSOR_POLL_MS = 33;
const METRICS_POLL_MS = 1000;

if (process.env.BUDDY_USER_DATA) app.setPath('userData', process.env.BUDDY_USER_DATA);
app.setAppUserModelId('com.desktopbuddy.app');

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  void app.whenReady().then(start);
}

function start(): void {
  const settings = new JsonStore<AppState>({
    file: path.join(app.getPath('userData'), 'settings.json'),
    version: SETTINGS_VERSION,
    defaults: DEFAULT_APP_STATE,
  });
  let state: AppState = settings.load();

  const overlay = new OverlayWindow(screen.getPrimaryDisplay());
  let labWindow: BrowserWindow | null = null;

  const broadcast = (channel: string, payload: unknown) => {
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) w.webContents.send(channel, payload);
    }
  };

  const applyVisibility = () => {
    if (state.visible) overlay.show();
    else overlay.hide();
  };

  const setState = (patch: Partial<AppState>) => {
    state = { ...state, ...patch };
    settings.save(state);
    tray.update(state);
    applyVisibility();
    broadcast(IPC.appState, state);
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
    openLab,
    quit: () => app.quit(),
  });
  tray.update(state);

  // --- IPC -------------------------------------------------------------------------------------
  ipcMain.on(IPC.setInteractive, (e, interactive: unknown) => {
    if (e.sender === overlay.win.webContents) overlay.setInteractive(interactive === true);
  });
  ipcMain.handle(IPC.getAppState, () => state);
  ipcMain.on(IPC.patchAppState, (_e, patch: unknown) => {
    if (typeof patch !== 'object' || patch === null) return;
    const clean: Partial<AppState> = {};
    for (const key of Object.keys(DEFAULT_APP_STATE) as (keyof AppState)[]) {
      const v = (patch as Record<string, unknown>)[key];
      if (typeof v === 'boolean') clean[key] = v;
    }
    setState(clean);
  });

  // --- Timers: cursor polling and metrics (only while needed) -----------------------------------
  let cursorTimer: NodeJS.Timeout | null = null;
  let metricsTimer: NodeJS.Timeout | null = null;
  let lastCursor = { x: NaN, y: NaN };

  function restartTimers(): void {
    const wantCursor = state.visible;
    if (wantCursor && !cursorTimer) {
      cursorTimer = setInterval(() => {
        if (overlay.win.isDestroyed()) return;
        const p = overlay.cursorInWindow();
        if (p.x === lastCursor.x && p.y === lastCursor.y) return;
        lastCursor = p;
        overlay.win.webContents.send(IPC.cursor, p);
      }, CURSOR_POLL_MS);
    } else if (!wantCursor && cursorTimer) {
      clearInterval(cursorTimer);
      cursorTimer = null;
    }

    const wantMetrics = state.debugOverlay && state.visible;
    if (wantMetrics && !metricsTimer) {
      metricsTimer = setInterval(() => {
        const metrics = app.getAppMetrics();
        const m: ProcessMetrics = {
          cpuPercent: metrics.reduce((sum, p) => sum + p.cpu.percentCPUUsage, 0),
          memoryMB: metrics.reduce((sum, p) => sum + p.memory.workingSetSize, 0) / 1024,
        };
        overlay.win.webContents.send(IPC.metrics, m);
      }, METRICS_POLL_MS);
    } else if (!wantMetrics && metricsTimer) {
      clearInterval(metricsTimer);
      metricsTimer = null;
    }
  }

  // --- Display changes -------------------------------------------------------------------------
  screen.on('display-metrics-changed', () => overlay.refit());
  screen.on('display-removed', () => overlay.refit());

  overlay.win.once('ready-to-show', () => {
    applyVisibility();
    restartTimers();
  });

  app.on('second-instance', () => setState({ visible: true }));
  app.on('before-quit', () => {
    if (cursorTimer) clearInterval(cursorTimer);
    if (metricsTimer) clearInterval(metricsTimer);
    tray.destroy();
  });
  // The pet lives in the tray: closing the lab must not quit the app.
  app.on('window-all-closed', () => {});

  if (process.env.BUDDY_E2E === '1') {
    installTestHooks({ overlay, tray, getState: () => state, setState, openLab });
  }
}
