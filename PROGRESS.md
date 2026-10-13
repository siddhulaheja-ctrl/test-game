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

- Glorp is drawn entirely in code. The body is a soft ring of 20 radial springs, drawn as a smooth closed spline.
  - Shading: light/body/shade gradient, ground occlusion, pale belly, freckles, an inner-edge shadow, bounce light, a big soft highlight plus a sharp glint, and a thick rounded outline.
  - Small feet and nub arms. Two verlet antennae with glowing bobbles; the left one is always a bit floppier.
- Squash and stretch on hops (crouch, launch, airborne stretch, landing squash with dust), pokes and fidgets. The jelly wobbles locally, and the face lags slightly behind the body.
- Idle life, all from a seeded RNG:
  - breathing, slower and deeper when sleepy
  - random blinks with occasional doubles
  - eye saccades, plus face parallax toward where it looks
  - fidgets: wiggle, bounce, sway, look around, wave, blep
  - yawns, more frequent when sleepy
- Nine expressions (neutral, happy, sad, sleepy, surprised, annoyed, curious, excited, scared) on 16 parametric face values. Any mix blends exactly, and short reactions fade back to the base mood.
- Particles: sparkles, hearts, sweat, zzz, music notes, dust, "!" and "?".
- Customisation model, validated and saveable:
  - 5 palettes: Pond Mint, Peach Fuzz, Lilac Dream, Midnight Jelly, Lemon Drop
  - 4 eye styles: glossy, bean, mismatched (heterochromia), lashes
  - 4 body shapes: classic, tall bean, squishy mochi, droplet
  - 7 accessories, one per slot: knit beanie with a spring pom-pom, tiny crown, headphones, round glasses, striped scarf with a dangling tail, ribbon bow, antenna daisy
  - a size option for the accessibility "large creature" setting later
- Creature lab (`npm run lab`, or "Creature Lab…" in the tray):
  - appearance pickers
  - expression buttons (Shift-click for a short reaction) and blend sliders
  - manual sliders for every face value
  - buttons for every animation, fidget, look direction and particle
  - background, zoom, slow motion, pause and step
  - settings survive hot reloads
- The overlay now shows the real Glorp in place of the placeholder. Click it to poke it. Quiet Mode dims it, calms the fidgets and turns off particles. The frame rate drops to the idle rate once it stops moving.
- Tests:
  - 56 unit tests covering expression blending, the mixer, soft-ring stability, blink and yawn statistics, determinism, particles, hop physics, antenna lag and appearance validation
  - 26 lab screenshot tests (13 per project: 1x and 2x) covering every expression, palette, eye style, body shape, accessory, animation and particle type
  - checks that canvas resolution matches the device pixel ratio, and a lab smoke test

## Next

- Stage 2: movement and screen interaction (behaviour state machine, walking, jumping, `WindowProvider` for Windows, cursor play, dragging and throwing, multiple monitors, fullscreen detection).

## Known issues

- On Linux, `setIgnoreMouseEvents(..., { forward: true })` does not forward mouse moves, so hover detection relies on main's 30 Hz cursor polling. Windows and macOS get both.
- Under X11 with no window manager (CI), the overlay comes out 1px smaller than the work area. The test allows for it.
- Performance is not measured on Windows yet. In the Linux dev container (Xvfb, software GL) the debug overlay showed about 11% CPU and 556 MB summed across all Electron processes, far above the budget (under 3% idle CPU, 150 MB RAM). Those numbers include software rendering and aren't representative, but the budget is unproven until it's measured on real Windows hardware. Stage 9 covers profiling and cuts (lighter idle loop, GPU flags, process count).
- Screenshot baselines are kept per platform (`e2e/__screenshots__/<platform>/`). Only Linux baselines are committed, so on Windows run `npm run test:e2e:update` once to record local ones.
