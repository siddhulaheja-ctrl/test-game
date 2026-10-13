import { expect, test, type Page } from '@playwright/test';

/**
 * Stage 2 checks on the simulated desktop (two monitors, fake windows, both characters), stepped
 * deterministically in the playground's test mode.
 */

interface PetInfo {
  id: string;
  state: string;
  x: number;
  y: number;
  contact: string;
  windowId: string | null;
  history: string[];
}

async function open(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1500, height: 640 });
  await page.goto('/playground/index.html?test=1&seed=11');
  await page.waitForFunction(
    () => (window as unknown as { playground?: { ready: boolean } }).playground?.ready,
  );
}

/** Run code against `window.playground` (as `pg`). */
const pg = <R>(page: Page, body: string) =>
  page.evaluate((b) => {
    const w = window as unknown as { playground: unknown };
    return new Function('pg', b)(w.playground) as R;
  }, body);

const pets = (page: Page) =>
  pg<PetInfo[]>(
    page,
    `return pg.stage.pets.map((p) => ({
      id: p.id, state: p.state, x: p.mover.x, y: p.mover.y, contact: p.mover.contact.kind,
      windowId: p.mover.contact.kind === 'surface' ? p.mover.contact.surface.windowId : null,
      history: [...p.brain.history],
    }))`,
  );
const pet = async (page: Page, id: string) => (await pets(page)).find((p) => p.id === id)!;

test.beforeEach(async ({ page }) => open(page));

test('the playground desktop with both characters', async ({ page }) => {
  await pg(page, 'pg.step(0.5)');
  await expect(page.locator('#wrap')).toHaveScreenshot('playground-start.png');
});

test('a pet rides a window that is dragged, and falls when it closes', async ({ page }) => {
  await pg(page, `pg.place('cat', 400, 430); pg.step(0.1)`);
  const before = await pet(page, 'cat');
  expect(before.windowId).not.toBeNull();
  const win = before.windowId!;
  await pg(
    page,
    `const w = pg.windows().find((q) => q.id === '${win}');
    for (let i = 1; i <= 20; i++) { pg.moveWindow('${win}', w.bounds.x + i * 6, w.bounds.y - i * 3); pg.step(1 / 60); }`,
  );
  const after = await pet(page, 'cat');
  expect(after.windowId).toBe(win);
  expect(after.y).toBeCloseTo(before.y - 60, 0);
  await pg(page, `pg.closeWindow('${win}'); pg.step(0.05)`);
  expect((await pet(page, 'cat')).state).toBe('fall');
  await pg(page, 'pg.step(1.5)');
  const landed = await pet(page, 'cat');
  expect(landed.contact).toBe('surface');
  expect(landed.history).toContain('fall');
});

test('picking a pet up dangles it, and letting go throws it', async ({ page }) => {
  await pg(page, `pg.place('cat', 300, 852); pg.step(0.2)`);
  await pg(
    page,
    `const c = pg.stage.pet('cat').center; pg.down(c.x, c.y - 20);
     for (let i = 0; i < 12; i++) { pg.cursor(c.x + i * 25, c.y - 20 - i * 25); pg.step(1 / 60); }`,
  );
  expect((await pet(page, 'cat')).state).toBe('held');
  await pg(page, 'pg.step(0.3)');
  await expect(page.locator('#wrap')).toHaveScreenshot('playground-held.png');
  await pg(
    page,
    `for (let i = 0; i < 20; i++) { pg.cursor(600 + i * 45, 400 - i * 6); pg.step(1 / 60); }
     pg.up(1500, 280); pg.step(0.1)`,
  );
  const flying = await pet(page, 'cat');
  expect(flying.state).toBe('fall');
  await pg(page, 'pg.step(3)');
  const landed = await pet(page, 'cat');
  expect(landed.contact).toBe('surface');
  expect(landed.x).toBeGreaterThan(1440); // thrown over to the second monitor
});

test('a pet climbs a window side to reach a high title bar', async ({ page }) => {
  await pg(
    page,
    `pg.stage.removePet('pekka'); pg.place('cat', 560, 852); pg.goTo('cat', 900, 250)`,
  );
  const seen = new Set<string>();
  for (let i = 0; i < 30; i++) {
    await pg(page, 'pg.step(0.25)');
    seen.add((await pet(page, 'cat')).state);
  }
  expect(seen).toContain('climb');
  const cat = await pet(page, 'cat');
  expect(cat.y).toBe(250);
});

test('the pets wander for 10 simulated minutes while windows are shuffled', async ({ page }) => {
  const result = await pg<{ states: string[]; bad: string | null }>(
    page,
    `const states = new Set(); let bad = null;
     for (let t = 0; t < 600; t += 0.5) {
       if (t % 20 === 0) {
         for (const w of pg.windows()) pg.moveWindow(w.id, w.bounds.x + ((t * 37) % 300) - 150, Math.max(120, w.bounds.y + ((t * 53) % 200) - 100));
       }
       pg.step(0.5);
       for (const p of pg.stage.pets) {
         states.add(p.state);
         const m = p.mover;
         if (!Number.isFinite(m.x) || !Number.isFinite(m.y) || m.y > 1090 || m.x < -300 || m.x > 3000) bad = p.id + ' at ' + m.x + ',' + m.y;
       }
     }
     return { states: [...states], bad };`,
  );
  expect(result.bad).toBeNull();
  expect(result.states).toEqual(expect.arrayContaining(['idle', 'walk', 'sit']));
  expect(result.states.length).toBeGreaterThanOrEqual(6);
});
