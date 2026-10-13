import { describe, expect, it } from 'vitest';
import { filterWindows, type RawWindow } from './windowProvider';

const WS_CAPTION = 0x00c00000;
const WS_POPUP = 0x80000000;
const raw = (id: string, over: Partial<RawWindow> = {}): RawWindow => ({
  id,
  rect: { x: 0, y: 0, width: 600, height: 400 },
  className: 'Chrome_WidgetWin_1',
  visible: true,
  minimized: false,
  cloaked: false,
  style: WS_CAPTION,
  exStyle: 0,
  ...over,
});

describe('filterWindows', () => {
  it('keeps ordinary app windows in z-order and drops everything a pet should ignore', () => {
    const kept = filterWindows(
      [
        raw('app'),
        raw('own'),
        raw('hidden', { visible: false }),
        raw('min', { minimized: true }),
        raw('cloaked', { cloaked: true }),
        raw('desktop', { className: 'Progman' }),
        raw('taskbar', { className: 'Shell_TrayWnd' }),
        raw('tool', { exStyle: 0x80 }),
        raw('menu', { style: WS_POPUP }),
        raw('tiny', { rect: { x: 0, y: 0, width: 40, height: 30 } }),
        raw('app2'),
      ],
      new Set(['own']),
    );
    expect(kept.map((w) => w.id)).toEqual(['app', 'app2']);
  });
});
