import type { MenuItem } from 'electron';
import type { AppState } from '../shared/ipc';
import { FakeWindows, type WindowProvider } from '../platform/windowProvider';
import type { Rect } from '../world/geometry';
import type { WindowInfo } from '../world/world';
import type { OverlayWindow } from './overlayWindow';
import type { BuddyTray } from './tray';

interface HookDeps {
  overlays(): OverlayWindow[];
  tray: BuddyTray;
  getState(): AppState;
  setState(patch: Partial<AppState>): void;
  openLab(): void;
  windows: WindowProvider;
  owners(): Record<string, number>;
  fullscreen(): number[];
  pollNow(): void;
}

export interface BuddyTestHooks {
  trayMenu(): { id: string; label: string; checked: boolean }[];
  clickTrayItem(id: string): void;
  isInteractive(): boolean;
  overlayBounds(): Electron.Rectangle;
  overlayVisible(): boolean;
  overlays(): { displayId: number; bounds: Electron.Rectangle; visible: boolean }[];
  state(): AppState;
  /** Fake window provider only (BUDDY_FAKE_WINDOWS=1). */
  setWindows(list: WindowInfo[]): void;
  setFullscreen(rects: Rect[]): void;
  petOwners(): Record<string, number>;
  fullscreenDisplays(): number[];
  setCovered(on: boolean): void;
  raises(): number;
}

/**
 * End-to-end test hooks, only installed when BUDDY_E2E=1.
 * Playwright reads them with `electronApp.evaluate(() => globalThis.__buddyTest…)`.
 */
export function installTestHooks(deps: HookDeps): void {
  const flatten = (items: MenuItem[]): MenuItem[] =>
    items.flatMap((i) => [i, ...(i.submenu ? flatten(i.submenu.items) : [])]);
  const items = (): MenuItem[] => flatten(deps.tray.getMenu()?.items ?? []);
  const first = () => deps.overlays()[0]!;
  const fake = () => {
    if (!(deps.windows instanceof FakeWindows)) throw new Error('Not using fake windows');
    return deps.windows;
  };
  const hooks: BuddyTestHooks = {
    trayMenu: () =>
      items()
        .filter((i) => i.type !== 'separator')
        .map((i) => ({ id: i.id, label: i.label, checked: i.checked })),
    clickTrayItem: (id) => {
      const item = items().find((i) => i.id === id);
      if (!item) throw new Error(`No tray item ${id}`);
      // MenuItem.click flips checkbox state itself, exactly like a real click.
      (item.click as () => void)();
    },
    isInteractive: () => deps.overlays().some((o) => o.isInteractive()),
    overlayBounds: () => first().win.getBounds(),
    overlayVisible: () => first().win.isVisible(),
    overlays: () =>
      deps.overlays().map((o) => ({
        displayId: o.info.id,
        bounds: o.win.getBounds(),
        visible: o.win.isVisible(),
      })),
    state: () => deps.getState(),
    setWindows: (list) => {
      fake().windows = list;
      deps.pollNow();
    },
    setFullscreen: (rects) => {
      fake().fullscreenRects = rects;
      deps.pollNow();
    },
    petOwners: () => deps.owners(),
    setCovered: (on) => {
      fake().covered = on;
    },
    raises: () => deps.overlays().reduce((n, o) => n + o.raises, 0),
    fullscreenDisplays: () => deps.fullscreen(),
  };
  (globalThis as unknown as { __buddyTest: BuddyTestHooks }).__buddyTest = hooks;
}
