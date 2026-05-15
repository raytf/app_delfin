import type WebSocket from "ws";
import type { RawData } from "ws";
import type { TurnService } from "../domain/abstractions/turn-service";
import type { TurnRequestDto } from "../domain/dtos/turn-dtos";
import { WebSocketTurnStreamer } from "./websocket-turn-streamer";
import { wsRequestSchema } from "./validations/ws-request-validation";
import type { TurnRequest } from "./validations/ws-request-validation";

export class TurnController {
  constructor(private readonly turnService: TurnService) {}

  registerConnection(ws: WebSocket): void {
    const streamer = new WebSocketTurnStreamer(ws);

    ws.on("message", (raw: RawData) => {
      let rawPayload: unknown;
      try {
        rawPayload = JSON.parse(raw.toString());
      } catch {
        void streamer.sendError("Invalid JSON payload.");
        return;
      }

      const parsed = wsRequestSchema.safeParse(rawPayload);
      if (!parsed.success) {
        const message =
          parsed.error.issues[0]?.message ?? "Invalid WebSocket payload.";
        void streamer.sendError(message);
        return;
      }

      if (parsed.data.type === "interrupt") {
        this.turnService.interruptTurn(parsed.data.requestId);
        return;
      }

      const mapped = this.mapTurnRequest(parsed.data);
      this.turnService.handleTurn(mapped.sessionId, mapped.request, streamer);
    });

    ws.on("close", () => {
      this.turnService.closeConnection();
    });

    ws.on("error", () => {
      this.turnService.closeConnection();
    });
  }

  private mapTurnRequest(payload: TurnRequest): {
    sessionId: string;
    request: TurnRequestDto;
  } {
    return {
      sessionId: payload.sessionId,
      request: {
        requestId: payload.requestId,
        text: payload.text ?? null,
        imageBase64: payload.imageBase64 ?? null,
        audioBase64: payload.audioBase64 ?? null,
        presetId: payload.presetId,
      },
    };
  }
}
