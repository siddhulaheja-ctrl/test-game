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

export function fakeDisplays(json: string): DisplaySource {
  const list = JSON.parse(json) as DisplayInfo[];
  return {
    list: () => list.map((d, i) => ({ ...d, primary: d.primary ?? i === 0 })),
    onChange: () => {},
  };
}
