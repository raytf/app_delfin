import type { PresetId } from "../../../shared/enums/presetId";
import { FetchHttpRequestHelper } from "../../http/fetchHttpRequestHelper";
import type { HttpRequestHelper } from "../../../shared/abstractions/httpRequestHelper";
import { mapSessionDetailResponse, mapSessionResponse } from "./mappers";
import type { Session, SessionDetail } from "./entities";
import type {
  SessionCreateResponse,
  SessionDetailResponse,
  SessionResponse,
  SidecarEnvelope,
} from "./response";

export class SidecarSessionClient {
  private readonly http: HttpRequestHelper;

  constructor(baseUrl: string, httpHelper?: HttpRequestHelper) {
    this.http = httpHelper ?? new FetchHttpRequestHelper(baseUrl);
  }

  async createSession(input: {
    sessionName: string;
    presetId: PresetId;
  }): Promise<SessionCreateResponse> {
    const response = await this.http.post<SidecarEnvelope<SessionResponse>>(
      "/sessions",
      {
        session_name: input.sessionName,
        preset_id: input.presetId,
      },
    );

    return {
      sessionId: response.data.id,
    };
  }

  async endSession(sessionId: string): Promise<void> {
    await this.http.patch<SidecarEnvelope<unknown>>(
      `/sessions/${sessionId}/end`,
    );
  }

  async listSessions(): Promise<Session[]> {
    const response =
      await this.http.get<SidecarEnvelope<SessionResponse[]>>("/sessions");

    return response.data
      .map((session) => mapSessionResponse(session))
      .sort((left, right) => right.startedAt - left.startedAt);
  }

  async getSessionDetail(sessionId: string): Promise<SessionDetail> {
    const response = await this.http.get<
      SidecarEnvelope<SessionDetailResponse>
    >(`/sessions/${sessionId}`);
    return mapSessionDetailResponse(response.data);
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.http.delete<SidecarEnvelope<unknown>>(`/sessions/${sessionId}`);
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
