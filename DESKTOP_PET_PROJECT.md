# Desktop Companion: Full Project Scope

> **Instructions for Claude Code:** Read this whole file first. Then work through the stages in order. Do not skip ahead. At the end of each stage, run the tests, commit, update `PROGRESS.md`, and give me a short summary plus screenshots or a description of what I should see before continuing. Ask me at most a few questions at the start (Stage 0) and then make sensible decisions yourself.

---

## 1. Vision

A living desktop companion that exists as a transparent, always-on-top character on my screen. It is drawn entirely in code (no art assets), moves with spring physics, reacts to what I'm actually doing on my computer, has a persistent personality and needs, and can talk in character using an LLM. It should feel alive, look distinctive, and be extensible through plugins.

**Design pillars**

1. **Alive:** it is never perfectly still. Breathing, blinking, and small idle behaviors are always running.
2. **Aware:** it reacts to real system and activity state, not random timers.
3. **Characterful:** it has moods, memory, and a personality that drifts based on how I treat it.
4. **Unobtrusive:** it must never block clicks, steal focus, or hog resources. A quiet mode is a first-class feature.
5. **Private:** everything stays local by default. I can see and toggle everything it observes.

---

## 2. Tech Stack (decided, change only if there's a strong reason)

- **Shell:** Electron + TypeScript (transparent frameless always-on-top window, click-through regions, tray icon)
- **Rendering:** HTML Canvas 2D or PixiJS, 60fps target with adaptive frame rate when idle
- **Physics:** custom lightweight spring/verlet system (no heavy physics engine)
- **State:** a small event bus plus a persisted store (JSON or SQLite via better-sqlite3)
- **OS integration:** `active-win` (or equivalent) for the focused window, `systeminformation` for CPU/RAM/battery/network, `uiohook-napi` (or equivalent) for global input activity (keystroke and mouse _rates only, never content_)
- **LLM:** Anthropic API via user-provided key stored in the OS keychain (`keytar` or Electron `safeStorage`), with a full offline fallback of handwritten line banks
- **Testing:** Vitest for logic, Playwright for UI and screenshot checks
- **Packaging:** electron-builder

**Platform note:** Ask me which OS I use in Stage 0. Window-edge detection is OS-specific; implement it behind an interface (`WindowProvider`) with a Windows implementation first and stubs for macOS/Linux.

---

## 3. Project Rules

- Keep modules small and typed. Strict TypeScript.
- Architecture: `core/` (engine, loop, event bus), `creature/` (body, animation, mood visuals), `behaviors/` (state machine and behavior modules), `senses/` (system/input/window/calendar providers), `life/` (needs, personality, memory), `ai/` (LLM and offline lines), `ui/` (settings, chat, stats, speech bubbles), `plugins/`, `platform/` (OS-specific code).
- Every sense and behavior is a module with a clear interface so new ones can be added without touching the core.
- Write unit tests for all logic (needs decay, mood math, behavior selection, memory). Use screenshot tests for visuals.
- Keep a `PROGRESS.md` (what's done, what's next, known issues) and a `DECISIONS.md` (why choices were made).
- Never log or store typed content, window contents, or clipboard history beyond what a feature explicitly needs and I have toggled on.
- Performance budget: under 3% CPU when idle, under 150MB RAM. Add a debug overlay that shows FPS and CPU use.
- Commit after every meaningful step with clear messages.

---

## 4. Stages

### Stage 0: Setup and Decisions

**Goal:** a clean foundation and agreed constraints.

- Ask me: OS, creature name, preferred vibe (cute / weird / sleek), and whether I have an Anthropic API key for the AI stage.
- Scaffold the Electron + TypeScript project, lint, formatting, Vitest, Playwright.
- Create `PROGRESS.md`, `DECISIONS.md`, and a `README.md`.
- Transparent, frameless, always-on-top window that spans the screen and is **click-through except where the creature is drawn**.
- Tray icon with: Show/Hide, Quiet Mode, Quit.

**Done when:** I can launch the app, see a placeholder shape on my desktop, click through everything else, and quit from the tray.

---

### Stage 1: The Body (looks and animation)

**Goal:** a creature that looks great standing still.

