import koffi from 'koffi';
import type { Rect } from '../../world/geometry';
import type { WindowInfo } from '../../world/world';
import {
  filterWindows,
  isShellClass,
  type RawWindow,
  type WindowProvider,
} from '../windowProvider';

/**
 * Windows implementation of WindowProvider, calling Win32 through koffi (prebuilt FFI, no native
 * build step). Reads only rectangles, z-order, visibility, styles and class names: never titles
 * or contents.
 */

const GWL_STYLE = -16;
const GWL_EXSTYLE = -20;
const DWMWA_EXTENDED_FRAME_BOUNDS = 9;
const DWMWA_CLOAKED = 14;
const VK_LBUTTON = 0x01;
const VK_RBUTTON = 0x02;
const SM_SWAPBUTTON = 23;
// SHQueryUserNotificationState results that mean "something fullscreen is in front".
const QUNS_BUSY = 2;
const QUNS_RUNNING_D3D_FULL_SCREEN = 3;
const QUNS_PRESENTATION_MODE = 4;

type Hwnd = unknown;

interface Api {
  EnumWindows(cb: (h: Hwnd, l: number) => boolean, l: number): boolean;
  IsWindowVisible(h: Hwnd): boolean;
  IsIconic(h: Hwnd): boolean;
  GetWindowRect(h: Hwnd, out: Record<string, number>): boolean;
  GetWindowLongW(h: Hwnd, idx: number): number;
  GetClassNameW(h: Hwnd, buf: Buffer, max: number): number;
  GetForegroundWindow(): Hwnd;
  GetAsyncKeyState(vk: number): number;
  GetSystemMetrics(idx: number): number;
  DwmGetWindowAttribute(h: Hwnd, attr: number, buf: Buffer, size: number): number;
  SHQueryUserNotificationState(out: number[]): number;
}

function loadApi(): Api {
  const user32 = koffi.load('user32.dll');
  const dwmapi = koffi.load('dwmapi.dll');
  const shell32 = koffi.load('shell32.dll');
  koffi.pointer('HWND', koffi.opaque());
  koffi.struct('RECT', { left: 'int32', top: 'int32', right: 'int32', bottom: 'int32' });
  koffi.proto('bool __stdcall EnumWindowsProc(HWND hwnd, intptr_t lParam)');
  return {
    EnumWindows: user32.func('bool __stdcall EnumWindows(EnumWindowsProc *cb, intptr_t lParam)'),
    IsWindowVisible: user32.func('bool __stdcall IsWindowVisible(HWND h)'),
    IsIconic: user32.func('bool __stdcall IsIconic(HWND h)'),
    GetWindowRect: user32.func('bool __stdcall GetWindowRect(HWND h, _Out_ RECT *r)'),
    GetWindowLongW: user32.func('int32 __stdcall GetWindowLongW(HWND h, int idx)'),
    GetClassNameW: user32.func('int __stdcall GetClassNameW(HWND h, void *buf, int max)'),
    GetForegroundWindow: user32.func('HWND __stdcall GetForegroundWindow()'),
    GetAsyncKeyState: user32.func('int16 __stdcall GetAsyncKeyState(int vk)'),
    GetSystemMetrics: user32.func('int __stdcall GetSystemMetrics(int idx)'),
    DwmGetWindowAttribute: dwmapi.func(
      'long __stdcall DwmGetWindowAttribute(HWND h, uint32 attr, void *pv, uint32 cb)',
    ),
    SHQueryUserNotificationState: shell32.func(
      'long __stdcall SHQueryUserNotificationState(_Out_ int *state)',
    ),
  } as unknown as Api;
}

export class Win32Windows implements WindowProvider {
  readonly name = 'win32';
  private api: Api;
  private own = new Set<string>();
  private handles = new Map<string, Hwnd>();
  private readonly classBuf = Buffer.alloc(512);
  private readonly rectBuf = Buffer.alloc(16);
  private readonly intBuf = Buffer.alloc(4);

