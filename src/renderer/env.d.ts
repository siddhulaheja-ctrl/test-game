import type { GlorpBridge } from '../shared/ipc';

declare global {
  interface Window {
    /** Present inside Electron (from the preload). Absent when a page is opened in a plain browser. */
    glorp?: GlorpBridge;
  }
}

export {};
