import type {
  InferenceEngine,
  RunTurnHandlers,
  RunTurnInput,
  TurnContent,
} from "../../../../shared/abstractions/inference-engine";
import type {
  TtsEngine,
  TtsStream,
} from "../../../../shared/abstractions/tts-engine";
import type { SessionService } from "../../../session/domain/abstractions/session-service";
import type { TurnRequestDto } from "../dtos/turn-dtos";
import type { TurnService } from "../abstractions/turn-service";
import type { TurnStreamer } from "../abstractions/turn-streamer";
import { BadRequestException } from "../../../../shared/exceptions";

type StreamedTurnOutcome = "completed" | "interrupted";
type PendingTurn = {
  sessionId: string;
  request: TurnRequestDto;
  streamer: TurnStreamer;
};
type RunningTurn = {
  requestId: string;
  cancelled: boolean;
  ttsStream: TtsStream | null;
  finish: (() => void) | null;
};

export class TurnServiceImpl implements TurnService {
  private activeTurn: RunningTurn | null = null;

  private pendingTurn: PendingTurn | null = null;

  private connectionClosed = false;

  constructor(
    private readonly sessionService: SessionService,
    private readonly inferenceEngine: InferenceEngine,
    private readonly ttsEngine: TtsEngine,
  ) {}

  handleTurn(
    sessionId: string,
    turnRequest: TurnRequestDto,
    streamer: TurnStreamer,
  ): void {
    this.connectionClosed = false;
    const next = { sessionId, request: turnRequest, streamer };

    if (this.activeTurn === null) {
      this.startTurn(next);
      return;
    }

    this.pendingTurn = next;
    this.cancelActiveTurn();
  }

  interruptTurn(requestId: string): void {
    if (this.activeTurn?.requestId === requestId) {
      this.cancelActiveTurn();
      return;
    }

    if (this.pendingTurn?.request.requestId === requestId) {
      const pending = this.pendingTurn;
      this.pendingTurn = null;
      void pending.streamer.sendDone(requestId, true);
    }
  }

  closeConnection(): void {
    this.connectionClosed = true;
    this.pendingTurn = null;
    this.cancelActiveTurn();
  }

