import { describe, expect, it } from 'vitest';
import { subtractInterval, mergeIntervals } from './geometry';
import { planRoute, type Reach } from './route';
import { World, type DisplayInfo, type WindowInfo } from './world';

const display = (id: number, x: number, w = 1000, h = 800, taskbar = 40): DisplayInfo => ({
  id,
  bounds: { x, y: 0, width: w, height: h },
  workArea: { x, y: 0, width: w, height: h - taskbar },
});
const win = (id: string, x: number, y: number, width: number, height: number): WindowInfo => ({
  id,
  bounds: { x, y, width, height },
});

const reach: Reach = {
  halfWidth: 30,
  jumpUp: 200,
  jumpAcross: 160,
  canClimb: true,
  walkSpeed: 100,
  climbSpeed: 80,
};

describe('geometry', () => {
  it('subtracts and merges intervals', () => {
    expect(subtractInterval([[0, 100]], [20, 30])).toEqual([
      [0, 20],
      [30, 100],
    ]);
    expect(subtractInterval([[0, 100]], [-5, 200])).toEqual([]);
    expect(
      mergeIntervals([
        [50, 60],
        [0, 10],
        [10, 20],
      ]),
    ).toEqual([
      [0, 20],
      [50, 60],
    ]);
  });
});

describe('World', () => {
  it('has a floor per display and joins floors of neighbouring displays at the same height', () => {
    const w = new World({
      displays: [display(1, 0), display(2, 1000)],
      windows: [],
      safeZones: [],
    });
    const floors = w.surfaces.filter((s) => s.windowId === null);
    expect(floors).toHaveLength(1);
    expect([floors[0]!.x1, floors[0]!.x2, floors[0]!.y]).toEqual([0, 2000, 760]);
  });

  it('keeps floors of displays with different taskbar heights separate', () => {
    const w = new World({
      displays: [display(1, 0), display(2, 1000, 1000, 800, 60)],
      windows: [],
      safeZones: [],
    });
    expect(w.surfaces.map((s) => s.y).sort()).toEqual([740, 760]);
  });

  it('turns visible window tops into surfaces, cut where a window above covers them', () => {
    const w = new World({
      displays: [display(1, 0)],
      // "front" is above "back" in z-order and covers the middle of its top edge.
      windows: [win('front', 300, 150, 200, 300), win('back', 100, 200, 600, 300)],
      safeZones: [],
    });
    const back = w.surfaces.filter((s) => s.windowId === 'back').map((s) => [s.x1, s.x2]);
    expect(back).toEqual([
      [100, 300],
      [500, 700],
    ]);
    expect(w.surfaces.find((s) => s.windowId === 'front')).toMatchObject({ x1: 300, x2: 500 });
  });

  it('skips window tops with no headroom (maximised windows)', () => {
    const w = new World({
      displays: [display(1, 0)],
      windows: [win('max', 0, 0, 1000, 760)],
      safeZones: [],
    });
    expect(w.surfaces.filter((s) => s.windowId)).toHaveLength(0);
  });

  it('marks safe zones as places to avoid', () => {
    const w = new World({
      displays: [display(1, 0)],
      windows: [],
      safeZones: [{ x: 700, y: 560, width: 300, height: 200 }],
    });
    const floor = w.surfaces[0]!;
    expect(floor.avoid).toEqual([[700, 1000]]);
    expect(w.isAvoided(floor, 800)).toBe(true);
    expect(w.restSpans(floor)).toEqual([[0, 700]]);
  });

  it('builds walls from window sides and finds landings', () => {
    const w = new World({
      displays: [display(1, 0)],
      windows: [win('a', 200, 300, 300, 200)],
      safeZones: [],
    });
    expect(w.walls.map((x) => [x.x, x.side])).toEqual([
      [200, -1],
      [500, 1],
    ]);
    expect(w.landingBetween(300, 100, 400)?.windowId).toBe('a');
    expect(w.landingBetween(100, 100, 900)?.windowId).toBeNull();
    expect(w.surfaceAt(300, 300)?.windowId).toBe('a');
  });
});

describe('planRoute', () => {
  const at = (w: World, windowId: string | null, x: number) => ({
    surface: w.surfaces.find((s) => s.windowId === windowId)!,
    x,
  });

  it('walks along one surface', () => {
    const w = new World({ displays: [display(1, 0)], windows: [], safeZones: [] });
    expect(planRoute(w, at(w, null, 100), at(w, null, 600), reach)).toEqual([
      expect.objectContaining({ kind: 'walk', x: 600 }),
    ]);
  });

  it('jumps onto a low window and drops back down', () => {
    const w = new World({
      displays: [display(1, 0)],
      windows: [win('a', 400, 620, 300, 200)],
      safeZones: [],
    });
    const up = planRoute(w, at(w, null, 100), at(w, 'a', 550), reach)!;
    expect(up.map((s) => s.kind)).toEqual(['jump', 'walk']);
    const down = planRoute(w, at(w, 'a', 550), at(w, null, 100), reach)!;
    expect(down.map((s) => s.kind)).toEqual(['jump', 'walk']);
    expect(down[0]!.x).toBeLessThan(450);
  });

  it('climbs a window side to reach a high title bar', () => {
    const w = new World({
      displays: [display(1, 0)],
      windows: [win('tall', 400, 200, 300, 560)],
      safeZones: [],
    });
    const r = planRoute(w, at(w, null, 100), at(w, 'tall', 550), reach)!;
    expect(r.map((s) => s.kind)).toEqual(['climb', 'walk']);
    const noClimb = planRoute(w, at(w, null, 100), at(w, 'tall', 550), {
      ...reach,
      canClimb: false,
    });
    expect(noClimb).toBeNull();
  });

  it('chains jumps across stacked windows', () => {
    const w = new World({
      displays: [display(1, 0)],
      windows: [win('low', 100, 600, 250, 200), win('high', 380, 450, 250, 200)],
      safeZones: [],
    });
    const r = planRoute(w, at(w, null, 50), at(w, 'high', 500), { ...reach, canClimb: false })!;
    expect(r.map((s) => s.kind)).toEqual(['jump', 'jump', 'walk']);
  });
});
