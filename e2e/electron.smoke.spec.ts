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

type Hooks = { __buddyTest: BuddyTestHooks };

interface OverlayHooks {
  simulateCursor(x: number, y: number): void;
  petCenter(): { x: number; y: number };
  isInteractive(): boolean;
  hold(seconds: number): void;
  pets(): {
    id: string;
    state: string;
    x: number;
    y: number;
    contact: string;
    windowId: string | null;
  }[];
}

let app: ElectronApplication;
let overlay: Page;
let userData: string;

const hooks = <R>(fn: (h: BuddyTestHooks) => R) =>
  app.evaluate((_electron, src) => {
    const f = new Function('h', `return (${src})(h)`) as (h: unknown) => unknown;
    return f((globalThis as unknown as Hooks).__buddyTest);
  }, fn.toString()) as Promise<Awaited<R>>;

test.beforeEach(async () => {
  userData = fs.mkdtempSync(path.join(os.tmpdir(), 'buddy-e2e-'));
  app = await electron.launch({
    args: ['.', '--no-sandbox'],
    env: { ...process.env, BUDDY_E2E: '1', BUDDY_USER_DATA: userData },
  });
  overlay = await app.firstWindow();
  await overlay.waitForFunction(() => 'buddy' in window && '__overlay' in window);
  await expect.poll(() => hooks((h) => h.overlayVisible())).toBe(true);
});

test.afterEach(async () => {
  let proc: ReturnType<ElectronApplication['process']> | undefined;
  try {
    proc = app?.process();
  } catch {
    proc = undefined; // already closed (the Quit test)
  }
  if (proc && proc.exitCode === null) {
    const exited = new Promise<void>((resolve) => proc.once('exit', () => resolve()));
    await app.evaluate(({ app: a }) => a.exit(0)).catch(() => {});
    await Promise.race([exited, new Promise((r) => setTimeout(r, 5000))]);
    if (proc.exitCode === null) proc.kill('SIGKILL');
  }
  fs.rmSync(userData, { recursive: true, force: true });
});

test('overlay is a transparent, frameless, always-on-top window over the work area', async () => {
  const props = await app.evaluate(({ BrowserWindow, screen }) => {
    const w = BrowserWindow.getAllWindows()[0]!;
    return {
      onTop: w.isAlwaysOnTop(),
      focusable: w.isFocusable(),
      bounds: w.getBounds(),
      workArea: screen.getPrimaryDisplay().workArea,
      bg: w.getBackgroundColor(),
    };
  });
  expect(props.onTop).toBe(true);
  expect(props.focusable).toBe(false);
  // Within 2px: X11 without a window manager (CI) shaves a pixel off screen-sized windows.
  for (const k of ['x', 'y', 'width', 'height'] as const) {
    expect(Math.abs(props.bounds[k] - props.workArea[k])).toBeLessThanOrEqual(2);
  }
  expect(props.bg.toLowerCase()).toMatch(/^#0{8}$|^#0{6}$/);
});

test('clicks pass through except over the creature', async () => {
  expect(await hooks((h) => h.isInteractive())).toBe(false);
  await overlay.waitForFunction(
    () => (window as unknown as { __overlay: OverlayHooks }).__overlay.pets().length > 0,
  );
  await overlay.evaluate(() =>
    (window as unknown as { __overlay: OverlayHooks }).__overlay.hold(30),
  );
  const c = await overlay.evaluate(() =>
    (window as unknown as { __overlay: OverlayHooks }).__overlay.petCenter(),
  );
  await overlay.evaluate(
    ([x, y]) => (window as unknown as { __overlay: OverlayHooks }).__overlay.simulateCursor(x, y),
    [c.x, c.y] as const,
  );
  await expect.poll(() => hooks((h) => h.isInteractive())).toBe(true);
  await overlay.evaluate(() =>
    (window as unknown as { __overlay: OverlayHooks }).__overlay.simulateCursor(5, 5),
  );
  await expect.poll(() => hooks((h) => h.isInteractive())).toBe(false);
});

test('tray menu has Show/Hide, Quiet Mode and Quit, and they work', async () => {
  const ids = (await hooks((h) => h.trayMenu())).map((i) => i.id);
  expect(ids).toEqual(expect.arrayContaining(['toggle-visible', 'quiet-mode', 'quit']));

  await hooks((h) => h.clickTrayItem('toggle-visible'));
  await expect.poll(() => hooks((h) => h.overlayVisible())).toBe(false);
  await hooks((h) => h.clickTrayItem('toggle-visible'));
  await expect.poll(() => hooks((h) => h.overlayVisible())).toBe(true);

  await hooks((h) => h.clickTrayItem('quiet-mode'));
  expect((await hooks((h) => h.state())).quietMode).toBe(true);
  const saved = JSON.parse(fs.readFileSync(path.join(userData, 'settings.json'), 'utf8'));
  expect(saved.data.quietMode).toBe(true);

  const closed = new Promise<void>((resolve) => app.process().once('exit', () => resolve()));
  await hooks((h) => h.clickTrayItem('quit')).catch(() => {});
  await closed;
});
