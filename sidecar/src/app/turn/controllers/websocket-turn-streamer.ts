import type WebSocket from 'ws';
import type { TurnStreamer } from '../domain/abstractions/turn-streamer';

export class WebSocketTurnStreamer implements TurnStreamer {
  constructor(private readonly ws: WebSocket) {}

  async sendToken(requestId: string, text: string): Promise<void> {
    this.send({ type: "token", requestId, text });
  }

  async sendAudioStart(
    requestId: string,
    sampleRate: number,
    sentenceCount: number,
  ): Promise<void> {
    this.send({
      type: "audio_start",
      requestId,
      sample_rate: sampleRate,
      sentence_count: sentenceCount,
    });
  }

  async sendAudioChunk(
    requestId: string,
    audio: string,
    index?: number,
  ): Promise<void> {
    this.send({
      type: "audio_chunk",
      requestId,
      audio,
      ...(index !== undefined ? { index } : {}),
    });
  }

  async sendAudioEnd(requestId: string, ttsTime: number): Promise<void> {
    this.send({ type: "audio_end", requestId, tts_time: ttsTime });
  }

  async sendDone(requestId: string, interrupted = false): Promise<void> {
    this.send({ type: "done", requestId, interrupted });
  }

  async sendError(message: string, requestId?: string): Promise<void> {
    this.send({
      type: "error",
      message,
      ...(requestId !== undefined ? { requestId } : {}),
    });
  }

  private send(payload: object): void {
    if (this.ws.readyState !== this.ws.OPEN) return;
    this.ws.send(JSON.stringify(payload));
  }
}
