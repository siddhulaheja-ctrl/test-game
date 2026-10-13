import { expect, test, type Page } from '@playwright/test';

/**
 * Screenshot tests for the creature's look, rendered in the creature lab's deterministic test mode.
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
      const c = lab.creature;
      for (const a of acts) new Function('c', a)(c);
      if (s > 0) lab.step(s);
    },
    [opts, actions, step] as const,
  );
}

const stage = (page: Page) => page.locator('#stage-wrap');

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
  test(`expression: ${expression}`, async ({ page }) => {
    await show(page, { expression });
    await expect(stage(page)).toHaveScreenshot(`expr-${expression}.png`);
  });
}

test('palettes, eye styles and body shapes', async ({ page }) => {
  const combos = [
    { palette: 'mint', eyes: 'glossy', body: 'round' },
    { palette: 'peach', eyes: 'bean', body: 'bean' },
    { palette: 'lilac', eyes: 'mismatched', body: 'mochi' },
    { palette: 'midnight', eyes: 'lashes', body: 'drop' },
    { palette: 'lemon', eyes: 'glossy', body: 'round' },
  ];
  for (const c of combos) {
    await show(page, { appearance: { ...c, accessories: [] } });
    await expect(stage(page)).toHaveScreenshot(`look-${c.palette}-${c.eyes}-${c.body}.png`);
  }
});

test('accessories', async ({ page }) => {
  const sets = [['beanie', 'scarf'], ['glasses', 'bow'], ['crown', 'flower'], ['headphones']];
  for (const accessories of sets) {
    await show(page, {
      appearance: { palette: 'mint', eyes: 'glossy', body: 'round', accessories },
      expression: 'happy',
    });
    await expect(stage(page)).toHaveScreenshot(`acc-${accessories.join('-')}.png`);
  }
});

test('animations and particles', async ({ page }) => {
  const base = { appearance: { palette: 'mint', eyes: 'glossy', body: 'round', accessories: [] } };
  await show(page, { ...base, expression: 'happy' }, ['c.hop(1)'], 0.28);
  await expect(stage(page)).toHaveScreenshot('anim-hop-air.png');
  await show(page, { ...base, expression: 'sleepy' }, ['c.yawn()'], 1.3);
  await expect(stage(page)).toHaveScreenshot('anim-yawn.png');
  await show(
    page,
    { ...base, expression: 'excited' },
    ["c.emit('sparkle', 6)", "c.emit('heart', 4)"],
    0.45,
  );
  await expect(stage(page)).toHaveScreenshot('particles-sparkle-heart.png');
  await show(
    page,
    { ...base, expression: 'scared' },
    ["c.emit('sweat', 4)", "c.emit('exclaim')"],
    0.3,
  );
  await expect(stage(page)).toHaveScreenshot('particles-sweat-exclaim.png');
  await show(
    page,
    { ...base, expression: 'sleepy', face: { eyeOpen: 0 } },
    ["c.emit('zzz', 3)"],
    1.6,
  );
  await expect(stage(page)).toHaveScreenshot('particles-zzz.png');
  await show(
    page,
    { ...base, expression: 'curious' },
    ["c.emit('note', 5)", "c.emit('question')", "c.emit('dust', 6)"],
    0.4,
  );
  await expect(stage(page)).toHaveScreenshot('particles-note-question-dust.png');
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
  await page.getByRole('button', { name: 'heart' }).click();
  await page.locator('#stage').click({ position: { x: 300, y: 300 } });
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);
});
