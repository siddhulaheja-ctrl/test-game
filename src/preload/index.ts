import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import {
  IPC,
  type AppState,
  type CursorPoint,
  type BuddyBridge,
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
};

contextBridge.exposeInMainWorld('buddy', bridge);
