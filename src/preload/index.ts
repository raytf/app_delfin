import { contextBridge, ipcRenderer } from 'electron'
import { MAIN_TO_RENDERER_CHANNELS, RENDERER_TO_MAIN_CHANNELS } from '../shared/types'
import type {
  WsOutboundMessage,
  CaptureFrame,
  StructuredResponse,
  SidecarStatus,
  ElectronAPI,
  OverlayState,
  SessionPromptRequest,
  MinimizedOverlayVariant,
  SessionListItem,
} from '../shared/types'

const api: ElectronAPI = {
  captureNow: () => ipcRenderer.invoke(RENDERER_TO_MAIN_CHANNELS.CAPTURE_NOW),

  captureAutoRefresh: (config: { enabled: boolean; intervalMs: number }) =>
    ipcRenderer.send(RENDERER_TO_MAIN_CHANNELS.CAPTURE_AUTO_REFRESH, config),

  sidecarSend: (msg: WsOutboundMessage) =>
    ipcRenderer.send(RENDERER_TO_MAIN_CHANNELS.SIDECAR_SEND, msg),

  sidecarInterrupt: () => ipcRenderer.send(RENDERER_TO_MAIN_CHANNELS.SIDECAR_INTERRUPT),

  getOverlayState: () =>
    ipcRenderer.invoke(RENDERER_TO_MAIN_CHANNELS.OVERLAY_GET_STATE) as Promise<OverlayState>,

  startSession: () => ipcRenderer.invoke(RENDERER_TO_MAIN_CHANNELS.SESSION_START),

  stopSession: () => ipcRenderer.invoke(RENDERER_TO_MAIN_CHANNELS.SESSION_STOP),

  submitSessionPrompt: (request: SessionPromptRequest) =>
    ipcRenderer.invoke(RENDERER_TO_MAIN_CHANNELS.SESSION_SUBMIT_PROMPT, request),

  listSessions: () =>
    ipcRenderer.invoke(RENDERER_TO_MAIN_CHANNELS.SESSION_LIST) as Promise<SessionListItem[]>,

  minimizeOverlay: () => ipcRenderer.invoke(RENDERER_TO_MAIN_CHANNELS.OVERLAY_MINIMIZE),

  restoreOverlay: () => ipcRenderer.invoke(RENDERER_TO_MAIN_CHANNELS.OVERLAY_RESTORE),

  setMinimizedOverlayVariant: (variant: MinimizedOverlayVariant) =>
    ipcRenderer.invoke(RENDERER_TO_MAIN_CHANNELS.OVERLAY_SET_MINIMIZED_VARIANT, variant),

  onFrameCaptured: (cb: (frame: CaptureFrame) => void) =>
    ipcRenderer.on(MAIN_TO_RENDERER_CHANNELS.FRAME_CAPTURED, (_event, frame) => cb(frame)),

  onSidecarToken: (cb: (data: { text: string }) => void) =>
    ipcRenderer.on(MAIN_TO_RENDERER_CHANNELS.SIDECAR_TOKEN, (_event, data) => cb(data)),

  onSidecarStructured: (cb: (data: StructuredResponse) => void) =>
    ipcRenderer.on(MAIN_TO_RENDERER_CHANNELS.SIDECAR_STRUCTURED, (_event, data) => cb(data)),

  onSidecarAudioStart: (cb: () => void) =>
    ipcRenderer.on(MAIN_TO_RENDERER_CHANNELS.SIDECAR_AUDIO_START, () => cb()),

  onSidecarAudioChunk: (cb: (data: { audio: string }) => void) =>
    ipcRenderer.on(MAIN_TO_RENDERER_CHANNELS.SIDECAR_AUDIO_CHUNK, (_event, data) =>
      cb(data),
    ),

  onSidecarAudioEnd: (cb: () => void) =>
    ipcRenderer.on(MAIN_TO_RENDERER_CHANNELS.SIDECAR_AUDIO_END, () => cb()),

  onSidecarDone: (cb: () => void) =>
    ipcRenderer.on(MAIN_TO_RENDERER_CHANNELS.SIDECAR_DONE, () => cb()),

  onSidecarError: (cb: (data: { message: string }) => void) =>
    ipcRenderer.on(MAIN_TO_RENDERER_CHANNELS.SIDECAR_ERROR, (_event, data) => cb(data)),

  onSidecarStatus: (cb: (data: SidecarStatus) => void) =>
    ipcRenderer.on(MAIN_TO_RENDERER_CHANNELS.SIDECAR_STATUS, (_event, data) => cb(data)),

  removeAllListeners: (channel: string) =>
    ipcRenderer.removeAllListeners(channel),
}

contextBridge.exposeInMainWorld('api', api)
