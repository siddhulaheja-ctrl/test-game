import { describe, expect, it } from 'vitest';
import { Rng } from '../core/random';
import { World, type DisplayInfo, type WindowInfo } from '../world/world';
import { CursorSense } from './cursorSense';
import { Pet } from './pet';

const display = (id: number, x: number, w = 1400, h = 900): DisplayInfo => ({
  id,
  bounds: { x, y: 0, width: w, height: h },
  workArea: { x, y: 0, width: w, height: h - 40 },
  primary: id === 1,
});
const win = (id: string, x: number, y: number, width: number, height: number): WindowInfo => ({
  id,
  bounds: { x, y, width, height },
});

const DT = 1 / 60;
const run = (pet: Pet, seconds: number, quiet = false) => {
  for (let i = 0; i < Math.round(seconds / DT); i++) pet.update(DT, { quiet, others: [] });
};

function makePet(species: string, world: World, seed = 3) {
  const cursor = new CursorSense();
  return new Pet({ id: species, appearance: { species }, seed, world, cursor });
}

describe('Pet', () => {
  it('starts standing on the floor of the primary display', () => {
    const world = new World({ displays: [display(1, 0)], windows: [], safeZones: [] });
    const pet = makePet('cat', world);
    expect(pet.mover.contact.kind).toBe('surface');
    expect(pet.mover.y).toBe(860);
  });

  it('falls and lands with an impact when its window closes', () => {
    const w1 = new World({
      displays: [display(1, 0)],
      windows: [win('a', 300, 500, 400, 300)],
      safeZones: [],
    });
    const pet = makePet('pekka', w1);
    pet.mover.place(w1, 500, 500);
    expect(pet.surface?.windowId).toBe('a');
    pet.setWorld(new World({ displays: [display(1, 0)], windows: [], safeZones: [] }));
    expect(pet.state).toBe('fall');
    run(pet, 1.5);
    expect(pet.mover.contact.kind).toBe('surface');
    expect(pet.mover.y).toBe(860);
    expect(pet.lastImpact).toBeGreaterThan(300);
  });

  it('rides a window that moves', () => {
    const at = (x: number, y: number) =>
      new World({ displays: [display(1, 0)], windows: [win('a', x, y, 400, 300)], safeZones: [] });
    const pet = makePet('cat', at(300, 500));
    pet.mover.place(pet.world, 450, 500);
    pet.setWorld(at(380, 420));
    expect(pet.mover.x).toBe(530);
    expect(pet.mover.y).toBe(420);
    expect(pet.mover.contact.kind).toBe('surface');
  });

  it('is thrown with the hand velocity and bounces off the desktop edge', () => {
    const world = new World({ displays: [display(1, 0)], windows: [], safeZones: [] });
    const pet = makePet('cat', world);
    pet.grab({ x: 600, y: 400 });
    for (let i = 0; i < 10; i++) {
      pet.drag({ x: 600 + i * 30, y: 400 - i * 10 });
      pet.update(DT, { quiet: false, others: [] });
    }
    expect(pet.state).toBe('held');
    expect(pet.creature.motion.held).toBeGreaterThan(0.1);
    pet.release();
    expect(pet.state).toBe('fall');
    expect(pet.mover.vx).toBeGreaterThan(500);
    run(pet, 4);
    expect(pet.mover.contact.kind).toBe('surface');
    expect(pet.mover.x).toBeLessThanOrEqual(1400);
  });

  it('is not startled when the cursor dashes onto it (reaching to pick it up)', () => {
    const world = new World({ displays: [display(1, 0)], windows: [], safeZones: [] });
    const pet = makePet('cat', world);
    run(pet, 0.5);
    const { x, y } = pet.center;
    for (let i = 0; i < 6; i++) {
      pet.cursor.feed({ x: x - 300 + i * 60, y });
      pet.cursor.update(1 / 60);
    }
    pet.update(DT, { quiet: false, others: [] });
    expect(pet.brain.history).not.toContain('react:startled');
  });

  it('runs away from a cursor that zooms past it', () => {
    const world = new World({ displays: [display(1, 0)], windows: [], safeZones: [] });
    const pet = makePet('cat', world);
    run(pet, 0.5);
    const { x, y } = pet.center;
    for (let i = 0; i < 6; i++) {
      pet.cursor.feed({ x: x - 120, y: y - 240 + i * 60 });
      pet.cursor.update(1 / 60);
    }
    pet.update(DT, { quiet: false, others: [] });
    expect(pet.brain.history).toContain('react:startled');
    run(pet, 1);
    expect(pet.brain.current?.name).toBe('flee');
  });

  it('stops and looks up when the cursor rests on it, so it can be picked up', () => {
    const world = new World({ displays: [display(1, 0)], windows: [], safeZones: [] });
    const pet = makePet('cat', world);
    pet.brain.interrupt(pet);
    run(pet, 0.2);
    const { x, y } = pet.center;
    pet.cursor.feed({ x: x + 5, y });
    pet.update(DT, { quiet: false, others: [] });
    expect(pet.brain.current?.name).toBe('noticed');
    const before = pet.mover.x;
    run(pet, 2);
    expect(pet.mover.x).toBe(before);
  });
});

