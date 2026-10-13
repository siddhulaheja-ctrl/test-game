import { BrowserWindow } from 'electron';
import type { DisplayInfo } from '../world/world';
import { pageLocation, preloadPath } from './paths';

/**
 * The transparent, frameless, always-on-top window the creature lives in.
 * It covers one display's work area (so the taskbar stays uncovered) and clicks pass through it
 * except where the renderer says the creature is.
 */
export class OverlayWindow {
  readonly win: BrowserWindow;
  private interactive = false;

  constructor(private display: DisplayInfo) {
    const { x, y, width, height } = display.workArea;
    this.win = new BrowserWindow({
      x,
      y,
      width,
      height,
      show: false,
      transparent: true,
      backgroundColor: '#00000000',
      frame: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      hasShadow: false,
      // Never take keyboard focus away from whatever the user is doing.
      focusable: false,
      alwaysOnTop: true,
      title: 'Desktop Buddy',
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        // The creature keeps living when the window is not focused (it never is).
        backgroundThrottling: false,
        spellcheck: false,
      },
    });
    this.win.setAlwaysOnTop(true, 'screen-saver');
    this.win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
    this.win.setIgnoreMouseEvents(true, { forward: true });
    this.win.setMenu(null);

    const loc = pageLocation('overlay');
    if ('url' in loc) void this.win.loadURL(loc.url);
    else void this.win.loadFile(loc.file);
  }

  get displayId(): number {
    return this.display.id;
  }

  isInteractive(): boolean {
    return this.interactive;
  }

  /** Capture the mouse (true) while the cursor is over the creature, otherwise click through. */
  setInteractive(interactive: boolean): void {
    if (this.win.isDestroyed() || interactive === this.interactive) return;
    this.interactive = interactive;
    if (interactive) this.win.setIgnoreMouseEvents(false);
    else this.win.setIgnoreMouseEvents(true, { forward: true });
  }

  get info(): DisplayInfo {
    return this.display;
  }

  /** Re-fit to the display's work area (taskbar moved, resolution changed, DPI changed). */
  refit(display: DisplayInfo): void {
    if (this.win.isDestroyed()) return;
    this.display = display;
    this.win.setBounds(display.workArea);
  }

  /** Native handle as a hex id (matches WindowProvider ids), to keep overlays out of window lists. */
  nativeId(): string {
    const h = this.win.getNativeWindowHandle();
    return h.length >= 8 ? h.readBigUInt64LE(0).toString(16) : h.readUInt32LE(0).toString(16);
  }

  destroy(): void {
    if (!this.win.isDestroyed()) this.win.destroy();
  }

  show(): void {
    if (!this.win.isDestroyed() && !this.win.isVisible()) this.win.showInactive();
  }

  hide(): void {
    if (this.win.isDestroyed()) return;
    this.setInteractive(false);
    this.win.hide();
  }
}
