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
import type { Nullable } from "../../../../shared/types/object";
import { BadRequestException } from "../../../../shared/exceptions";

export class TurnServiceImpl implements TurnService {
  constructor(
    private readonly sessionService: SessionService,
    private readonly inferenceEngine: InferenceEngine,
    private readonly ttsEngine: TtsEngine,
  ) {}

  async handleTurn(
    sessionId: string,
    turnRequest: TurnRequestDto,
    streamer: TurnStreamer,
    interrupted: { current: boolean },
    activeTurnIdRef: { current: Nullable<string> },
  ): Promise<void> {
    const session = await this.sessionService.getOneById(sessionId);
    if (session.status !== "active") {
      throw new BadRequestException(`Session is not active: ${sessionId}`);
    }
    const conversationId = sessionId;
    const content = this.buildContent(turnRequest);
    if (content.length === 0) {
      await streamer.sendError("Request must include text, image, or audio.");
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
    activeTurnIdRef.current = assistantMessage.id;

    const ttsStream = this.createTtsStream(streamer);

    try {
      await this.runStreamedTurn(
        {
          turnId: assistantMessage.id,
          conversationId,
          systemPrompt: turnRequest.presetId,
          message: {
            role: "user",
            content,
          },
        },
        {
          onToken: async (text: string) => {
            assistantMessage.content += text;
            await streamer.sendToken(text);
            await ttsStream.pushText(text);
          },
        },
      );

      if (interrupted.current) {
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
      await streamer.sendDone();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Turn failed.";
      assistantMessage.errorMessage = message;
      assistantMessage.interrupted = interrupted.current;
      await ttsStream.cancel();
      await this.sessionService.replaceMessage(
        sessionId,
        assistantMessage.id,
        assistantMessage,
      );
      await streamer.sendError(message);
    }
  }

  private createTtsStream(streamer: TurnStreamer): TtsStream {
    return this.ttsEngine.createStream({
      onStart: async ({ sampleRate, sentenceCount }) => {
        await streamer.sendAudioStart(sampleRate, sentenceCount);
      },
      onChunk: async ({ audio, index }) => {
        await streamer.sendAudioChunk(audio, index);
      },
      onEnd: async ({ ttsTime }) => {
        await streamer.sendAudioEnd(ttsTime);
      },
    });
  }

  private async runStreamedTurn(
    input: RunTurnInput,
    handlers: { onToken: (text: string) => Promise<void> },
  ): Promise<void> {
    await new Promise<void>((resolvePromise, rejectPromise) => {
      const inferenceHandlers: RunTurnHandlers = {
        onToken: (text) => {
          void handlers.onToken(text);
        },
        onDone: () => {
          resolvePromise();
        },
        onError: (message) => {
          rejectPromise(new Error(message));
        },
      };

      void this.inferenceEngine
        .runTurn(input, inferenceHandlers)
        .catch((error: unknown) => rejectPromise(error));
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
