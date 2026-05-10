import type WebSocket from "ws";
import type { RawData } from "ws";
import { getUUID } from "../../../shared/utils/common";
import type { InferenceEngine } from "../../../shared/abstractions/inference-engine";
import type { Nullable } from "../../../shared/types/object";
import type { TurnService } from "../domain/abstractions/turn-service";
import type { TurnRequestDto } from "../domain/dtos/turn-dtos";
import { WebSocketTurnStreamer } from "./websocket-turn-streamer";
import {
  TurnRequest,
  WsRequest,
  wsRequestSchema,
} from "./validations/ws-request-validation";

export class TurnController {
  constructor(
    private readonly turnService: TurnService,
    private readonly inferenceEngine: InferenceEngine,
  ) {}

  registerConnection(ws: WebSocket): void {
    const streamer = new WebSocketTurnStreamer(ws);
    const conversationId = getUUID();

    const queue: Array<{ sessionId: string; request: TurnRequestDto }> = [];
    let running = false;
    const activeTurnIdRef: { current: Nullable<string> } = { current: null };
    const interrupted = { current: false };

    const runNext = async (): Promise<void> => {
      if (running) return;
      const next = queue.shift();
      if (!next) return;

      running = true;
      interrupted.current = false;

      try {
        await this.turnService.handleTurn(
          next.sessionId,
          conversationId,
          next.request,
          streamer,
          interrupted,
          activeTurnIdRef,
        );
      } finally {
        running = false;
        activeTurnIdRef.current = null;
        void runNext();
      }
    };

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
        interrupted.current = true;
        this.inferenceEngine.interruptTurn(activeTurnIdRef.current);
        return;
      }

      const mapped = this.mapTurnRequest(parsed.data);
      queue.push(mapped);
      void runNext();
    });

    ws.on("close", () => {
      this.inferenceEngine.resetConversation(conversationId);
    });
  }

  private mapTurnRequest(payload: TurnRequest): {
    sessionId: string;
    request: TurnRequestDto;
  } {
    return {
      sessionId: payload.sessionId,
      request: {
        text: payload.text ?? null,
        imageBase64: payload.imageBase64 ?? null,
        audioBase64: payload.audioBase64 ?? null,
        presetId: payload.presetId,
      },
    };
  }
}
