import type { PresetId } from "../enums/presetId";
import type { SessionStatus } from "../enums/sessionStatus";

export interface SessionMessage {
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

export interface Session {
  id: string;
  startedAt: number;
  endedAt: number | null;
  status: SessionStatus;
  presetId: PresetId | null;
  name: string;
  sourceLabel: string | null;
  messageCount: number;
  lastUpdatedAt: number;
}

export interface SessionDetail extends Session {
  messages: SessionMessage[];
}

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
