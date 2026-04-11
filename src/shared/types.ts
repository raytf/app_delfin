// CaptureFrame
export interface CaptureFrame {
  imageBase64: string // JPEG base64
  width: number
  height: number
  capturedAt: number // unix ms
  sourceLabel: string
}

// Chat
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  latencyMs?: number
  structuredData?: StructuredResponse
}

export interface StructuredResponse {
  summary: string
  answer: string
  key_points: string[]
}

// WebSocket outbound (Electron → Sidecar)
export interface WsOutboundMessage {
  image?: string
  text: string
  preset_id: string
}

export interface SessionPromptRequest {
  text: string
  presetId: PresetId
}

export interface WsInterruptMessage {
  type: 'interrupt'
}

// WebSocket inbound (Sidecar → Electron)
export type WsInboundType =
  | 'token'
  | 'structured'
  | 'audio_start'
  | 'audio_chunk'
  | 'audio_end'
  | 'done'
  | 'error'

export interface WsInboundMessage {
  type: WsInboundType
  text?: string
  data?: StructuredResponse
  audio?: string
  message?: string
}

// IPC channel names (as const for type safety)
export const RENDERER_TO_MAIN_CHANNELS = {
  CAPTURE_NOW: 'capture:now',
  CAPTURE_AUTO_REFRESH: 'capture:auto-refresh',
  SIDECAR_SEND: 'sidecar:send',
  SIDECAR_INTERRUPT: 'sidecar:interrupt',
  OVERLAY_GET_STATE: 'overlay:get-state',
  OVERLAY_MINIMIZE: 'overlay:minimize',
  OVERLAY_RESTORE: 'overlay:restore',
  OVERLAY_SET_MINIMIZED_VARIANT: 'overlay:set-minimized-variant',
  SESSION_START: 'session:start',
  SESSION_STOP: 'session:stop',
  SESSION_SUBMIT_PROMPT: 'session:submit-prompt',
} as const

export const MAIN_TO_RENDERER_CHANNELS = {
  FRAME_CAPTURED: 'frame:captured',
  SIDECAR_TOKEN: 'sidecar:token',
  SIDECAR_STRUCTURED: 'sidecar:structured',
  SIDECAR_AUDIO_START: 'sidecar:audio_start',
  SIDECAR_AUDIO_CHUNK: 'sidecar:audio_chunk',
  SIDECAR_AUDIO_END: 'sidecar:audio_end',
  SIDECAR_DONE: 'sidecar:done',
  SIDECAR_ERROR: 'sidecar:error',
  SIDECAR_STATUS: 'sidecar:status',
} as const

// Presets
export type PresetId = 'lecture-slide' | 'generic-screen'

export interface Preset {
  id: PresetId
  label: string
  starterQuestions: string[]
}

// Sidecar status
export interface SidecarStatus {
  connected: boolean
  backend?: string
  model?: string
  visionTokens?: string
}

export type OverlayMode = 'expanded' | 'minimized'
export type MinimizedOverlayVariant = 'compact' | 'prompt-input' | 'prompt-response'
export type SessionMode = 'home' | 'active'

export interface OverlayState {
  overlayMode: OverlayMode
  minimizedVariant: MinimizedOverlayVariant
  sessionMode: SessionMode
}

// Electron API exposed via contextBridge (window.api)
export interface ElectronAPI {
  captureNow: () => Promise<void>
  captureAutoRefresh: (config: { enabled: boolean; intervalMs: number }) => void
  sidecarSend: (msg: WsOutboundMessage) => void
  sidecarInterrupt: () => void
  getOverlayState: () => Promise<OverlayState>
  startSession: () => Promise<void>
  stopSession: () => Promise<void>
  submitSessionPrompt: (request: SessionPromptRequest) => Promise<void>
  minimizeOverlay: () => Promise<void>
  restoreOverlay: () => Promise<void>
  setMinimizedOverlayVariant: (variant: MinimizedOverlayVariant) => Promise<void>
  onFrameCaptured: (cb: (frame: CaptureFrame) => void) => void
  onSidecarToken: (cb: (data: { text: string }) => void) => void
  onSidecarStructured: (cb: (data: StructuredResponse) => void) => void
  onSidecarAudioStart: (cb: () => void) => void
  onSidecarAudioChunk: (cb: (data: { audio: string }) => void) => void
  onSidecarAudioEnd: (cb: () => void) => void
  onSidecarDone: (cb: () => void) => void
  onSidecarError: (cb: (data: { message: string }) => void) => void
  onSidecarStatus: (cb: (data: SidecarStatus) => void) => void
  removeAllListeners: (channel: string) => void
}
