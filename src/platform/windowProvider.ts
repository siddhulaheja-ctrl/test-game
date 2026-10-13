import type { Rect } from '../world/geometry';
import type { WindowInfo } from '../world/world';

/**
 * OS window access behind one interface. Implementations: Windows (Win32 via koffi), a fake for
 * tests, and an empty one for platforms without support yet (macOS, Linux).
 *
 * Privacy: providers only report rectangles, z-order and window classes. Titles and contents are
 * never read.
 */
export interface WindowProvider {
  readonly name: string;
  /** Visible top-level windows, top-most first, in desktop DIP. Our own windows are excluded. */
  list(): WindowInfo[];
  /** Current bounds of one window (fast path while a pet rides it), or null if it's gone. */
  bounds(id: string): Rect | null;
  /** Bounds (DIP) of fullscreen apps currently in front, if any. */
  fullscreen(): Rect[];
  /** Left mouse button held down, where the OS can say so globally; null if unknown. */
  leftButtonDown(): boolean | null;
  /** Window handles of our own overlays, so they are never listed. */
  setOwnWindows(ids: string[]): void;
}

/** Raw facts about a top-level window, before filtering. */
export interface RawWindow {
  id: string;
  /** Physical or DIP rectangle (the provider converts to DIP). */
  rect: Rect;
  className: string;
  visible: boolean;
  minimized: boolean;
  /** Hidden by the compositor (other virtual desktops, suspended UWP apps). */
  cloaked: boolean;
  /** Window styles (Win32 GWL_STYLE / GWL_EXSTYLE). */
  style: number;
  exStyle: number;
}

const WS_POPUP = 0x80000000;
const WS_CAPTION = 0x00c00000;
const WS_THICKFRAME = 0x00040000;
const WS_EX_TOOLWINDOW = 0x00000080;
const WS_EX_NOACTIVATE = 0x08000000;

/** Shell windows that are not "windows" to a pet: the desktop, taskbars, start menu, tray. */
const SHELL_CLASSES = new Set([
  'Progman',
  'WorkerW',
  'Shell_TrayWnd',
  'Shell_SecondaryTrayWnd',
  'NotifyIconOverflowWindow',
  'TopLevelWindowForOverflowXamlIsland',
  'Windows.UI.Core.CoreWindow',
  'XamlExplorerHostIslandWindow',
  'tooltips_class32',
  '#32768', // menus
]);

export const isShellClass = (className: string): boolean => SHELL_CLASSES.has(className);

/** Smallest window worth treating as furniture (px). */
const MIN_SIZE = 80;

/** Keep the windows a pet can interact with: real, visible, framed application windows. */
export function filterWindows(raw: readonly RawWindow[], own: ReadonlySet<string>): RawWindow[] {
  return raw.filter((w) => {
    if (!w.visible || w.minimized || w.cloaked || own.has(w.id)) return false;
    if (isShellClass(w.className)) return false;
    if (w.exStyle & WS_EX_TOOLWINDOW) return false;
    if (w.exStyle & WS_EX_NOACTIVATE && !(w.style & WS_CAPTION)) return false;
    // Popups without a frame are menus, tooltips and splash screens.
    if (w.style & WS_POPUP && !(w.style & (WS_CAPTION | WS_THICKFRAME))) return false;
    return w.rect.width >= MIN_SIZE && w.rect.height >= MIN_SIZE;
  });
}

/** A provider with no windows (platforms without support yet). */
export class NoWindows implements WindowProvider {
  readonly name = 'none';
  list(): WindowInfo[] {
    return [];
  }
  bounds(): Rect | null {
    return null;
  }
  fullscreen(): Rect[] {
    return [];
  }
  leftButtonDown(): boolean | null {
    return null;
  }
  setOwnWindows(): void {}
}

/** Scriptable windows for tests and demos. */
export class FakeWindows implements WindowProvider {
  readonly name = 'fake';
  windows: WindowInfo[] = [];
  fullscreenRects: Rect[] = [];
  list(): WindowInfo[] {
    return this.windows.map((w) => ({ id: w.id, bounds: { ...w.bounds } }));
  }
  bounds(id: string): Rect | null {
    const w = this.windows.find((q) => q.id === id);
    return w ? { ...w.bounds } : null;
  }
  fullscreen(): Rect[] {
    return this.fullscreenRects.map((r) => ({ ...r }));
  }
  leftButtonDown(): boolean | null {
    return null;
  }
  setOwnWindows(): void {}
}