describe('hand-over between displays', () => {
  it('a restored pet carries on to where it was heading', () => {
    const world = new World({
      displays: [display(1, 0), display(2, 1400)],
      windows: [],
      safeZones: [],
    });
    const pet = makePet('cat', world);
    pet.mover.place(world, 1300, 860);
    const snap = { ...pet.snapshot(), heading: { x: 2200, y: 860 } };
    const restored = Pet.restore(snap, world, new CursorSense());
    expect(restored.brain.current?.name).toBe('trip');
    const trip = restored.brain.current;
    for (let i = 0; i < 20 * 60 && restored.brain.current === trip; i++) {
      restored.update(DT, { quiet: false, others: [] });
    }
    expect(restored.mover.x).toBeCloseTo(2200, 0);
  });
});

describe('a long wander on a busy desktop', () => {
  for (const species of ['cat', 'pekka']) {
    it(`${species} survives 12 minutes of windows moving, closing and the cursor`, () => {
      const rng = new Rng(42);
      const displays = [display(1, 0), display(2, 1400, 1280, 1024)];
      let windows: WindowInfo[] = [
        win('a', 200, 420, 500, 300),
        win('b', 600, 250, 420, 500),
        win('c', 1600, 500, 500, 350),
      ];
      const safeZones = [{ x: 1000, y: 660, width: 400, height: 200 }];
      const build = () => new World({ displays, windows, safeZones });
      const pet = makePet(species, build(), 9);
      const states = new Set<string>();
      let sameBehaviour = 0;
      let last: unknown = null;
      for (let t = 0; t < 12 * 60; t += DT) {
        // Every ~4 s something happens to the desktop.
        if (rng.chance(DT / 4)) {
          const r = rng.next();
          if (r < 0.5 && windows.length) {
            const w = rng.pick(windows);
            windows = windows.map((q) =>
              q === w
                ? win(
                    q.id,
                    q.bounds.x + rng.range(-200, 200),
                    Math.max(80, q.bounds.y + rng.range(-150, 150)),
                    q.bounds.width,
                    q.bounds.height,
                  )
                : q,
            );
          } else if (r < 0.7 && windows.length > 1) {
            windows = windows.filter((q) => q !== windows[0]);
          } else {
            windows = [
              win(
                `n${Math.floor(t)}`,
                rng.range(0, 2300),
                rng.range(150, 600),
                rng.range(250, 600),
                rng.range(200, 400),
              ),
              ...windows,
            ];
          }
          pet.setWorld(build());
        }
        // The cursor drifts about, now and then dashing.
        if (rng.chance(DT * 2)) {
          pet.cursor.feed({ x: rng.range(0, 2680), y: rng.range(0, 1000) });
        }
        pet.cursor.update(DT);
        pet.update(DT, { quiet: false, others: [] });

        const m = pet.mover;
        states.add(pet.state);
        expect(Number.isFinite(m.x) && Number.isFinite(m.y)).toBe(true);
        // Inside the desktop (peeking and hiding may lean past the edge by a few body widths).
        expect(m.x).toBeGreaterThan(-m.size.halfWidth * 4);
        expect(m.x).toBeLessThan(2680 + m.size.halfWidth * 4);
        expect(m.y).toBeLessThan(1030);
        if (m.contact.kind === 'surface') {
          const s = m.contact.surface;
          expect(m.y).toBe(s.y);
        }
        sameBehaviour = pet.brain.current === last ? sameBehaviour + DT : 0;
        last = pet.brain.current;
        expect(sameBehaviour).toBeLessThan(100); // never stuck
      }
      for (const s of ['idle', 'walk', 'sit', 'jump']) expect(states).toContain(s);
      expect(states.size).toBeGreaterThanOrEqual(7);
      if (process.env.PET_LOG) console.info(species, [...states], pet.brain.history.join(' '));
    });
  }
});
