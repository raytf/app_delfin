import type {
  SessionDetailResponse,
  SessionMessageResponse,
  SessionResponse,
} from "./response";
import type {
  SessionDetail,
  SessionMessage,
  Session,
} from "../../../shared/entities/session";
import type { SessionStatus } from "../../../shared/enums/sessionStatus";

function normalizeStatus(status: string): SessionStatus {
  if (status === "ended") {
    return "completed";
  }
  if (status === "completed" || status === "failed" || status === "aborted") {
    return status;
  }
  return status === "active" ? "active" : "completed";
}

function parseTime(value: unknown): number {
  if (typeof value === "number") {
    return value > 1_000_000_000_000 ? value : value * 1000;
  }
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === "string") {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric > 1_000_000_000_000 ? numeric : numeric * 1000;
    }
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

export function mapSessionResponse(session: SessionResponse): Session {
  return {
    id: session.id,
    name: session.name,
    presetId: session.presetId as Session["presetId"],
    startedAt: parseTime(session.startedAt),
    endedAt: session.endedAt === null ? null : parseTime(session.endedAt),
    status: normalizeStatus(session.status),
    messageCount: session.messageCount,
    lastUpdatedAt: parseTime(session.updatedAt),
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
    timestamp: parseTime(message.timestamp),
    imagePath: message.imagePath ?? undefined,
    audioPath: message.audioPath ?? undefined,
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
