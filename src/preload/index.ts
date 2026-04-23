import { contextBridge, ipcRenderer } from 'electron'
import { MAIN_TO_RENDERER_CHANNELS, RENDERER_TO_MAIN_CHANNELS } from '../shared/types'
import type {
  WsOutboundMessage,
  WsMemoryProgress,
  CaptureFrame,
  SidecarStatus,
  ElectronAPI,
  OverlayState,
  SessionStopRequest,
  SessionDetail,
  SessionDetailRequest,
  SessionDeleteRequest,
  SessionMessageImageRequest,
  SessionPromptRequest,
  SessionPromptResponse,
  SessionStartRequest,
  MinimizedOverlayVariant,
  SessionListItem,
  MemoryHealth,
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

  stopSession: (request: SessionStopRequest) =>
    ipcRenderer.invoke(RENDERER_TO_MAIN_CHANNELS.SESSION_STOP, request),

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

  minimizeOverlay: () => ipcRenderer.invoke(RENDERER_TO_MAIN_CHANNELS.OVERLAY_MINIMIZE),

  restoreOverlay: () => ipcRenderer.invoke(RENDERER_TO_MAIN_CHANNELS.OVERLAY_RESTORE),

  setMinimizedOverlayVariant: (variant: MinimizedOverlayVariant) =>
    ipcRenderer.invoke(RENDERER_TO_MAIN_CHANNELS.OVERLAY_SET_MINIMIZED_VARIANT, variant),

  clearEndedSession: () => ipcRenderer.invoke(RENDERER_TO_MAIN_CHANNELS.OVERLAY_CLEAR_ENDED_SESSION),

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

  onSidecarMemoryProgress: (cb: (data: WsMemoryProgress) => void) =>
    ipcRenderer.on(MAIN_TO_RENDERER_CHANNELS.SIDECAR_MEMORY_PROGRESS, (_event, data) => cb(data)),

  removeAllListeners: (channel: string) =>
    ipcRenderer.removeAllListeners(channel),

  // Memory client methods
  checkMemoryHealth: () =>
    ipcRenderer.invoke(RENDERER_TO_MAIN_CHANNELS.MEMORY_CHECK_HEALTH) as Promise<MemoryHealth>,

  ingestSession: (sessionId: string) =>
    ipcRenderer.invoke(RENDERER_TO_MAIN_CHANNELS.MEMORY_INGEST_SESSION, { sessionId }) as Promise<{
      success: boolean
      message: string
      session_id: string
      job_id: string
      background: boolean
    }>,

  getIngestStatus: () =>
    ipcRenderer.invoke(RENDERER_TO_MAIN_CHANNELS.MEMORY_GET_INGEST_STATUS) as Promise<{
      active_jobs: number
      pending_jobs: number
      completed_jobs: number
      failed_jobs: number
      last_completed: string | null
      status: string
    }>,

  listIngestJobs: () =>
    ipcRenderer.invoke(RENDERER_TO_MAIN_CHANNELS.MEMORY_LIST_INGEST_JOBS) as Promise<{
      jobs: Array<{
        job_id: string
        session_id: string
        status: string
        progress: number
        phase: string
        message: string
        created_at: number
        started_at: number | null
        completed_at: number | null
        error: string | null
      }>
    }>,

  getIngestJob: (jobId: string) =>
    ipcRenderer.invoke(RENDERER_TO_MAIN_CHANNELS.MEMORY_GET_INGEST_JOB, { jobId }) as Promise<{
      job_id: string
      session_id: string
      status: string
      progress: number
      phase: string
      message: string
      created_at: number
      started_at: number | null
      completed_at: number | null
      error: string | null
      retry_count: number
      max_retries: number
    }>,

  cancelIngestJob: (jobId: string) =>
    ipcRenderer.invoke(RENDERER_TO_MAIN_CHANNELS.MEMORY_CANCEL_INGEST_JOB, { jobId }) as Promise<{
      success: boolean
      message: string
    }>,

  clearCompletedJobs: () =>
    ipcRenderer.invoke(RENDERER_TO_MAIN_CHANNELS.MEMORY_CLEAR_COMPLETED_JOBS) as Promise<{
      success: boolean
      message: string
      cleared_count: number
    }>,
}

contextBridge.exposeInMainWorld('api', api)
