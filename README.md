# Glorp

A living desktop companion. Glorp is a small jelly creature drawn entirely in code. It sits on top of your desktop in a transparent window, and clicks pass straight through everywhere except on Glorp itself.

> Status: early development. See [`PROGRESS.md`](PROGRESS.md) for what works today and [`DECISIONS.md`](DECISIONS.md) for why things are built the way they are.

## Requirements

- Node.js 22+
- Windows 10/11 (main target). macOS and Linux run but have fewer OS integrations.

## Getting started

```bash
npm install
npm run dev      # Electron + hot reload (renderer HMR, main/preload auto-restart)
```

Glorp appears near the bottom-right of your primary screen, with an icon in the system tray:

| Tray item         | What it does                                                                |
| ----------------- | --------------------------------------------------------------------------- |
| Hide / Show Glorp | Removes Glorp from the desktop (left-clicking the tray icon does the same). |
| Quiet Mode        | Glorp dims and stays calm.                                                  |
| Debug Overlay     | FPS, CPU and RAM in the top-left corner.                                    |
| Creature Lab…     | Opens the lab, with sliders and buttons for every expression and animation. |
| Quit Glorp        | Exits.                                                                      |

To work on visuals in a plain browser without Electron:

```bash
npm run lab      # opens http://localhost:5173/lab/index.html
```

## Scripts

| Script                    | Purpose                                                                                                     |
| ------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `npm run dev`             | Development app with hot reload.                                                                            |
| `npm start`               | Production build, then launch.                                                                              |
| `npm run lab`             | Creature lab in the browser.                                                                                |
| `npm test`                | Unit tests (Vitest).                                                                                        |
| `npm run test:e2e`        | Playwright: lab screenshots at 1x and 2x, plus Electron smoke tests. On Linux CI, wrap it in `xvfb-run -a`. |
| `npm run test:e2e:update` | Re-record screenshot baselines (do this on your own machine after an intentional visual change).            |
| `npm run check`           | Typecheck, lint, format check and unit tests.                                                               |

## Privacy

Everything stays on your machine. Glorp never records what you type, what is on screen, or your clipboard. Senses that read activity (added in later stages) report **rates only** and can each be switched off.
