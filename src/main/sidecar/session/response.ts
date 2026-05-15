import type { PresetId } from "../../../shared/enums/presetId";

export interface SidecarEnvelope<T> {
  data: T;
}

export interface SessionResponse {
  id: string;
  name: string;
  presetId: PresetId | string | null;
  startedAt: string | number | Date;
  endedAt: string | number | Date | null;
  status: string;
  messageCount: number;
  updatedAt: string | number | Date;
}

export interface SessionMessageResponse {
  id: string;
  sessionId: string;
  author: "user" | "assistant";
  content: string;
  timestamp: number | string | Date;
  imagePath?: string | null;
  audioPath?: string | null;
  error_message?: string;
  interrupted?: boolean;
}

export interface SessionDetailResponse extends SessionResponse {
  messages: SessionMessageResponse[];
}

export interface SessionCreateResponse {
  sessionId: string;
}
