import { expect, test, type Page } from '@playwright/test';

/**
 * Screenshot tests for the characters, rendered in the creature lab's deterministic test mode.
 * They run in two projects (lab-1x and lab-2x) so both scales stay crisp.
 * Baselines are per platform: after an intentional visual change run `npm run test:e2e:update`.
 */

type ShowOpts = Record<string, unknown>;

async function open(page: Page): Promise<void> {
  await page.goto('/lab/index.html?test=1&zoom=1.5&seed=7');
  await page.waitForFunction(() => (window as unknown as { lab?: { ready: boolean } }).lab?.ready);
}

async function show(page: Page, opts: ShowOpts, actions: string[] = [], step = 0): Promise<void> {
  await page.evaluate(
    ([o, acts, s]) => {
      const lab = (
        window as unknown as {
          lab: { show(o: unknown): void; step(s: number): void; creature: unknown };
        }
      ).lab;
      lab.show(o);
      for (const a of acts) new Function('c', a)(lab.creature);
      if (s > 0) lab.step(s);
    },
    [opts, actions, step] as const,
  );
}

const stage = (page: Page) => page.locator('#stage-wrap');
const PEKKA = { species: 'pekka', palette: 'steel' };
const CAT = { species: 'cat', palette: 'midnight' };

test.beforeEach(async ({ page }) => open(page));

const EXPRESSIONS = [
  'neutral',
  'happy',
  'sad',
  'sleepy',
  'surprised',
  'annoyed',
  'curious',
  'excited',
  'scared',
];

for (const expression of EXPRESSIONS) {
  test(`pekka expression: ${expression}`, async ({ page }) => {
    await show(page, { appearance: PEKKA, expression });
    await expect(stage(page)).toHaveScreenshot(`pekka-expr-${expression}.png`);
  });
}

test('pekka palettes', async ({ page }) => {
  for (const palette of ['steel', 'violet', 'arenaBlue', 'arenaRed', 'amber']) {
    await show(page, { appearance: { species: 'pekka', palette } });
    await expect(stage(page)).toHaveScreenshot(`pekka-palette-${palette}.png`);
  }
});

test('pekka animations and particles', async ({ page }) => {
  await show(page, { appearance: PEKKA, expression: 'happy' }, ['c.hop(1)'], 0.28);
  await expect(stage(page)).toHaveScreenshot('pekka-anim-hop-air.png');
  await show(page, { appearance: PEKKA, expression: 'sleepy' }, ['c.yawn()'], 1.3);
  await expect(stage(page)).toHaveScreenshot('pekka-anim-yawn.png');
  await show(page, { appearance: PEKKA, expression: 'happy' }, ["c.emit('butterfly', 4)"], 0.9);
  await expect(stage(page)).toHaveScreenshot('pekka-particles-butterflies.png');
  await show(
    page,
    { appearance: PEKKA, expression: 'excited' },
    ["c.emit('sparkle', 6)", "c.emit('heart', 4)"],
    0.45,
  );
  await expect(stage(page)).toHaveScreenshot('pekka-particles-sparkle-heart.png');
  await show(
    page,
    { appearance: PEKKA, expression: 'scared' },
    ["c.emit('sweat', 4)", "c.emit('exclaim')"],
    0.3,
  );
  await expect(stage(page)).toHaveScreenshot('pekka-particles-sweat-exclaim.png');
  await show(
    page,
    { appearance: PEKKA, expression: 'sleepy', face: { eyeOpen: 0 } },
    ["c.emit('zzz', 3)"],
    1.6,
  );
  await expect(stage(page)).toHaveScreenshot('pekka-particles-zzz.png');
});

for (const expression of EXPRESSIONS) {
  test(`cat expression: ${expression}`, async ({ page }) => {
    await show(page, { appearance: CAT, expression });
    await expect(stage(page)).toHaveScreenshot(`cat-expr-${expression}.png`);
  });
}

test('cat palettes', async ({ page }) => {
  for (const palette of ['midnight', 'emerald', 'copper', 'oddEyes', 'smoke']) {
    await show(page, { appearance: { species: 'cat', palette } });
    await expect(stage(page)).toHaveScreenshot(`cat-palette-${palette}.png`);
  }
});

test('cat animations', async ({ page }) => {
  await show(page, { appearance: CAT, expression: 'sleepy' }, ['c.yawn()'], 1.3);
  await expect(stage(page)).toHaveScreenshot('cat-anim-yawn.png');
  await show(page, { appearance: CAT, expression: 'neutral' }, ["c.fidget('blep')"], 0.7);
  await expect(stage(page)).toHaveScreenshot('cat-anim-blep.png');
  await show(page, { appearance: CAT, expression: 'happy' }, ["c.fidget('wave')"], 0.6);
  await expect(stage(page)).toHaveScreenshot('cat-anim-beckon.png');
  await show(page, { appearance: CAT, expression: 'happy', face: { eyeOpen: 0 } });
  await expect(stage(page)).toHaveScreenshot('cat-anim-happy-closed.png');
  await show(page, { appearance: CAT, expression: 'happy' }, ['c.hop(1)'], 0.28);
  await expect(stage(page)).toHaveScreenshot('cat-anim-hop-air.png');
});

test('rendering is crisp: the canvas backing store matches the device pixel ratio', async ({
  page,
}) => {
  const r = await page.evaluate(() => {
    const c = document.getElementById('stage') as HTMLCanvasElement;
    return { w: c.width, cssW: c.clientWidth, dpr: window.devicePixelRatio };
  });
  expect(r.w).toBe(Math.round(r.cssW * r.dpr));
});

test('the interactive lab builds its controls without errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/lab/index.html');
  await page.waitForFunction(() => (window as unknown as { lab?: { ready: boolean } }).lab?.ready);
  await expect(page.locator('#controls button')).not.toHaveCount(0);
  await page.getByRole('button', { name: 'excited', exact: true }).click();
  await page.getByRole('button', { name: 'Big hop' }).click();
  await page.getByRole('button', { name: 'butterfly' }).click();
  await page.locator('#stage').click({ position: { x: 300, y: 300 } });
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);
});
