import { contextBridge, ipcRenderer } from 'electron'
import { MAIN_TO_RENDERER_CHANNELS, RENDERER_TO_MAIN_CHANNELS } from '../shared/types'
import type {
  WsOutboundMessage,
  CaptureFrame,
  SidecarStatus,
  ElectronAPI,
  OverlayState,
  SessionDetail,
  SessionDetailRequest,
  SessionDeleteRequest,
  SessionMessageImageRequest,
  SessionPromptRequest,
  SessionPromptResponse,
  SessionStartRequest,
  OverlayMode,
  SessionListItem,
} from '../shared/types'

const api: ElectronAPI = {
  // Evaluated once at preload time (Node.js context has access to process.env).
  // Defaults to true so voice is on when the env var is absent.
  voiceEnabled: process.env.VOICE_ENABLED !== 'false',

  // Evaluated once at preload time. Defaults to false so speech output is opt-in.
  ttsEnabled: process.env.TTS_ENABLED === 'true',

  captureNow: () => ipcRenderer.invoke(RENDERER_TO_MAIN_CHANNELS.CAPTURE_NOW),

  captureAutoRefresh: (config: { enabled: boolean; intervalMs: number }) =>
    ipcRenderer.send(RENDERER_TO_MAIN_CHANNELS.CAPTURE_AUTO_REFRESH, config),

  sidecarSend: (msg: WsOutboundMessage) =>
    ipcRenderer.send(RENDERER_TO_MAIN_CHANNELS.SIDECAR_SEND, msg),

  sidecarInterrupt: () => ipcRenderer.send(RENDERER_TO_MAIN_CHANNELS.SIDECAR_INTERRUPT),

  getOverlayState: () =>
    ipcRenderer.invoke(RENDERER_TO_MAIN_CHANNELS.OVERLAY_GET_STATE) as Promise<OverlayState>,

  startSession: (request: SessionStartRequest) =>
    ipcRenderer.invoke(RENDERER_TO_MAIN_CHANNELS.SESSION_START, request),

  stopSession: () => ipcRenderer.invoke(RENDERER_TO_MAIN_CHANNELS.SESSION_STOP),

  submitSessionPrompt: (request: SessionPromptRequest) =>
    ipcRenderer.invoke(RENDERER_TO_MAIN_CHANNELS.SESSION_SUBMIT_PROMPT, request) as Promise<SessionPromptResponse>,

  listSessions: () =>
    ipcRenderer.invoke(RENDERER_TO_MAIN_CHANNELS.SESSION_LIST) as Promise<SessionListItem[]>,

  getSessionDetail: (request: SessionDetailRequest) =>
    ipcRenderer.invoke(RENDERER_TO_MAIN_CHANNELS.SESSION_GET_DETAIL, request) as Promise<SessionDetail>,

  deleteSession: (request: SessionDeleteRequest) =>
    ipcRenderer.invoke(RENDERER_TO_MAIN_CHANNELS.SESSION_DELETE, request) as Promise<void>,

  getSessionMessageImage: (request: SessionMessageImageRequest) =>
    ipcRenderer.invoke(RENDERER_TO_MAIN_CHANNELS.SESSION_GET_MESSAGE_IMAGE, request) as Promise<string>,

  setOverlayMode: (mode: OverlayMode) =>
    ipcRenderer.invoke(RENDERER_TO_MAIN_CHANNELS.OVERLAY_SET_MODE, mode),

  onFrameCaptured: (cb: (frame: CaptureFrame) => void) =>
    ipcRenderer.on(MAIN_TO_RENDERER_CHANNELS.FRAME_CAPTURED, (_event, frame) => cb(frame)),

  onOverlayError: (cb: (data: { message: string }) => void) =>
    ipcRenderer.on(MAIN_TO_RENDERER_CHANNELS.OVERLAY_ERROR, (_event, data) => cb(data)),

  onSidecarToken: (cb: (data: { text: string }) => void) =>
    ipcRenderer.on(MAIN_TO_RENDERER_CHANNELS.SIDECAR_TOKEN, (_event, data) => cb(data)),

  onSidecarAudioStart: (cb: (data: { sampleRate: number; sentenceCount: number }) => void) =>
    ipcRenderer.on(MAIN_TO_RENDERER_CHANNELS.SIDECAR_AUDIO_START, (_event, data) => cb(data)),

  onSidecarAudioChunk: (cb: (data: { audio: string; index?: number }) => void) =>
    ipcRenderer.on(MAIN_TO_RENDERER_CHANNELS.SIDECAR_AUDIO_CHUNK, (_event, data) =>
      cb(data),
    ),

  onSidecarAudioEnd: (cb: (data: { ttsTime: number }) => void) =>
    ipcRenderer.on(MAIN_TO_RENDERER_CHANNELS.SIDECAR_AUDIO_END, (_event, data) => cb(data)),

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
