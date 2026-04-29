import type {
  ChatMessage,
  PresetId,
  SessionDetail,
  SessionListItem,
} from "../../shared/types";

interface SidecarEnvelope<T> {
  data: T;
}

interface SidecarSessionRecord {
  id: string;
  name: string;
  preset_id: PresetId;
  started_at: string;
  ended_at: string | null;
  status: string;
  message_count: number;
  updated_at: string;
}

interface SidecarSessionMessageRecord {
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

interface SidecarSessionDetailRecord extends SidecarSessionRecord {
  messages: SidecarSessionMessageRecord[];
}

interface CreateSessionResponse {
  sessionId: string;
}

export class SidecarSessionClient {
  constructor(private readonly baseUrl: string) {}

  async createSession(input: {
    sessionName: string;
    presetId: PresetId;
  }): Promise<CreateSessionResponse> {
    const session = await this.requestJson<SidecarSessionRecord>("/sessions", {
      method: "POST",
      body: JSON.stringify({
        session_name: input.sessionName,
        preset_id: input.presetId,
      }),
    });

    return { sessionId: session.id };
  }

  async endSession(sessionId: string): Promise<void> {
    await this.requestJson(`/sessions/${sessionId}/end`, {
      method: "PATCH",
    });
  }

  async listSessions(): Promise<SessionListItem[]> {
    const sessions =
      await this.requestJson<SidecarSessionRecord[]>("/sessions");
    return sessions
      .map((session) => this.mapSession(session))
      .sort((left, right) => right.startedAt - left.startedAt);
  }

  async getSessionDetail(sessionId: string): Promise<SessionDetail> {
    const detail = await this.requestJson<SidecarSessionDetailRecord>(
      `/sessions/${sessionId}`,
    );
    return {
      ...this.mapSession(detail),
      messages: detail.messages.map((message) => this.mapMessage(message)),
    };
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.requestJson(`/sessions/${sessionId}`, {
      method: "DELETE",
    });
  }

  private async requestJson<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });

    const payload = (await response.json()) as SidecarEnvelope<T> & {
      error?: { displayMessage?: string | null };
    };

    if (!response.ok) {
      throw new Error(
        payload.error?.displayMessage ??
          `Sidecar request failed: ${response.status}`,
      );
    }

    return payload.data;
  }

  private mapSession(session: SidecarSessionRecord): SessionListItem {
    return {
      id: session.id,
      sessionName: session.name,
      presetId: session.preset_id,
      startedAt: Date.parse(session.started_at),
      endedAt: session.ended_at === null ? null : Date.parse(session.ended_at),
      status: this.normalizeStatus(session.status),
      messageCount: session.message_count,
      lastUpdatedAt: Date.parse(session.updated_at),
      sourceLabel: null,
    };
  }

  private mapMessage(message: SidecarSessionMessageRecord): ChatMessage {
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

  private normalizeStatus(status: string): SessionListItem["status"] {
    if (status === "completed" || status === "failed" || status === "aborted") {
      return status;
    }
    return status === "active" ? "active" : "completed";
  }
}

export function deriveSidecarHttpBaseUrl(wsUrl: string): string {
  const url = new URL(wsUrl);
  url.protocol = url.protocol === "wss:" ? "https:" : "http:";
  url.pathname = "";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}
