# Decisions

This log records why each choice was made. The newest entries go at the bottom of each section.

## Stage 0 answers (from the owner)

| Question | Answer                                                                                                                                                                                 |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OS       | **Windows**. The Windows `WindowProvider` is built first; macOS and Linux get stubs.                                                                                                   |
| Name     | First character was **Glorp** (a jelly blob, since removed). The app is now **Desktop Buddy**, with characters you pick from.                                                          |
| Vibe     | **Cute, with thorough and detailed visuals.** The behaviour is a bit weird, but it turns plain and serious when it gives a real suggestion (reminders, health nudges, focus coaching). |
| AI       | No Anthropic key right now. A Google key may come later. The LLM layer sits behind a provider interface (`LlmProvider`), and the offline line bank is the default.                     |

## Architecture

### Process model

```
┌──────────────────────── Electron main (Node) ────────────────────────┐
│ app lifecycle · tray · settings store (JSON) · IPC                   │
│ platform/ providers (WindowProvider, cursor, metrics, later senses)  │
└───────────────▲───────────────────────────────────┬──────────────────┘
                │ typed IPC (src/shared/ipc.ts)     │ preload bridge (window.buddy)
┌───────────────┴───────────────────────────────────▼──────────────────┐
│ Overlay renderer: the "brain" plus the canvas                        │
│ core/ loop + event bus · creature/ body + drawing · behaviors/       │
│ life/ needs, mood, memory · ai/ lines · ui/ bubbles and panels       │
└──────────────────────────────────────────────────────────────────────┘
```

