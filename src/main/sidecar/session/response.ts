import type { PresetId } from "../../../shared/enums/presetId";

export interface SidecarEnvelope<T> {
  data: T;
}

export interface SessionResponse {
  id: string;
  name: string;
  preset_id: PresetId;
  started_at: string;
  ended_at: string | null;
  status: string;
  message_count: number;
  updated_at: string;
}

export interface SessionMessageResponse {
  id: string;
  session_id: string;
  author: "user" | "assistant";
  content: string;
  timestamp: number;
  image_path?: string;
  audio_path?: string;
  error_message?: string;
  interrupted?: boolean;
}

export interface SessionDetailResponse extends SessionResponse {
  messages: SessionMessageResponse[];
}

export interface SessionCreateResponse {
  sessionId: string;
}
