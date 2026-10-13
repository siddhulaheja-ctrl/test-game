import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import type { BuddyTestHooks } from '../src/main/testHooks';

/**
 * Stage 2 in the real app: two fake displays side by side and a scriptable fake window list, so
 * riding windows, falling, hand-over between displays, fullscreen hiding and dragging can be
 * checked on a single-screen CI machine.
 */

type Hooks = { __buddyTest: BuddyTestHooks };

interface PetInfo {
  id: string;
  state: string;
  behavior: string | null;
  x: number;
  y: number;
  contact: string;
  windowId: string | null;
}
interface OverlayHooks {
  pets(): PetInfo[];
  displayId(): number | null;
  hold(seconds: number): void;
  place(id: string, x: number, y: number, seconds?: number): boolean;
  goTo(id: string, x: number, y: number): boolean;
  ignoreRealCursor(): void;
  simulateCursor(x: number, y: number): void;
  petCenter(): { x: number; y: number };
}

const DISPLAYS = [
  {
    id: 1,
    bounds: { x: 0, y: 0, width: 800, height: 600 },
    workArea: { x: 0, y: 0, width: 800, height: 560 },
  },
  {
    id: 2,
    bounds: { x: 800, y: 0, width: 800, height: 600 },
    workArea: { x: 800, y: 0, width: 800, height: 560 },
  },
];
const FLOOR = 560;

let app: ElectronApplication;
let userData: string;

const hooks = <R>(fn: (h: BuddyTestHooks) => R) =>
  app.evaluate((_electron, src) => {
    const f = new Function('h', `return (${src})(h)`) as (h: unknown) => unknown;
    return f((globalThis as unknown as Hooks).__buddyTest);
  }, fn.toString()) as Promise<Awaited<R>>;

/** Run a function against an overlay's `__overlay` hooks. */
const ov = <R>(page: Page, fn: (o: OverlayHooks) => R) =>
  page.evaluate((src) => {
    const f = new Function('o', `return (${src})(o)`) as (o: unknown) => unknown;
    return f((window as unknown as { __overlay: unknown }).__overlay);
  }, fn.toString()) as Promise<Awaited<R>>;

/** The overlay page for a display. */
async function overlayFor(displayId: number): Promise<Page> {
  await expect
    .poll(async () => {
      for (const w of app.windows()) {
        if ((await w.evaluate(() => '__overlay' in window).catch(() => false)) === false) continue;
        if ((await ov(w, (o) => o.displayId())) === displayId) return true;
      }
      return false;
    })
    .toBe(true);
  for (const w of app.windows()) {
    if ((await w.evaluate(() => '__overlay' in window).catch(() => false)) === false) continue;
    if ((await ov(w, (o) => o.displayId())) === displayId) return w;
  }
  throw new Error(`no overlay for display ${displayId}`);
}

const pet = async (page: Page, id: string) =>
  (await ov(page, (o) => o.pets())).find((p) => p.id === id);

test.beforeEach(async () => {
  userData = fs.mkdtempSync(path.join(os.tmpdir(), 'buddy-e2e-'));
  app = await electron.launch({
    args: ['.', '--no-sandbox'],
    env: {
      ...process.env,
      BUDDY_E2E: '1',
      BUDDY_USER_DATA: userData,
      BUDDY_FAKE_WINDOWS: '1',
      BUDDY_FAKE_DISPLAYS: JSON.stringify(DISPLAYS),
    },
  });
  await app.firstWindow();
  await expect.poll(() => hooks((h) => h.overlays().length)).toBe(2);
  // CI's real pointer sits still mid-screen and the pets would play with it: ignore it.
  for (const id of [1, 2]) await ov(await overlayFor(id), (o) => o.ignoreRealCursor());
});

test.afterEach(async () => {
  let proc: ReturnType<ElectronApplication['process']> | undefined;
  try {
    proc = app?.process();
  } catch {
    proc = undefined;
  }
  if (proc && proc.exitCode === null) {
    const exited = new Promise<void>((resolve) => proc.once('exit', () => resolve()));
    await app.evaluate(({ app: a }) => a.exit(0)).catch(() => {});
    await Promise.race([exited, new Promise((r) => setTimeout(r, 5000))]);
    if (proc.exitCode === null) proc.kill('SIGKILL');
  }
  fs.rmSync(userData, { recursive: true, force: true });
});

test('one overlay per display, and both characters come out on the primary one', async () => {
  const overlays = await hooks((h) => h.overlays());
  expect(overlays.map((o) => o.bounds.x).sort((a, b) => a - b)).toEqual([0, 800]);
  const page = await overlayFor(1);
  await expect
    .poll(async () => (await ov(page, (o) => o.pets())).map((p) => p.id).sort())
    .toEqual(['cat', 'pekka']);
  expect(await hooks((h) => h.petOwners())).toEqual({ cat: 1, pekka: 1 });
});

