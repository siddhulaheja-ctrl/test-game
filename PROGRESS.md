# Progress

## Stage 0: Setup and decisions ✅

- Electron 44, TypeScript (strict), Vite, esbuild, Vitest, Playwright, ESLint and Prettier set up.
- `DECISIONS.md` records the architecture, `README.md` covers how to run it.
- A transparent, frameless, always-on-top overlay covers the primary display's work area, so the taskbar stays uncovered. It never takes focus and is hidden from the taskbar.
- Click-through everywhere except over the creature. The renderer hit-tests the cursor with hysteresis and switches `setIgnoreMouseEvents` only when the state changes.
- Tray icon, drawn in code: Show/Hide, Quiet Mode, Debug Overlay, Creature Lab, Quit. Left-click toggles visibility.
- Settings are saved to a versioned JSON file with atomic writes and rotating backups.
- Debug overlay shows FPS (with an idle indicator) and the app's total CPU and RAM.
- Fixed-step loop that drops its frame rate when idle and pauses while hidden.
- Tests: unit tests for the event bus, RNG, math, loop, persistence, store and interactivity. Electron smoke tests for window properties, click-through and the tray (Show/Hide, Quiet Mode, Quit), run under Xvfb.

## Next

- Stage 1: the body (procedural creature, springs, expressions, particles, customisation, creature lab).

## Known issues

- On Linux, `setIgnoreMouseEvents(..., { forward: true })` does not forward mouse moves, so hover detection relies on main's 30 Hz cursor polling. Windows and macOS get both.
- Under X11 with no window manager (CI), the overlay comes out 1px smaller than the work area. The test allows for it.
