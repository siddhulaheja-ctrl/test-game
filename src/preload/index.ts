import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { WorldSnapshot } from '../world/world';
import {
  IPC,
  type AppState,
  type CursorPoint,
  type BuddyBridge,
  type DisplayFlags,
  type Handoff,
  type OverlayInfo,
  type PetCommand,
  type ProcessMetrics,
} from '../shared/ipc';

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, payload: T) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const bridge: BuddyBridge = {
  platform: process.platform,
  setInteractive: (interactive) => ipcRenderer.send(IPC.setInteractive, interactive),
  getAppState: () => ipcRenderer.invoke(IPC.getAppState) as Promise<AppState>,
  patchAppState: (patch) => ipcRenderer.send(IPC.patchAppState, patch),
  onAppState: (cb) => subscribe<AppState>(IPC.appState, cb),
  onCursor: (cb) => subscribe<CursorPoint>(IPC.cursor, cb),
  onMetrics: (cb) => subscribe<ProcessMetrics>(IPC.metrics, cb),
  getOverlayInfo: () => ipcRenderer.invoke(IPC.overlayInfo) as Promise<OverlayInfo>,
  onWorld: (cb) => subscribe<WorldSnapshot>(IPC.world, cb),
  onPets: (cb) => subscribe<PetCommand>(IPC.pets, cb),
  sendHandoff: (h) => ipcRenderer.send(IPC.handoff, h),
  onHandoff: (cb) => subscribe<Handoff>(IPC.handoff, cb),
  watchWindows: (ids) => ipcRenderer.send(IPC.watchWindows, ids),
  sendPointerUp: (p) => ipcRenderer.send(IPC.pointerUp, p),
  onPointerUp: (cb) => subscribe<{ x: number; y: number }>(IPC.pointerUp, cb),
  onDisplayFlags: (cb) => subscribe<DisplayFlags>(IPC.displayFlags, cb),
  onInputReset: (cb) => subscribe<void>(IPC.inputReset, () => cb()),
};

contextBridge.exposeInMainWorld('buddy', bridge);
