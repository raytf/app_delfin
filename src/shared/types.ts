import type {
  PresetId as SessionPresetId,
  SessionDetail,
  Session,
} from "../main/sidecar/session/entities";

export type AnyObj = Record<string, unknown>;

// CaptureFrame
export interface CaptureFrame {
  imageBase64: string; // JPEG base64
  width: number;
  height: number;
  capturedAt: number; // unix ms
  sourceLabel: string;
}

// Chat
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  latencyMs?: number;
  imagePath?: string;
  imageDataUrl?: string;
  audioPath?: string;
  interrupted?: boolean;
}

// Session stream outbound (Electron → Sidecar)
export interface SidecarSessionOutboundMessage {
  session_id: string;
  image?: string;
  text: string;
  preset_id: string;
  audio?: string; // base64 WAV (16 kHz, 16-bit mono) — present on voice turns
}

export interface SessionPromptRequest {
  sessionId: string;
  messageId: string;
  text: string;
  presetId: SessionPresetId;
  audio?: string; // base64 WAV — present on voice turns; text will be VOICE_TURN_TEXT
}

export interface SessionStartRequest {
  sessionName: string;
}

export interface SessionStartResponse {
  sessionId: string;
}

export interface SessionStopRequest {
  sessionId: string;
}

export interface SessionPromptResponse {
  messageId: string;
  imageDataUrl: string;
}

export interface SessionMessageImageRequest {
  imagePath: string;
}

export interface SessionDetailRequest {
  sessionId: string;
}

export interface SessionDeleteRequest {
  sessionId: string;
}

export interface EndedSessionSnapshot {
  sessionName: string;
  duration: number;
  messageCount: number;
}

export interface SidecarSessionInterruptMessage {
  type: "interrupt";
}

// Session stream inbound (Sidecar → Electron)
export type SidecarSessionInboundType =
  | "token"
  | "audio_start"
  | "audio_chunk"
  | "audio_end"
  | "done"
  | "error";

export interface SidecarSessionInboundMessage {
  type: SidecarSessionInboundType;
  text?: string;
  audio?: string;
  message?: string;
  /** Present on audio_start — sample rate of the PCM stream (e.g. 24000). */
  sample_rate?: number;
  /** Present on audio_start — number of sentences being synthesised. */
  sentence_count?: number;
  /** Present on audio_chunk — zero-based sentence index. */
  index?: number;
  /** Present on audio_end — total TTS synthesis time in seconds. */
  tts_time?: number;
}

// IPC channel names (as const for type safety)
export const RENDERER_TO_MAIN_CHANNELS = {
  CAPTURE_NOW: "capture:now",
  CAPTURE_AUTO_REFRESH: "capture:auto-refresh",
  SIDECAR_SEND: "sidecar:send",
  SIDECAR_INTERRUPT: "sidecar:interrupt",
  OVERLAY_GET_STATE: "overlay:get-state",
  OVERLAY_SET_MODE: "overlay:set-mode",
  WINDOW_MINIMIZE: "window:minimize",
  WINDOW_TOGGLE_MAXIMIZE: "window:toggle-maximize",
  WINDOW_CLOSE: "window:close",
  SESSION_START: "session:start",
  SESSION_STOP: "session:stop",
  SESSION_SUBMIT_PROMPT: "session:submit-prompt",
  SESSION_LIST: "session:list",
  SESSION_GET_DETAIL: "session:get-detail",
  SESSION_DELETE: "session:delete",
  SESSION_GET_MESSAGE_IMAGE: "session:get-message-image",
} as const;

export const MAIN_TO_RENDERER_CHANNELS = {
  FRAME_CAPTURED: "frame:captured",
  OVERLAY_ERROR: "overlay:error",
  SIDECAR_TOKEN: "sidecar:token",
  SIDECAR_AUDIO_START: "sidecar:audio_start",
  SIDECAR_AUDIO_CHUNK: "sidecar:audio_chunk",
  SIDECAR_AUDIO_END: "sidecar:audio_end",
  SIDECAR_DONE: "sidecar:done",
  SIDECAR_ERROR: "sidecar:error",
  SIDECAR_STATUS: "sidecar:status",
} as const;

export interface Preset {
  id: SessionPresetId;
  label: string;
  starterQuestions: string[];
}

// Sidecar status
export interface SidecarStatus {
  connected: boolean;
  backend?: string;
  model?: string;
  visionTokens?: string;
}

export type {
  PresetId,
  SessionMessage,
  SessionDetail,
  SessionStatus,
  Session as Session,
} from "../main/sidecar/session/entities";

export type OverlayMode =
  | "expanded"
  | "minimized-compact"
  | "minimized-prompt-input"
  | "minimized-prompt-response";

export interface OverlayState {
  mode: OverlayMode;
}

// Electron API exposed via contextBridge (window.api)
export interface ElectronAPI {
  /** True when VOICE_ENABLED=true in .env. Read synchronously by renderer. */
  voiceEnabled: boolean;
  /** True when TTS_ENABLED=true in .env. Used by renderer fallback logic. */
  ttsEnabled: boolean;
  captureNow: () => Promise<void>;
  captureAutoRefresh: (config: {
    enabled: boolean;
    intervalMs: number;
  }) => void;
  sidecarSend: (msg: SidecarSessionOutboundMessage) => void;
  sidecarInterrupt: () => void;
  getOverlayState: () => Promise<OverlayState>;
  startSession: (request: SessionStartRequest) => Promise<SessionStartResponse>;
  stopSession: (request: SessionStopRequest) => Promise<void>;
  submitSessionPrompt: (
    request: SessionPromptRequest,
  ) => Promise<SessionPromptResponse>;
  listSessions: () => Promise<Session[]>;
  getSessionDetail: (request: SessionDetailRequest) => Promise<SessionDetail>;
  deleteSession: (request: SessionDeleteRequest) => Promise<void>;
  getSessionMessageImage: (
    request: SessionMessageImageRequest,
  ) => Promise<string>;
  setOverlayMode: (mode: OverlayMode) => Promise<void>;
  minimizeWindow: () => Promise<void>;
  toggleMaximizeWindow: () => Promise<void>;
  closeWindow: () => Promise<void>;
  onFrameCaptured: (cb: (frame: CaptureFrame) => void) => void;
  onOverlayError: (cb: (data: { message: string }) => void) => void;
  onSidecarToken: (cb: (data: { text: string }) => void) => void;
  onSidecarAudioStart: (
    cb: (data: { sampleRate: number; sentenceCount: number }) => void,
  ) => void;
  onSidecarAudioChunk: (
    cb: (data: { audio: string; index?: number }) => void,
  ) => void;
  onSidecarAudioEnd: (cb: (data: { ttsTime: number }) => void) => void;
  onSidecarDone: (cb: () => void) => void;
  onSidecarError: (cb: (data: { message: string }) => void) => void;
  onSidecarStatus: (cb: (data: SidecarStatus) => void) => void;
  removeAllListeners: (channel: string) => void;
}