- **The simulation runs in the overlay renderer.** It needs the 60 fps loop and the canvas. Main stays thin: it owns anything that needs Node or OS access and sends results to the renderer as events.
- **Pure modules** (`core/`, `creature/`, `behaviors/`, `life/`, `ai/`, the sense _interpreters_) import nothing from Electron or Node. Vitest tests them in plain Node. Drawing functions take a `CanvasRenderingContext2D` and do nothing else.
- **`src/shared/`** holds the IPC channel names and payload types used by both sides, so every message is typed at both ends.
- **Security:** `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, and a strict CSP. The preload exposes a small typed `window.buddy` API.

### Directory map

| Dir              | Contents                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------- |
| `src/main/`      | Electron main process: windows, tray, store, IPC wiring.                                    |
| `src/preload/`   | The context bridge.                                                                         |
| `src/shared/`    | IPC contracts and shared types.                                                             |
| `src/core/`      | Loop, event bus, seeded RNG, math, springs and verlet, persistence helpers.                 |
| `src/creature/`  | Shared engine (physics, expressions, idle animator, particles) and `species/` (characters). |
| `src/behaviors/` | Behaviour state machine and behaviour modules (Stage 2+).                                   |
| `src/senses/`    | Sense provider interfaces and the code that turns raw readings into events (Stage 3+).      |
| `src/life/`      | Needs, mood, personality, memory (Stage 4+).                                                |
| `src/ai/`        | Line bank, `LlmProvider`, prompt building (Stage 6+).                                       |
| `src/ui/`        | Speech bubbles, settings, chat, stats (Stage 6+).                                           |
| `src/plugins/`   | Plugin loader and API (Stage 8).                                                            |
| `src/platform/`  | OS-specific code behind interfaces (`WindowProvider` etc.).                                 |
| `src/renderer/`  | HTML entry points: `overlay/` (the pet) and `lab/` (the creature lab).                      |

### Build tooling

- **Vite** builds the renderer pages (multi-page: `overlay`, `lab`) and gives HMR for the lab.
- **esbuild** bundles main and preload to CommonJS (`dist/main/index.cjs`, `dist/preload/index.cjs`). A sandboxed preload must be one CJS file, and esbuild is the fastest way to get one. A small script was simpler than adding electron-vite.
- **Relative imports only**, with no path aliases. Vite, Vitest, esbuild and tsc then need no alias config.
- **Two tsconfigs:** `tsconfig.node.json` (main, preload, scripts; Node lib, no DOM) and `tsconfig.web.json` (renderer and pure modules; DOM lib). This stops renderer code from reaching for Node by accident.
- TypeScript 5.9, Vite 7, Vitest 5, ESLint 9 with typescript-eslint, Prettier 3, and Playwright 1.56.1 (pinned to match the Chromium build in the dev container).

### Overlay window

- One frameless, transparent, always-on-top window covers the display's **work area**. Using the work area, not the full bounds, keeps the taskbar clock uncovered.
- **Click-through:** the window runs with `setIgnoreMouseEvents(true, { forward: true })`. The renderer hit-tests the cursor against the creature's shape. When the cursor enters, it asks main to make the window interactive; when it leaves, the window goes back to click-through. Main also polls `screen.getCursorScreenPoint()` at about 30 Hz while the window is visible. That covers platforms where forwarding is missing (Linux), and the cursor-curiosity behaviours in Stage 2 need it anyway.
- `focusable: false` and `showInactive()`, so the pet never steals keyboard focus. `skipTaskbar: true`.
- **Multi-monitor (Stage 2 plan):** one overlay per display, with the creature's state handed over when it crosses an edge. A single window spanning the whole virtual desktop is unreliable on Windows with mixed DPI.

### Simulation loop

- Fixed 60 Hz simulation step with an accumulator. Rendering happens on `requestAnimationFrame`.
- **Adaptive frame rate:** the loop records how much changed each frame. When nothing moves (sleeping, quiet mode) it drops to 30 or 15 fps, and it stops completely when the window is hidden. The full pass is in Stage 9; the hooks exist from Stage 0.
- All randomness goes through a seeded RNG (`core/random.ts`), so tests and screenshots are deterministic.

### State and persistence

- **JSON files, not SQLite.** `better-sqlite3` is a native module that has to be rebuilt for every Electron version, which is a common source of Windows build failures. The data is small: settings, needs, traits, and an event log capped at a few thousand entries. So: one versioned JSON state file, written atomically (temp file, then rename), with numbered backups and a migration chain. The event or memory log is JSONL, rotated by size. If queries outgrow this, `MemoryStore` is an interface and can be swapped.
- Main owns all disk access. The renderer reads and writes through IPC.

### Event bus

- A typed `EventBus<Events>` with `on`, `once`, `off`, `emit`, and a wildcard `onAny` (for the Stage 8 event inspector). Event names and payloads live in one interface, which plugins can extend with declaration merging.

## Stage 1: the body

- **Canvas 2D, not PixiJS.** One creature with a few dozen paths and a small particle pool is cheap in Canvas 2D. It also avoids a WebGL context and keeps idle memory and CPU low. PixiJS would mostly help with batching many sprites, which we don't need.
- **Squash and stretch** is a spring on vertical scale. Horizontal scale is derived to roughly keep the volume constant. Everything scales about the feet so the creature stays planted.
- **Expressions** are points in one parameter space (`FaceParams`): eye openness, squint, lid tilt, brows, mouth curve, openness, width and wobble, blush, head tilt, arm raise, droop, sparkle. Any mix of expressions is a weighted average, so blending is exact. Short animations (blink, yawn) are layered on top of the blended face. Each character decides how to draw those numbers.
- **Screenshot tests use the lab's `?test=1` mode.** Idle animations are off, the seed is fixed, the stage is a fixed size, and time only advances when the test asks. Baselines are stored per platform, since canvas antialiasing differs slightly between operating systems.
- **Adaptive frame rate:** `Creature.activity()` sums spring velocity, ring energy, dangly-chain motion and particles. Slow breathing sway is left out on purpose, because it looks fine at the idle frame rate.

## Characters (species)

- **One engine, many characters.** Physics, expressions, idle animation, particles and (later) behaviours are shared. A character (`SpeciesDef`) supplies its hit/shadow envelope, optional dangly chains (verlet ropes for antennae, tails and the like), palettes, a stiffness value, an optional resting face bias, an optional per-frame `update` hook, and its `draw` function.
- **Palettes are generic.** Every palette has `outline`, `accent` and `accent2` (particles use these) plus a `colors` record of roles that only that character's renderer reads. Every palette of a character must define the same roles (a unit test checks this).
- **Glorp was removed** at the owner's request after PEKKA was added. The app was renamed **Desktop Buddy** so its name doesn't depend on one character. Glorp's code (blob body, face styles, accessories) is in git history if any of it is useful for a future character.

### P.E.K.K.A (fan character)

- **Replicates the owner's reference image.** Shapes are authored in "reference space": pixel coordinates measured on a 3x enlargement of that image (centre x 392, ground y 495). The renderer maps that space onto the pose, so squash, tilt, hops and expressions still apply. This made matching the proportions exact instead of approximate.
- **Swords, horns and spikes share one `blade` colour** so they always match the armour's accent.
- **Stern resting look** via `faceBias: { lidTilt: 0.35 }`; the eye sockets' top edge follows `lidTilt`, so the same expressions work for her.
- **The Supercell logo on the reference chest is replaced by a plain gem plaque.** P.E.K.K.A is © Supercell; this is non-commercial fan art (Supercell's Fan Content Policy).

### Black Cat

- **Follows the owner's reference:** a plain black silhouette (outlines are drawn for every part first, then every part is filled, so lines only show around the outside), big round yellow eyes, pointed ears, a tail curling up on the right. A soft sheen and rim light keep the black from reading as a flat hole.
- **Expressions are derived, not new parameters.** The renderer reads the shared 16 face values and derives cat moods from them (fright, anger, joy, sorrow, pupil dilation), so every existing expression, blend and reaction works without changes to the engine. For example, scared = wobbly mouth with worried brows, which the cat shows as dilated pupils, pinned ears, a hiss and bristling fur.
- **One small engine addition:** a dangly chain can supply `droopFor(face)`, so the cat's tail rises when frightened while other droop still lowers it.
- **Per-cat extras live in the species `update` hook** (ear twitches, whisker twitches, tail lashing when annoyed, quivering when excited), with their own seeded RNG and only while idle animation is on, so screenshot tests stay deterministic.
- **The paws keep the cat a cat:** generic "arm raise" lifts them to the chest only when the mood says so; during the wave fidget only the right paw beckons, and yawns don't lift them.
