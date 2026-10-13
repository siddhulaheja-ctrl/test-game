import { Menu, Tray, nativeImage, type MenuItemConstructorOptions } from 'electron';
import type { AppState } from '../shared/ipc';
import { renderIconRGBA } from './appIcon';
import { encodePng } from './png';

export interface TrayActions {
  toggleVisible(): void;
  setQuietMode(on: boolean): void;
  setDebugOverlay(on: boolean): void;
  openLab(): void;
  quit(): void;
}

export function createTrayImage(): Electron.NativeImage {
  const img = nativeImage.createFromBuffer(encodePng(16, 16, renderIconRGBA(16)), {
    scaleFactor: 1,
  });
  for (const scale of [1.5, 2, 3]) {
    const px = Math.round(16 * scale);
    img.addRepresentation({ scaleFactor: scale, buffer: encodePng(px, px, renderIconRGBA(px)) });
  }
  return img;
}

/** Tray menu template. Ids are stable so tests can find items. */
export function trayMenuTemplate(
  state: AppState,
  actions: TrayActions,
): MenuItemConstructorOptions[] {
  return [
    { id: 'title', label: 'Desktop Buddy', enabled: false },
    { type: 'separator' },
    {
      id: 'toggle-visible',
      label: state.visible ? 'Hide Buddy' : 'Show Buddy',
      click: () => actions.toggleVisible(),
    },
    {
      id: 'quiet-mode',
      label: 'Quiet Mode',
      type: 'checkbox',
      checked: state.quietMode,
      click: (item) => actions.setQuietMode(item.checked),
    },
    { type: 'separator' },
    {
      id: 'debug-overlay',
      label: 'Debug Overlay (FPS / CPU)',
      type: 'checkbox',
      checked: state.debugOverlay,
      click: (item) => actions.setDebugOverlay(item.checked),
    },
    { id: 'open-lab', label: 'Creature Lab…', click: () => actions.openLab() },
    { type: 'separator' },
    { id: 'quit', label: 'Quit Desktop Buddy', click: () => actions.quit() },
  ];
}

export class BuddyTray {
  readonly tray: Tray;
  private menu: Menu | null = null;

  constructor(private actions: TrayActions) {
    this.tray = new Tray(createTrayImage());
    this.tray.setToolTip('Desktop Buddy');
    // Windows convention: left-click toggles, right-click opens the menu.
    this.tray.on('click', () => actions.toggleVisible());
  }

  update(state: AppState): void {
    this.menu = Menu.buildFromTemplate(trayMenuTemplate(state, this.actions));
    this.tray.setContextMenu(this.menu);
    this.tray.setToolTip(state.quietMode ? 'Desktop Buddy (quiet)' : 'Desktop Buddy');
  }

  getMenu(): Menu | null {
    return this.menu;
  }

  destroy(): void {
    this.tray.destroy();
  }
}
