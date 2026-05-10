import type { OverlayMode } from "../enums/overlayMode";
import type {
  SessionDeleteRequest,
  SessionDetail,
  SessionDetailRequest,
  SessionMessageAudioRequest,
  SessionMessageImageRequest,
  SessionPromptRequest,
  SessionPromptResponse,
  SessionStartRequest,
  SessionStartResponse,
  SessionStopRequest,
  Session,
} from "../types/session";
import type { OverlayState } from "../types/overlay";

export interface ElectronAPI {
  /** True when VOICE_ENABLED=true in .env. Read synchronously by renderer. */
  voiceEnabled: boolean;
  /** True when TTS_ENABLED=true in .env. Used by renderer fallback logic. */
  ttsEnabled: boolean;
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
  getSessionMessageAudio: (
    request: SessionMessageAudioRequest,
  ) => Promise<string>;
  setOverlayMode: (mode: OverlayMode) => Promise<void>;
  minimizeWindow: () => Promise<void>;
  toggleMaximizeWindow: () => Promise<void>;
  closeWindow: () => Promise<void>;
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
  removeAllListeners: (channel: string) => void;
}
