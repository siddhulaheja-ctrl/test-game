import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import {
  IPC,
  type AppState,
  type CursorPoint,
  type GlorpBridge,
  type ProcessMetrics,
} from '../shared/ipc';

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, payload: T) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const bridge: GlorpBridge = {
  platform: process.platform,
  setInteractive: (interactive) => ipcRenderer.send(IPC.setInteractive, interactive),
  getAppState: () => ipcRenderer.invoke(IPC.getAppState) as Promise<AppState>,
  patchAppState: (patch) => ipcRenderer.send(IPC.patchAppState, patch),
  onAppState: (cb) => subscribe<AppState>(IPC.appState, cb),
  onCursor: (cb) => subscribe<CursorPoint>(IPC.cursor, cb),
  onMetrics: (cb) => subscribe<ProcessMetrics>(IPC.metrics, cb),
};

contextBridge.exposeInMainWorld('glorp', bridge);
