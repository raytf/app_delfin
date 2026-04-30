import type { PresetId } from "../enums/presetId";
import type { SessionStatus } from "../enums/sessionStatus";
export type {
  SessionMessage,
  Session,
  SessionDetail,
} from "../entities/session";

export type { SessionStatus };

export interface SessionPromptRequest {
  sessionId: string;
  messageId: string;
  text: string;
  presetId: PresetId;
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

export interface SessionMessageAudioRequest {
  audioPath: string;
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
