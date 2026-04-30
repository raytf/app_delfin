import type { OverlayMode } from "../enums/overlayMode";
import type { CapturedFrame } from "./common";
import type {
  SessionDeleteRequest,
  SessionDetail,
  SessionDetailRequest,
  SessionMessageImageRequest,
  SessionPromptRequest,
  SessionPromptResponse,
  SessionStartRequest,
  SessionStartResponse,
  SessionStopRequest,
  Session,
} from "./session";
import type { OverlayState } from "./overlay";
import type { SidecarSessionOutboundMessage, SidecarStatus } from "./sidecar";

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
  onFrameCaptured: (cb: (frame: CapturedFrame) => void) => void;
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