  /** `toDip` converts physical screen pixels to DIP (Electron's screen.screenToDipRect). */
  constructor(private readonly toDip: (r: Rect) => Rect) {
    this.api = loadApi();
  }

  static handleId(handle: Buffer): string {
    return handle.length >= 8
      ? handle.readBigUInt64LE(0).toString(16)
      : handle.readUInt32LE(0).toString(16);
  }

  setOwnWindows(ids: string[]): void {
    this.own = new Set(ids);
  }

  list(): WindowInfo[] {
    const raw: RawWindow[] = [];
    const handles = new Map<string, Hwnd>();
    this.api.EnumWindows((h) => {
      if (!this.api.IsWindowVisible(h)) return true;
      const id = (koffi.address(h) as bigint).toString(16);
      handles.set(id, h);
      const rect = this.rect(h);
      if (!rect) return true;
      raw.push({
        id,
        rect,
        className: this.className(h),
        visible: true,
        minimized: this.api.IsIconic(h),
        cloaked: this.cloaked(h),
        style: this.api.GetWindowLongW(h, GWL_STYLE) >>> 0,
        exStyle: this.api.GetWindowLongW(h, GWL_EXSTYLE) >>> 0,
      });
      return true;
    }, 0);
    this.handles = handles;
    return filterWindows(raw, this.own).map((w) => ({ id: w.id, bounds: this.toDip(w.rect) }));
  }

  bounds(id: string): Rect | null {
    const h = this.handles.get(id);
    if (!h || !this.api.IsWindowVisible(h) || this.api.IsIconic(h)) return null;
    const r = this.rect(h);
    return r ? this.toDip(r) : null;
  }

  fullscreen(): Rect[] {
    const fg = this.api.GetForegroundWindow();
    if (!fg || koffi.address(fg) === 0n) return [];
    const id = (koffi.address(fg) as bigint).toString(16);
    if (this.own.has(id) || isShellClass(this.className(fg))) return [];
    const state = [0];
    this.api.SHQueryUserNotificationState(state);
    const busy = [QUNS_BUSY, QUNS_RUNNING_D3D_FULL_SCREEN, QUNS_PRESENTATION_MODE].includes(
      state[0]!,
    );
    const r = this.rect(fg);
    // Main decides which display it covers; report the foreground rectangle when the shell says
    // something is fullscreen, or when it may cover a whole display on its own.
    return r && (busy || r.width >= 640) ? [this.toDip(r)] : [];
  }

  leftButtonDown(): boolean | null {
    const swapped = this.api.GetSystemMetrics(SM_SWAPBUTTON) !== 0;
    return (this.api.GetAsyncKeyState(swapped ? VK_RBUTTON : VK_LBUTTON) & 0x8000) !== 0;
  }

  /** Visible frame (without the invisible resize border), falling back to the window rect. */
  private rect(h: Hwnd): Rect | null {
    if (this.api.DwmGetWindowAttribute(h, DWMWA_EXTENDED_FRAME_BOUNDS, this.rectBuf, 16) === 0) {
      const l = this.rectBuf.readInt32LE(0);
      const t = this.rectBuf.readInt32LE(4);
      const r = this.rectBuf.readInt32LE(8);
      const b = this.rectBuf.readInt32LE(12);
      return { x: l, y: t, width: r - l, height: b - t };
    }
    const out: Record<string, number> = {};
    if (!this.api.GetWindowRect(h, out)) return null;
    return {
      x: out.left!,
      y: out.top!,
      width: out.right! - out.left!,
      height: out.bottom! - out.top!,
    };
  }

  private cloaked(h: Hwnd): boolean {
    if (this.api.DwmGetWindowAttribute(h, DWMWA_CLOAKED, this.intBuf, 4) !== 0) return false;
    return this.intBuf.readInt32LE(0) !== 0;
  }

  private className(h: Hwnd): string {
    const n = this.api.GetClassNameW(h, this.classBuf, 256);
    return n > 0 ? this.classBuf.toString('utf16le', 0, n * 2) : '';
  }
}
