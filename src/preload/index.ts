import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '../shared/types'
import type {
  WsOutboundMessage,
  CaptureFrame,
  StructuredResponse,
  SidecarStatus,
  ElectronAPI,
} from '../shared/types'

const api: ElectronAPI = {
  captureNow: () => ipcRenderer.invoke(IPC_CHANNELS.CAPTURE_NOW),

  captureAutoRefresh: (config: { enabled: boolean; intervalMs: number }) =>
    ipcRenderer.send(IPC_CHANNELS.CAPTURE_AUTO_REFRESH, config),

  sidecarSend: (msg: WsOutboundMessage) => ipcRenderer.send(IPC_CHANNELS.SIDECAR_SEND, msg),

  sidecarInterrupt: () => ipcRenderer.send(IPC_CHANNELS.SIDECAR_INTERRUPT),

  onFrameCaptured: (cb: (frame: CaptureFrame) => void) =>
    ipcRenderer.on(IPC_CHANNELS.FRAME_CAPTURED, (_event, frame) => cb(frame)),

  onSidecarToken: (cb: (data: { text: string }) => void) =>
    ipcRenderer.on(IPC_CHANNELS.SIDECAR_TOKEN, (_event, data) => cb(data)),

  onSidecarStructured: (cb: (data: StructuredResponse) => void) =>
    ipcRenderer.on(IPC_CHANNELS.SIDECAR_STRUCTURED, (_event, data) => cb(data)),

  onSidecarAudioStart: (cb: () => void) =>
    ipcRenderer.on(IPC_CHANNELS.SIDECAR_AUDIO_START, () => cb()),

  onSidecarAudioChunk: (cb: (data: { audio: string }) => void) =>
    ipcRenderer.on(IPC_CHANNELS.SIDECAR_AUDIO_CHUNK, (_event, data) => cb(data)),

  onSidecarAudioEnd: (cb: () => void) =>
    ipcRenderer.on(IPC_CHANNELS.SIDECAR_AUDIO_END, () => cb()),

  onSidecarDone: (cb: () => void) =>
    ipcRenderer.on(IPC_CHANNELS.SIDECAR_DONE, () => cb()),

  onSidecarError: (cb: (data: { message: string }) => void) =>
    ipcRenderer.on(IPC_CHANNELS.SIDECAR_ERROR, (_event, data) => cb(data)),

  onSidecarStatus: (cb: (data: SidecarStatus) => void) =>
    ipcRenderer.on(IPC_CHANNELS.SIDECAR_STATUS, (_event, data) => cb(data)),

  removeAllListeners: (channel: string) => ipcRenderer.removeAllListeners(channel),
}

contextBridge.exposeInMainWorld('api', api)
