/**
 * IPC contract shared by main, preload and renderers.
 * Every channel name and payload type lives here so both ends stay in sync.
 */

/** App-level toggles owned by main and mirrored into every renderer. */
export interface AppState {
  /** Creature is shown on the desktop. */
  visible: boolean;
  /** Quiet Mode: no sounds, no speech, minimal motion. */
  quietMode: boolean;
  /** FPS / CPU / RAM overlay in the corner. */
  debugOverlay: boolean;
}

export const DEFAULT_APP_STATE: AppState = {
  visible: true,
  quietMode: false,
  debugOverlay: false,
};

/** Cursor position relative to the receiving window, in CSS pixels (DIP). */
export interface CursorPoint {
  x: number;
  y: number;
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
} as const;

/** API exposed on `window.glorp` by the preload script. */
export interface GlorpBridge {
  readonly platform: string;
  setInteractive(interactive: boolean): void;
  getAppState(): Promise<AppState>;
  patchAppState(patch: Partial<AppState>): void;
  onAppState(cb: (state: AppState) => void): () => void;
  onCursor(cb: (p: CursorPoint) => void): () => void;
  onMetrics(cb: (m: ProcessMetrics) => void): () => void;
}
