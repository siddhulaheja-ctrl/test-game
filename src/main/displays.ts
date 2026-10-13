import { screen } from 'electron';
import type { DisplayInfo } from '../world/world';

/**
 * Where the displays come from: Electron's screen module, or a fixed list for tests
 * (BUDDY_FAKE_DISPLAYS, a JSON array of DisplayInfo) so multi-monitor code can run on one screen.
 */
export interface DisplaySource {
  list(): DisplayInfo[];
  onChange(cb: () => void): void;
}

export function realDisplays(): DisplaySource {
  return {
    list: () => {
      const primary = screen.getPrimaryDisplay().id;
      return screen.getAllDisplays().map((d) => ({
        id: d.id,
        bounds: { ...d.bounds },
        workArea: { ...d.workArea },
        primary: d.id === primary,
      }));
    },
    onChange: (cb) => {
      screen.on('display-added', cb);
      screen.on('display-removed', cb);
      screen.on('display-metrics-changed', cb);
    },
  };
}

/** Displays for tests; `set` replaces them (like a taskbar hiding or a monitor being added). */
export interface FakeDisplaySource extends DisplaySource {
  set(list: DisplayInfo[]): void;
}

export function fakeDisplays(json: string): FakeDisplaySource {
  let list = JSON.parse(json) as DisplayInfo[];
  const listeners: (() => void)[] = [];
  return {
    list: () => list.map((d, i) => ({ ...d, primary: d.primary ?? i === 0 })),
    onChange: (cb) => listeners.push(cb),
    set: (next) => {
      list = next;
      for (const cb of listeners) cb();
    },
  };
}
