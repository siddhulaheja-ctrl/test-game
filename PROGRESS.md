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

## Stage 1: The body ✅

- **Shared creature engine** for every character:
  - squash and stretch, hops with anticipation and dust on landing, pokes, a stiffness-scaled spring ring, optional verlet dangly chains, hover for floating characters
  - idle life from a seeded RNG: breathing, random blinks (sometimes double), eye saccades, fidgets (wiggle, bounce, sway, look around, wave, blep), yawns
  - nine blendable expressions (neutral, happy, sad, sleepy, surprised, annoyed, curious, excited, scared) on 16 face values, plus short reactions that fade back to the base mood
  - particles: sparkles, hearts, sweat, zzz, music notes, dust, "!", "?" and butterflies
- **Character system** (`src/creature/species/`): each character supplies its envelope, palettes (generic colour roles), stiffness, resting face bias and renderer. The lab has a character picker.
- **P.E.K.K.A (fan version)**, replicating the owner's reference art: rounded helmet with triangular eye sockets and ringed eyes, crescent horns, faceted chest plate with a gem plaque, spiked shoulder spheres, twin striped swords, far-apart disc feet. Five palettes: Reference Steel, Classic Violet, Arena Blue, Arena Red, Max Level Amber. Expressions show through the eye sockets (slant, size, squint, blink), a blush under the sockets, eye glints when excited, and the swords (raised when excited or surprised, sagging when sad or sleepy). Blink, yawn, fidgets, hop and poke all work. Screenshot tests cover all nine expressions, every palette, animations and particles at 1x and 2x.
- **Creature lab** (`npm run lab`, or "Creature Lab…" in the tray): character and palette pickers, expression buttons and blend sliders, manual face sliders, buttons for every animation, fidget, look direction and particle, background, zoom, slow motion, pause and step. Settings survive hot reloads.
- The overlay shows the character; click it to poke it. Quiet Mode dims it, calms fidgets and turns off particles.
- **History:** the first character, Glorp (a jelly blob), was removed at the owner's request, and the app was renamed **Desktop Buddy**.

## Next

- Next character: chosen by the owner.
- Stage 2: movement and screen interaction (behaviour state machine, walking, jumping, `WindowProvider` for Windows, cursor play, dragging and throwing, multiple monitors, fullscreen detection).

## Known issues

- On Linux, `setIgnoreMouseEvents(..., { forward: true })` does not forward mouse moves, so hover detection relies on main's 30 Hz cursor polling. Windows and macOS get both.
- Under X11 with no window manager (CI), the overlay comes out 1px smaller than the work area. The test allows for it.
- Performance is not measured on Windows yet. In the Linux dev container (Xvfb, software GL) the debug overlay showed about 11% CPU and 556 MB summed across all Electron processes, far above the budget (under 3% idle CPU, 150 MB RAM). Those numbers include software rendering and aren't representative, but the budget is unproven until it's measured on real Windows hardware. Stage 9 covers profiling and cuts (lighter idle loop, GPU flags, process count).
- Screenshot baselines are kept per platform (`e2e/__screenshots__/<platform>/`). Only Linux baselines are committed, so on Windows run `npm run test:e2e:update` once to record local ones.
