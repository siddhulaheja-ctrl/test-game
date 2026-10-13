import { defineConfig, devices } from '@playwright/test';

/**
 * Two projects:
 * - "lab": renders the creature lab in Chromium (served by `vite preview`) for screenshot tests at 1x and 2x.
 * - "electron": launches the real Electron app for smoke tests (tray, click-through, quit).
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01 } },
  reporter: [['list']],
  snapshotPathTemplate: '{testDir}/__screenshots__/{platform}/{projectName}/{arg}{ext}',
  webServer: {
    command: 'npx vite build && npx vite preview',
    url: 'http://localhost:4173/lab/index.html',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'lab-1x',
      testMatch: /lab\..*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], deviceScaleFactor: 1, baseURL: 'http://localhost:4173' },
    },
    {
      name: 'lab-2x',
      testMatch: /lab\..*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], deviceScaleFactor: 2, baseURL: 'http://localhost:4173' },
    },
    {
      name: 'electron',
      testMatch: /electron\..*\.spec\.ts/,
    },
  ],
});