- Procedural body (blob or creature) drawn with smooth curves, soft shading, and an outline style that suits the chosen vibe.
- Spring physics on body points, plus a lagging tail, antennae, or ears.
- Idle animations: breathing, blinking (randomized), eye drift, small fidgets, yawns.
- Squash and stretch on movement, landing, and being poked.
- Expressions: happy, sad, sleepy, surprised, annoyed, curious, excited, scared. Eyes and mouth are parametric so they can blend between expressions.
- Particle system: sparkles, hearts, sweat drops, zzz, music notes, dust puffs.
- Customization data model: palette, eye style, body shape, accessories (hat, glasses, scarf, etc.). Ship at least 3 palettes, 3 eye styles, and 5 accessories.
- Dev tool: a hot-reload "creature lab" window with sliders and buttons to trigger every expression and animation.

**Done when:** the creature in the lab looks polished, every expression works, and screenshots at 1x and 2x scale are crisp.

---

### Stage 2: Movement and Screen Interaction

**Goal:** it lives on my screen, not just on top of it.

- Behavior state machine: idle, walk, sit, sleep, climb, fall, jump, peek, hide, play, react.
- Ground rules: walks along the bottom of the screen, jumps with believable arcs, lands with squash.
- `WindowProvider`: get visible window rectangles. Creature can sit on title bars, walk along them, and climb window sides.
- When a window moves or closes under it, the creature falls or adjusts naturally.
- Cursor interaction: curious about the cursor, follows it at a distance, runs away if it moves fast, sleeps near it if idle.
- Dragging and throwing: I can pick it up, hold it (dangling animation), and throw it with physics.
- Multi-monitor support: it can walk between screens.
- Fullscreen detection: automatically goes quiet or hides during fullscreen apps and games.
- Smart edge cases: never covers important UI like the taskbar clock, has a "safe zone" setting, and respects Quiet Mode.

**Done when:** it can wander the screen for 10+ minutes, interact with windows, and survive me dragging windows around without glitching.

---

### Stage 3: Awareness (senses)

**Goal:** it reacts to what's really happening.
Each sense is a provider that emits events on the bus, and each can be toggled in settings.

- **Typing and mouse activity:** rates only. Behaviors: cheers during flow, gets concerned after long continuous activity, sleeps when I'm idle.
- **Active app category:** coding, browser, media, chat, games, documents. Wears matching accessories or acts accordingly (glasses in the editor, dances when music is playing, sneaks away when a game launches).
- **System health:** CPU, RAM, battery, network. Sluggish movement under heavy load, tired at low battery, panic at 5%, happy when charging, sad when offline.
- **Time and date:** sleep schedule, morning yawn, late-night worry, seasonal and holiday outfits.
- **Idle and return detection:** wanders off, naps, then greets me when I return, with the greeting dependent on how long I was gone.
- **Calendar and reminders (optional, behind a provider interface):** nudges before meetings, with a local ICS file supported first.
- **Privacy panel:** shows live what each sense is currently reporting, with a master off switch.

**Done when:** I can trigger each sense (or simulate it through a debug panel) and see a distinct, sensible reaction.

---

### Stage 4: Life Simulation

**Goal:** it has needs, a personality, and memory that persist.

- **Needs:** hunger, energy, fun, affection, and cleanliness (optional). Each decays over real time at configurable rates, and decay slows while the app is closed (fair offline decay with a floor so it never "dies").
- **Mood:** derived from needs, recent events, and time of day. Mood drives expression, movement speed, and chosen behaviors.
- **Personality traits** (for example playful, lazy, curious, clingy, grumpy) that slowly drift based on how I treat it (ignored vs. played with, overworked vs. rested).
- **Interactions:** pet, feed (drag food items), play (ball, laser dot, string), give gifts, tuck in for sleep.
- **Memory system:** logs notable events and detects patterns (for example, "you usually work late on Thursdays" or "you haven't fed me since morning"). Stored locally and queryable by other modules.
- **Growth:** age and evolution stages that change body shape and abilities at milestones.
- **Persistence:** save and load everything safely, with versioned migrations and automatic backups.

**Done when:** I can close the app for a day, reopen it, and its state, mood, and memories make sense.

---

### Stage 5: Games and Play

**Goal:** fun small interactions.

- Mini-games it can start or I can start: catch (it catches things I throw), hide and seek (it hides behind windows), chase the cursor, and a simple reaction game.
- Rewards: affection and fun boosts plus unlockable cosmetics.
- Unlock and collection system with a small inventory screen.
- Easter eggs (reacts to the Konami code, specific dates, being left alone for a week, and so on).

**Done when:** at least 3 mini-games are playable and unlockables persist.

---

### Stage 6: AI Companion

