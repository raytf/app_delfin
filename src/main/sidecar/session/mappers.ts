import type {
  SessionDetailResponse,
  SessionMessageResponse,
  SessionResponse,
} from "./response";
import type {
  SessionDetail,
  SessionStatus,
  SessionMessage,
  Session,
} from "./entities";

function normalizeStatus(status: string): SessionStatus {
  if (status === "completed" || status === "failed" || status === "aborted") {
    return status;
  }
  return status === "active" ? "active" : "completed";
}

export function mapSessionResponse(session: SessionResponse): Session {
  return {
    id: session.id,
    name: session.name,
    presetId: session.preset_id,
    startedAt: Date.parse(session.started_at),
    endedAt: session.ended_at === null ? null : Date.parse(session.ended_at),
    status: normalizeStatus(session.status),
    messageCount: session.message_count,
    lastUpdatedAt: Date.parse(session.updated_at),
    sourceLabel: null,
  };
}

export function mapSessionMessageResponse(
  message: SessionMessageResponse,
): SessionMessage {
  return {
    id: message.id,
    role: message.author,
    content: message.content,
    timestamp: message.timestamp,
    imagePath: message.image_path,
    audioPath: message.audio_path,
    interrupted: Boolean(message.interrupted),
  };
}

export function mapSessionDetailResponse(
  detail: SessionDetailResponse,
): SessionDetail {
  return {
    ...mapSessionResponse(detail),
    messages: detail.messages.map((message) =>
      mapSessionMessageResponse(message),
    ),
  };
}
