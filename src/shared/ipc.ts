import type { PetSnapshot } from '../behaviors/snapshot';
import type { Rect } from '../world/geometry';
import type { WorldSnapshot } from '../world/world';

/**
 * IPC contract shared by main, preload and renderers.
 * Every channel name and payload type lives here so both ends stay in sync.
 */

/** Characters that can live on the desktop (ids match `creature/species`). */
export const CHARACTERS = [
  { id: 'cat', name: 'Black Cat' },
  { id: 'pekka', name: 'P.E.K.K.A' },
] as const;
export type CharacterId = (typeof CHARACTERS)[number]['id'];

export type FullscreenMode = 'hide' | 'quiet';

/** App-level toggles owned by main and mirrored into every renderer. */
export interface AppState {
  /** Creature is shown on the desktop. */
  visible: boolean;
  /** Quiet Mode: no sounds, no speech, minimal motion. */
  quietMode: boolean;
  /** FPS / CPU / RAM overlay in the corner. */
  debugOverlay: boolean;
  /** Which characters are out on the desktop. */
  characters: CharacterId[];
  /** What pets do while a fullscreen app or game is in front. */
  fullscreenMode: FullscreenMode;
  /** Keep pets out of the notification corner (bottom-right of the primary display). */
  avoidNotificationCorner: boolean;
  /** Extra areas pets must not rest in (desktop DIP coordinates). */
  safeZones: Rect[];
}

export const DEFAULT_APP_STATE: AppState = {
  visible: true,
  quietMode: false,
  debugOverlay: false,
  characters: ['cat', 'pekka'],
  fullscreenMode: 'hide',
  avoidNotificationCorner: true,
  safeZones: [],
};

const isRect = (r: unknown): r is Rect =>
  typeof r === 'object' &&
  r !== null &&
  (['x', 'y', 'width', 'height'] as const).every((k) =>
    Number.isFinite((r as Record<string, unknown>)[k]),
  );

/** Keep only well-formed fields of a renderer- or file-supplied AppState patch. */
export function sanitizeAppState(patch: unknown): Partial<AppState> {
  if (typeof patch !== 'object' || patch === null) return {};
  const p = patch as Record<string, unknown>;
  const out: Partial<AppState> = {};
  for (const k of ['visible', 'quietMode', 'debugOverlay', 'avoidNotificationCorner'] as const) {
    if (typeof p[k] === 'boolean') out[k] = p[k];
  }
  if (Array.isArray(p.characters)) {
    const ids = CHARACTERS.map((c) => c.id as string);
    out.characters = [...new Set(p.characters.filter((c): c is CharacterId => ids.includes(c)))];
  }
  if (p.fullscreenMode === 'hide' || p.fullscreenMode === 'quiet')
    out.fullscreenMode = p.fullscreenMode;
  if (Array.isArray(p.safeZones)) out.safeZones = p.safeZones.filter(isRect).slice(0, 16);
  return out;
}

/** Cursor position in desktop DIP coordinates (not relative to any window). */
export interface CursorPoint {
  x: number;
  y: number;
  /** Left mouse button state where the platform can report it globally (Windows), else absent. */
  leftDown?: boolean;
}

/** Sent to an overlay when it loads: which display it covers. */
export interface OverlayInfo {
  displayId: number;
  /** Top-left of the overlay window in desktop DIP coordinates. */
  origin: { x: number; y: number };
  primary: boolean;
}

/** Pets this overlay should create (spawn) or drop (remove). */
export interface PetCommand {
  spawn?: { id: string; species: string }[];
  remove?: string[];
}

/** A pet crossing to another display. */
export interface Handoff {
  snap: PetSnapshot;
  toDisplay: number;
}

/** Per-display flags from main. */
export interface DisplayFlags {
  /** Displays with a fullscreen app in front. */
  fullscreen: number[];
}

/** Process metrics for the debug overlay. */
export interface ProcessMetrics {
  /** Sum of CPU percent across all app processes (100 = one full core). */
  cpuPercent: number;
  /** Sum of working set across all app processes, in MB. */
  memoryMB: number;
}

export const IPC = {
  /** renderer → main (send): make the overlay capture mouse input (true) or click through (false). */
  setInteractive: 'overlay:set-interactive',
  /** renderer → main (invoke): read the current AppState. */
  getAppState: 'app:get-state',
  /** main → renderer: AppState changed. */
  appState: 'app:state',
  /** main → renderer: cursor moved (polled by main). */
  cursor: 'cursor:pos',
  /** main → renderer: process metrics, about once a second while the debug overlay is on. */
  metrics: 'debug:metrics',
  /** renderer → main (send): patch AppState (for in-app toggles). */
  patchAppState: 'app:patch-state',
  /** renderer → main (invoke): which display this overlay covers. */
  overlayInfo: 'overlay:info',
  /** main → renderer: the desktop changed (displays, windows, safe zones). */
  world: 'world:snapshot',
  /** main → renderer: create or drop pets. */
  pets: 'pets:command',
  /** renderer → main (send) and main → renderer: a pet moves to another display. */
  handoff: 'pets:handoff',
  /** renderer → main (send): windows pets stand on (polled faster while ridden). */
  watchWindows: 'world:watch',
  /** renderer → main (send) and main → renderers: a mouse button was released (ends drags). */
  pointerUp: 'pointer:up',
  /** main → renderer: fullscreen apps per display. */
  displayFlags: 'display:flags',
} as const;

/** API exposed on `window.buddy` by the preload script. */
export interface BuddyBridge {
  readonly platform: string;
  setInteractive(interactive: boolean): void;
  getAppState(): Promise<AppState>;
  patchAppState(patch: Partial<AppState>): void;
  onAppState(cb: (state: AppState) => void): () => void;
  onCursor(cb: (p: CursorPoint) => void): () => void;
  onMetrics(cb: (m: ProcessMetrics) => void): () => void;
  getOverlayInfo(): Promise<OverlayInfo>;
  onWorld(cb: (w: WorldSnapshot) => void): () => void;
  onPets(cb: (c: PetCommand) => void): () => void;
  sendHandoff(h: Handoff): void;
  onHandoff(cb: (h: Handoff) => void): () => void;
  watchWindows(ids: string[]): void;
  sendPointerUp(p: { x: number; y: number }): void;
  onPointerUp(cb: (p: { x: number; y: number }) => void): () => void;
  onDisplayFlags(cb: (f: DisplayFlags) => void): () => void;
}