**Goal:** it can talk, in character.

- Speech bubble system with queueing, priority, typing animation, and auto-dismiss, plus a "do not interrupt" rule.
- **Offline line bank:** hundreds of handwritten lines tagged by mood, trait, situation, and time of day, so it works with no API key.
- **LLM layer:** a character system prompt built from its name, personality traits, mood, needs, recent memories, and current context (active app category, time, system state). Never send typed content or window titles unless I enable that explicitly.
- Rate limiting, caching, and a clear monthly usage cap setting.
- **Chat window:** hotkey to open, a conversation with memory, and the ability to ask it things like "what did I do today?"
- **Daily diary:** at the end of the day it writes a short journal entry from its point of view using the memory log, viewable in a diary UI.
- **Focus coach:** Pomodoro timer where it encourages, nags, and celebrates in its own voice.
- **Voice mode (stretch):** push-to-talk speech input and optional text-to-speech.
- Graceful fallback to offline lines on any API error.

**Done when:** it comments naturally on what I'm doing, the chat works, the diary generates, and everything degrades gracefully offline.

---

### Stage 7: Utility Features

**Goal:** make it genuinely useful, not just cute.

- Quick notes and a todo list the creature "carries" (shown as a small prop or popup).
- Timers and reminders (water, stretch, eyes) with in-character delivery.
- Habit tracker with streaks it cares about.
- Clipboard buddy (opt-in, local only, short history, easy to clear).
- Notification relay (opt-in): announces selected notifications in character.
- Command palette via global hotkey (feed, play, add note, start focus, toggle quiet mode, open settings).

**Done when:** each feature works, is individually toggleable, and respects Quiet Mode.

---

### Stage 8: Settings, Plugins, and Extensibility

**Goal:** it's customizable and expandable.

- **Settings UI:** appearance, behavior frequency, senses toggles, privacy, AI, hotkeys, performance, and data (export, import, reset).
- **Theme system:** full palette, accessory and outfit presets, and per-time or per-app auto-switching.
- **Plugin system:** a documented API for adding behaviors, senses, accessories, mini-games, and line packs as drop-in folders with a manifest. Include 2 or 3 example plugins and a `PLUGINS.md` guide.
- **Stats screen:** age, mood history graph, needs history, streaks, interaction counts, and diary archive.
- **Debug and dev tools:** event inspector, behavior state viewer, and performance overlay.

**Done when:** I can write a tiny plugin that adds a new behavior and see it work without touching core code.

---

### Stage 9: Polish, Performance, and Packaging

**Goal:** release-quality.

- Sound design (optional, volume controls): soft cues for interactions, with all sounds synthesized or royalty-free and credited.
- Animation polish pass: easing, anticipation, overshoot, and transitions between all behaviors.
- Performance pass: profile, reduce idle CPU, lower the frame rate when nothing is moving, and sleep the render loop when hidden.
- Robustness: crash recovery, handle monitors being added or removed, sleep and wake, DPI changes, and window provider failures.
- Accessibility: reduced motion mode, color-blind-safe palettes, and a large-creature option.
- First-run onboarding: name it, pick a look, choose senses and privacy options.
- Installer build via electron-builder and auto-start on login option.
- Final docs: `README.md` with screenshots or a GIF, install steps, and feature list.

**Done when:** I can install the packaged app on a clean machine and it feels finished.

---

## 5. Stretch Ideas (only if budget remains)

- Multiple creatures or a friend that visits
- Seasonal events and a small "world" it can build in a corner of the screen
- Mobile companion app that syncs mood
- Sharing a creature "card" image of its current look and stats
- Learning my routines to predict when I'll be away or busy

---

## 6. Suggested Working Rhythm (to use the budget well)

1. Spend the first small chunk planning the architecture in `DECISIONS.md` and confirming the module interfaces.
2. Build each stage vertically (logic, visuals, tests) rather than all logic first.
3. After each visual change, take a screenshot with Playwright, inspect it, and refine before moving on.
4. Keep stages shippable: the app should run at the end of every stage.
5. If the budget is running low, finish the current stage cleanly, update `PROGRESS.md`, and skip straight to Stage 9's essentials (packaging and docs) so the result is usable.

---

## 7. First Message to Claude Code

> Read `DESKTOP_PET_PROJECT.md` fully. Start with Stage 0: ask me your setup questions in one message, then scaffold the project. Plan the architecture in `DECISIONS.md` before writing code, and proceed stage by stage following the project rules.