  private startTurn(pending: PendingTurn): void {
    const running: RunningTurn = {
      requestId: pending.request.requestId,
      cancelled: false,
      ttsStream: null,
      finish: null,
    };
    this.activeTurn = running;

    void this.runTurn(
      pending.sessionId,
      pending.request,
      pending.streamer,
      running,
    )
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "Turn failed.";
        void pending.streamer.sendError(message, pending.request.requestId);
      })
      .finally(() => {
        if (this.activeTurn === running) {
          this.activeTurn = null;
        }

        if (this.connectionClosed) {
          return;
        }

        if (this.pendingTurn !== null) {
          const next = this.pendingTurn;
          this.pendingTurn = null;
          this.startTurn(next);
        }
      });
  }

  private cancelActiveTurn(): void {
    const active = this.activeTurn;
    if (active === null || active.cancelled) return;

    active.cancelled = true;
    void active.ttsStream?.cancel().catch(() => undefined);
    active.finish?.();
    this.inferenceEngine.interruptTurn(active.requestId);
  }

  private async runTurn(
    sessionId: string,
    turnRequest: TurnRequestDto,
    streamer: TurnStreamer,
    active: RunningTurn,
  ): Promise<void> {
    const requestId = turnRequest.requestId;
    if (active.cancelled) {
      await streamer.sendDone(requestId, true);
      return;
    }

    const session = await this.sessionService.getOneById(sessionId);
    if (session.status !== "active") {
      throw new BadRequestException(`Session is not active: ${sessionId}`);
    }
    const conversationId = sessionId;
    const content = this.buildContent(turnRequest);
    if (content.length === 0) {
      await streamer.sendError(
        "Request must include text, image, or audio.",
        requestId,
      );
      return;
    }

    if (active.cancelled) {
      await streamer.sendDone(requestId, true);
      return;
    }

    await this.sessionService.createSessionMessage(sessionId, {
      author: "user",
      content: turnRequest.text?.trim() ?? "",
      imageBase64: turnRequest.imageBase64 ?? undefined,
      audioBase64: turnRequest.audioBase64 ?? undefined,
    });

    const assistantMessage = await this.sessionService.createSessionMessage(
      sessionId,
      {
        author: "assistant",
        content: "",
      },
    );

    const ttsStream = this.createTtsStream(requestId, streamer);
    active.ttsStream = ttsStream;

    try {
      if (active.cancelled) {
        assistantMessage.interrupted = true;
        await ttsStream.cancel();
        await this.sessionService.replaceMessage(
          sessionId,
          assistantMessage.id,
          assistantMessage,
        );
        await streamer.sendDone(requestId, true);
        return;
      }

      const outcome = await this.runStreamedTurn(
        {
          requestId,
          conversationId,
          systemPrompt: turnRequest.presetId,
          message: {
            role: "user",
            content,
          },
        },
        {
          onToken: async (text: string) => {
            if (active.cancelled) return;
            assistantMessage.content += text;
            await streamer.sendToken(requestId, text);
            await ttsStream.pushText(text);
          },
        },
        active,
      );

      if (outcome === "interrupted" || active.cancelled) {
        assistantMessage.interrupted = true;
        await ttsStream.cancel();
      } else {
        await ttsStream.finalize();
      }

      await this.sessionService.replaceMessage(
        sessionId,
        assistantMessage.id,
        assistantMessage,
      );
      await streamer.sendDone(requestId, assistantMessage.interrupted);
    } catch (error) {
      if (active.cancelled) {
        assistantMessage.interrupted = true;
        await ttsStream.cancel();
        await this.sessionService.replaceMessage(
          sessionId,
          assistantMessage.id,
          assistantMessage,
        );
        await streamer.sendDone(requestId, true);
        return;
      }

      const message = error instanceof Error ? error.message : "Turn failed.";
      assistantMessage.errorMessage = message;
      await ttsStream.cancel();
      await this.sessionService.replaceMessage(
        sessionId,
        assistantMessage.id,
        assistantMessage,
      );
      await streamer.sendError(message, requestId);
    } finally {
      active.ttsStream = null;
      active.finish = null;
    }
  }

  private createTtsStream(
    requestId: string,
    streamer: TurnStreamer,
  ): TtsStream {
    return this.ttsEngine.createStream({
      onStart: async ({ sampleRate, sentenceCount }) => {
        await streamer.sendAudioStart(requestId, sampleRate, sentenceCount);
      },
      onChunk: async ({ audio, index }) => {
        await streamer.sendAudioChunk(requestId, audio, index);
      },
      onEnd: async ({ ttsTime }) => {
        await streamer.sendAudioEnd(requestId, ttsTime);
      },
    });
  }

  private async runStreamedTurn(
    input: RunTurnInput,
    handlers: { onToken: (text: string) => Promise<void> },
    active: RunningTurn,
  ): Promise<StreamedTurnOutcome> {
    if (active.cancelled) {
      return "interrupted";
    }

    return new Promise<StreamedTurnOutcome>((resolvePromise, rejectPromise) => {
      let settled = false;
      let tokenWork: Promise<void> = Promise.resolve();

      const cleanup = (): void => {
        if (active.finish === onCancel) {
          active.finish = null;
        }
      };
      const resolveOnce = (outcome: StreamedTurnOutcome): void => {
        if (settled) return;
        settled = true;
        cleanup();
        resolvePromise(outcome);
      };
      const rejectOnce = (error: unknown): void => {
        if (settled) return;
        settled = true;
        cleanup();
        rejectPromise(error);
      };
      const onCancel = (): void => {
        resolveOnce("interrupted");
      };

      active.finish = onCancel;

      const inferenceHandlers: RunTurnHandlers = {
        onToken: (text) => {
          if (active.cancelled || settled) return;
          tokenWork = tokenWork.then(async () => {
            if (active.cancelled || settled) return;
            await handlers.onToken(text);
          });
          void tokenWork.catch((error: unknown) => rejectOnce(error));
        },
        onDone: () => {
          void tokenWork
            .then(() =>
              resolveOnce(active.cancelled ? "interrupted" : "completed"),
            )
            .catch((error: unknown) => rejectOnce(error));
        },
        onError: (message) => {
          if (active.cancelled) {
            resolveOnce("interrupted");
            return;
          }
          rejectOnce(new Error(message));
        },
      };

      void this.inferenceEngine
        .runTurn(input, inferenceHandlers)
        .catch((error: unknown) => {
          if (active.cancelled) {
            resolveOnce("interrupted");
            return;
          }
          rejectOnce(error);
        });
    });
  }

  private buildContent(turnRequest: TurnRequestDto): TurnContent[] {
    const content: TurnContent[] = [];

    if (turnRequest.imageBase64) {
      content.push({ type: "image", blob: turnRequest.imageBase64 });
    }

    if (turnRequest.audioBase64) {
      content.push({ type: "audio", blob: turnRequest.audioBase64 });
    }

    const text = turnRequest.text?.trim();
    if (text) {
      content.push({ type: "text", text });
    }

    return content;
  }
}
