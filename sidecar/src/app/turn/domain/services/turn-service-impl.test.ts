import { describe, expect, it, vi } from "vitest";
import type {
  CreateConversationInput,
  InferenceEngine,
  InferenceEngineInfo,
  RunTurnHandlers,
  RunTurnInput,
} from "../../../../shared/abstractions/inference-engine";
import type {
  TtsEngine,
  TtsStream,
} from "../../../../shared/abstractions/tts-engine";
import type { Nullable } from "../../../../shared/types/object";
import type { SessionService } from "../../../session/domain/abstractions/session-service";
import { SessionAggregate } from "../../../session/domain/aggregates/session-aggregate";
import { Session } from "../../../session/domain/entities/session";
import { SessionMessage } from "../../../session/domain/entities/session-message";
import type { CreateSessionDto } from "../../../session/domain/dtos/create-session-dto";
import type { CreateSessionMessageDto } from "../../../session/domain/dtos/create-session-message-dto";
import type { UpdateSessionDto } from "../../../session/domain/dtos/update-session-dto";
import type { TurnStreamer } from "../abstractions/turn-streamer";
import { TurnServiceImpl } from "./turn-service-impl";

class RecordingStreamer implements TurnStreamer {
  readonly events: unknown[] = [];

  async sendToken(requestId: string, text: string): Promise<void> {
    this.events.push({ type: "token", requestId, text });
  }

  async sendAudioStart(
    requestId: string,
    sampleRate: number,
    sentenceCount: number,
  ): Promise<void> {
    this.events.push({
      type: "audio_start",
      requestId,
      sampleRate,
      sentenceCount,
    });
  }

  async sendAudioChunk(
    requestId: string,
    audio: string,
    index?: number,
  ): Promise<void> {
    this.events.push({ type: "audio_chunk", requestId, audio, index });
  }

  async sendAudioEnd(requestId: string, ttsTime: number): Promise<void> {
    this.events.push({ type: "audio_end", requestId, ttsTime });
  }

  async sendDone(requestId: string, interrupted = false): Promise<void> {
    this.events.push({ type: "done", requestId, interrupted });
  }

  async sendError(message: string, requestId?: string): Promise<void> {
    this.events.push({ type: "error", requestId, message });
  }
}

function createSessionService(): SessionService {
  const session = new Session({ name: "Test", presetId: "lecture-slide" });
  session.id = "session-1";

  return {
    create: vi.fn(async (_sessionDto: CreateSessionDto) => session),
    get: vi.fn(async () => [session]),
    getOneById: vi.fn(async () => new SessionAggregate(session, [])),
    updateById: vi.fn(async (_sessionId: string, _dto: UpdateSessionDto) => session),
    endById: vi.fn(async (_sessionId: string) => session),
    deleteById: vi.fn(async (_sessionId: string) => undefined),
    createSessionMessage: vi.fn(
      async (
        sessionId: string,
        dto: CreateSessionMessageDto,
      ) =>
        new SessionMessage({
          sessionId,
          author: dto.author,
          content: dto.content,
          interrupted: dto.interrupted,
        }),
    ),
    replaceMessage: vi.fn(
      async (_sessionId: string, _messageId: string, message: SessionMessage) =>
        message,
    ),
  };
}

function createTtsEngine(): TtsEngine {
  const stream: TtsStream = {
    pushText: vi.fn(async (_text: string) => undefined),
    finalize: vi.fn(async () => undefined),
    cancel: vi.fn(async () => undefined),
  };

  return {
    isAvailable: vi.fn(() => false),
    createStream: vi.fn(() => stream),
  };
}

function createInferenceEngine(started: string[]): InferenceEngine {
  return {
    ready: vi.fn(async () => undefined),
    getInfo: vi.fn(
      (): InferenceEngineInfo => ({
        ready: true,
        backend: "test",
        model: null,
        error: null,
      }),
    ),
    createConversation: vi.fn(async (_input: CreateConversationInput) => undefined),
    dropConversation: vi.fn(async (_conversationId: string) => undefined),
    runTurn: vi.fn(async (input: RunTurnInput, _handlers: RunTurnHandlers) => {
      started.push(input.requestId);
    }),
    interruptTurn: vi.fn((_requestId: Nullable<string>) => undefined),
    resetConversation: vi.fn((_conversationId: Nullable<string>) => undefined),
    close: vi.fn(async () => undefined),
  };
}

describe("TurnServiceImpl", () => {
  it("cancels the active request before running a replacement turn", async () => {
    const started: string[] = [];
    const sessionService = createSessionService();
    const inferenceEngine = createInferenceEngine(started);
    const streamer = new RecordingStreamer();
    const service = new TurnServiceImpl(
      sessionService,
      inferenceEngine,
      createTtsEngine(),
    );

    service.handleTurn(
      "session-1",
      {
        requestId: "request-a",
        text: "first",
        imageBase64: null,
        audioBase64: null,
        presetId: "lecture-slide",
      },
      streamer,
    );

    await expect.poll(() => started).toEqual(["request-a"]);

    service.handleTurn(
      "session-1",
      {
        requestId: "request-b",
        text: "second",
        imageBase64: null,
        audioBase64: null,
        presetId: "lecture-slide",
      },
      streamer,
    );

    await expect.poll(() => started).toEqual(["request-a", "request-b"]);
    expect(inferenceEngine.interruptTurn).toHaveBeenCalledWith("request-a");
    expect(streamer.events).toContainEqual({
      type: "done",
      requestId: "request-a",
      interrupted: true,
    });

    service.closeConnection();
  });

  it("ignores interrupts for stale request ids", async () => {
    const started: string[] = [];
    const inferenceEngine = createInferenceEngine(started);
    const streamer = new RecordingStreamer();
    const service = new TurnServiceImpl(
      createSessionService(),
      inferenceEngine,
      createTtsEngine(),
    );

    service.handleTurn(
      "session-1",
      {
        requestId: "request-a",
        text: "first",
        imageBase64: null,
        audioBase64: null,
        presetId: "lecture-slide",
      },
      streamer,
    );
    service.interruptTurn("stale-request");

    await expect.poll(() => started).toEqual(["request-a"]);
    expect(inferenceEngine.interruptTurn).not.toHaveBeenCalled();

    service.closeConnection();
  });
});
