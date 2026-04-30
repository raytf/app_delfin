export type SessionStatus = "active" | "completed" | "failed" | "aborted";

export type PresetId = "lecture-slide" | "generic-screen";

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