test('a pet rides a window that moves, and falls when it closes', async () => {
  await hooks((h) =>
    h.setWindows([{ id: 'w1', bounds: { x: 100, y: 350, width: 400, height: 200 } }]),
  );
  const page = await overlayFor(1);
  await expect.poll(async () => (await pet(page, 'cat')) !== undefined).toBe(true);
  await expect.poll(() => ov(page, (o) => o.place('cat', 300, 350))).toBe(true);
  await expect.poll(async () => (await pet(page, 'cat'))?.windowId).toBe('w1');

  await hooks((h) =>
    h.setWindows([{ id: 'w1', bounds: { x: 150, y: 300, width: 400, height: 200 } }]),
  );
  await expect.poll(async () => (await pet(page, 'cat'))?.y).toBe(300);
  expect((await pet(page, 'cat'))?.x).toBeCloseTo(350, 0);

  await hooks((h) => h.setWindows([]));
  await expect.poll(async () => (await pet(page, 'cat'))?.y, { timeout: 5000 }).toBe(FLOOR);
  expect((await pet(page, 'cat'))?.windowId).toBeNull();
});

test('a pet walking onto the second display is handed over to its overlay', async () => {
  const one = await overlayFor(1);
  await expect.poll(async () => (await pet(one, 'cat')) !== undefined).toBe(true);
  await ov(one, (o) => o.place('cat', 700, 560, 1));
  await expect.poll(() => ov(one, (o) => o.goTo('cat', 1200, 560))).toBe(true);
  await expect.poll(() => hooks((h) => h.petOwners().cat), { timeout: 15000 }).toBe(2);
  const two = await overlayFor(2);
  await expect.poll(async () => (await pet(two, 'cat'))?.x ?? 0).toBeGreaterThan(800);
  expect(await pet(one, 'cat')).toBeUndefined();
});

test('a fullscreen app hides the overlay on its display, or quiets it if chosen', async () => {
  await hooks((h) => h.setFullscreen([{ x: 0, y: 0, width: 800, height: 600 }]));
  await expect.poll(() => hooks((h) => h.fullscreenDisplays())).toEqual([1]);
  await expect
    .poll(async () => (await hooks((h) => h.overlays())).map((o) => [o.displayId, o.visible]))
    .toEqual([
      [1, false],
      [2, true],
    ]);
  await hooks((h) => h.clickTrayItem('fullscreen-quiet'));
  await expect.poll(async () => (await hooks((h) => h.overlays()))[0]!.visible).toBe(true);
  await hooks((h) => h.setFullscreen([]));
  await expect.poll(() => hooks((h) => h.fullscreenDisplays())).toEqual([]);
});

test('the Characters menu adds and removes pets', async () => {
  const page = await overlayFor(1);
  await expect.poll(async () => (await ov(page, (o) => o.pets())).length).toBe(2);
  await hooks((h) => h.clickTrayItem('character-pekka'));
  await expect
    .poll(async () => (await ov(page, (o) => o.pets())).map((p) => p.id))
    .toEqual(['cat']);
  expect((await hooks((h) => h.state())).characters).toEqual(['cat']);
  await hooks((h) => h.clickTrayItem('character-pekka'));
  await expect.poll(async () => (await ov(page, (o) => o.pets())).length).toBe(2);
});

test('dragging a pet with the mouse picks it up, and letting go throws it', async () => {
  await hooks((h) => h.clickTrayItem('character-pekka'));
  const page = await overlayFor(1);
  await expect
    .poll(async () => (await ov(page, (o) => o.pets())).map((p) => p.id))
    .toEqual(['cat']);
  await ov(page, (o) => o.place('cat', 200, 560, 60));
  await page.waitForTimeout(600); // let any hop in progress land
  const c = await ov(page, (o) => o.petCenter());
  // The real pointer can't be moved in CI, so drive the overlay's own mouse handlers.
  const mouse = (type: 'move' | 'down' | 'up', x: number, y: number) =>
    page.evaluate(
      ([t, px, py]) => {
        const o = (
          window as unknown as { __overlay: { mouse(t: string, x: number, y: number): void } }
        ).__overlay;
        o.mouse(t, px, py);
      },
      [type, x, y] as const,
    );
  await mouse('move', c.x, c.y);
  await mouse('down', c.x, c.y);
  for (let i = 1; i <= 8; i++) await mouse('move', c.x + i * 10, c.y - i * 20);
  await expect.poll(async () => (await pet(page, 'cat'))?.state).toBe('held');
  expect(await hooks((h) => h.isInteractive())).toBe(true);
  for (let i = 1; i <= 6; i++) {
    await mouse('move', c.x + 80 + i * 40, c.y - 160);
    await page.waitForTimeout(16);
  }
  await mouse('up', c.x + 320, c.y - 160);
  // It may land on either display: find it wherever it ends up.
  const landed = async () => {
    const owner = (await hooks((h) => h.petOwners())).cat!;
    return pet(await overlayFor(owner), 'cat');
  };
  await expect.poll(async () => (await landed())?.contact, { timeout: 8000 }).toBe('surface');
  expect((await landed())!.x).toBeGreaterThan(c.x + 80);
});

