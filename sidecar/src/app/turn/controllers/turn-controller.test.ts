import { describe, expect, it, vi } from "vitest";
import type WebSocket from "ws";
import { TurnController } from "./turn-controller";
import type { TurnService } from "../domain/abstractions/turn-service";
import type { TurnStreamer } from "../domain/abstractions/turn-streamer";
import type { TurnRequestDto } from "../domain/dtos/turn-dtos";

class FakeWebSocket {
  readonly OPEN = 1;
  readyState = this.OPEN;
  readonly sent: unknown[] = [];
  private readonly handlers = new Map<string, Array<(data?: unknown) => void>>();

  on(event: string, handler: (data?: unknown) => void): this {
    const handlers = this.handlers.get(event) ?? [];
    handlers.push(handler);
    this.handlers.set(event, handlers);
    return this;
  }

  send(payload: string): void {
    this.sent.push(JSON.parse(payload));
  }

  emitMessage(payload: unknown): void {
    this.emit("message", Buffer.from(JSON.stringify(payload)));
  }

  emit(event: string, data?: unknown): void {
    for (const handler of this.handlers.get(event) ?? []) {
      handler(data);
    }
  }
}

function createTurnService(): TurnService {
  return {
    handleTurn: vi.fn(
      (
        _sessionId: string,
        _request: TurnRequestDto,
        _streamer: TurnStreamer,
      ) => undefined,
    ),
    interruptTurn: vi.fn((_requestId: string) => undefined),
    closeConnection: vi.fn(() => undefined),
  };
}

describe("TurnController", () => {
  it("maps a turn request and delegates it to the turn service", () => {
    const turnService = createTurnService();
    const socket = new FakeWebSocket();

    new TurnController(turnService).registerConnection(
      socket as unknown as WebSocket,
    );

    socket.emitMessage({
      type: "turn",
      requestId: "request-a",
      sessionId: "session-1",
      presetId: "lecture-slide",
      text: "first",
    });

    expect(turnService.handleTurn).toHaveBeenCalledWith(
      "session-1",
      {
        requestId: "request-a",
        text: "first",
        imageBase64: null,
        audioBase64: null,
        presetId: "lecture-slide",
      },
      expect.anything(),
    );
  });

  it("delegates request-scoped interrupts to the turn service", () => {
    const turnService = createTurnService();
    const socket = new FakeWebSocket();

    new TurnController(turnService).registerConnection(
      socket as unknown as WebSocket,
    );

    socket.emitMessage({ type: "interrupt", requestId: "request-a" });

    expect(turnService.interruptTurn).toHaveBeenCalledWith("request-a");
  });

  it("delegates connection close cleanup to the turn service", () => {
    const turnService = createTurnService();
    const socket = new FakeWebSocket();

    new TurnController(turnService).registerConnection(
      socket as unknown as WebSocket,
    );

    socket.emit("close");

    expect(turnService.closeConnection).toHaveBeenCalled();
  });
});
