import type { MenuItem } from 'electron';
import type { AppState } from '../shared/ipc';
import type { OverlayWindow } from './overlayWindow';
import type { BuddyTray } from './tray';

interface HookDeps {
  overlay: OverlayWindow;
  tray: BuddyTray;
  getState(): AppState;
  setState(patch: Partial<AppState>): void;
  openLab(): void;
}

export interface BuddyTestHooks {
  trayMenu(): { id: string; label: string; checked: boolean }[];
  clickTrayItem(id: string): void;
  isInteractive(): boolean;
  overlayBounds(): Electron.Rectangle;
  overlayVisible(): boolean;
  state(): AppState;
}

/**
 * End-to-end test hooks, only installed when BUDDY_E2E=1.
 * Playwright reads them with `electronApp.evaluate(() => globalThis.__buddyTest…)`.
 */
export function installTestHooks(deps: HookDeps): void {
  const items = (): MenuItem[] => deps.tray.getMenu()?.items ?? [];
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
    isInteractive: () => deps.overlay.isInteractive(),
    overlayBounds: () => deps.overlay.win.getBounds(),
    overlayVisible: () => deps.overlay.win.isVisible(),
    state: () => deps.getState(),
  };
  (globalThis as unknown as { __buddyTest: BuddyTestHooks }).__buddyTest = hooks;
}