test('pets can still be grabbed after a fullscreen app hid and showed the overlay', async () => {
  const page = await overlayFor(1);
  await expect.poll(async () => (await ov(page, (o) => o.pets())).length).toBe(2);
  await ov(page, (o) => o.hold(60));
  const hover = async () => {
    const c = await ov(page, (o) => o.petCenter());
    await page.evaluate(
      ([x, y]) => (window as unknown as { __overlay: OverlayHooks }).__overlay.simulateCursor(x, y),
      [c.x, c.y] as const,
    );
  };
  await hover();
  await expect.poll(() => hooks((h) => h.isInteractive())).toBe(true);

  // A fullscreen app comes up while the cursor is on a pet, then goes away.
  await hooks((h) => h.setFullscreen([{ x: 0, y: 0, width: 800, height: 600 }]));
  await expect.poll(async () => (await hooks((h) => h.overlays()))[0]!.visible).toBe(false);
  await hooks((h) => h.setFullscreen([]));
  await expect.poll(async () => (await hooks((h) => h.overlays()))[0]!.visible).toBe(true);

  await page.evaluate(() =>
    (window as unknown as { __overlay: OverlayHooks }).__overlay.simulateCursor(5, 5),
  );
  await hover();
  await expect.poll(() => hooks((h) => h.isInteractive())).toBe(true);
});

test('if another window covers a hovered pet, the overlay is put back on top', async () => {
  const page = await overlayFor(1);
  await expect.poll(async () => (await ov(page, (o) => o.pets())).length).toBe(2);
  await ov(page, (o) => o.hold(60));
  const before = await hooks((h) => h.raises());
  await hooks((h) => h.setCovered(true));
  const c = await ov(page, (o) => o.petCenter());
  await page.evaluate(
    ([x, y]) => (window as unknown as { __overlay: OverlayHooks }).__overlay.simulateCursor(x, y),
    [c.x, c.y] as const,
  );
  await expect.poll(() => hooks((h) => h.isInteractive())).toBe(true);
  // Main checks what is under the real cursor; point it at the pet through the test hook path.
  await app.evaluate(
    ({ screen }, [x, y]) => {
      (
        screen as unknown as { getCursorScreenPoint(): { x: number; y: number } }
      ).getCursorScreenPoint = () => ({ x, y });
    },
    [c.x, c.y] as const,
  );
  await expect.poll(() => hooks((h) => h.raises()), { timeout: 5000 }).toBeGreaterThan(before);
});

test('when the taskbar hides, the overlay is re-created and pets stay grabbable', async () => {
  const page = await overlayFor(1);
  await expect.poll(async () => (await ov(page, (o) => o.pets())).length).toBe(2);
  await ov(page, (o) => o.place('cat', 300, 560, 60));
  const before = await hooks((h) => h.overlayIds());

  // The taskbar on display 1 disappears: its work area grows to the full screen.
  const grown = DISPLAYS.map((d) =>
    d.id === 1 ? { ...d, workArea: { ...d.workArea, height: 600 } } : d,
  );
  await app.evaluate((_e, list) => {
    (globalThis as unknown as Hooks).__buddyTest.setDisplays(list);
  }, grown);

  await expect
    .poll(async () => (await hooks((h) => h.overlayIds())).join())
    .not.toBe(before.join());
  const fresh = await overlayFor(1);
  await ov(fresh, (o) => o.ignoreRealCursor());
  await expect
    .poll(async () => (await ov(fresh, (o) => o.pets())).map((p) => p.id).sort())
    .toEqual(['cat', 'pekka']);
  // The cat carried over (it fell to the new, lower floor) rather than being re-spawned elsewhere.
  await expect.poll(async () => (await pet(fresh, 'cat'))?.y, { timeout: 5000 }).toBe(600);
  expect(Math.abs((await pet(fresh, 'cat'))!.x - 300)).toBeLessThan(120);

  await ov(fresh, (o) => o.hold(60));
  const c = await ov(fresh, (o) => o.petCenter());
  await fresh.evaluate(
    ([x, y]) => (window as unknown as { __overlay: OverlayHooks }).__overlay.simulateCursor(x, y),
    [c.x, c.y] as const,
  );
  await expect.poll(() => hooks((h) => h.isInteractive())).toBe(true);
});
