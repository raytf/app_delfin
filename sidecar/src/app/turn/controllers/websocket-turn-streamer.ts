import type WebSocket from 'ws';
import type { TurnStreamer } from '../domain/abstractions/turn-streamer';

export class WebSocketTurnStreamer implements TurnStreamer {
  constructor(private readonly ws: WebSocket) {}

  async sendToken(text: string): Promise<void> {
    this.send({ type: 'token', text });
  }

  async sendAudioStart(sampleRate: number, sentenceCount: number): Promise<void> {
    this.send({
      type: 'audio_start',
      sample_rate: sampleRate,
      sentence_count: sentenceCount,
    });
  }

  async sendAudioChunk(audio: string, index?: number): Promise<void> {
    this.send({
      type: 'audio_chunk',
      audio,
      ...(index !== undefined ? { index } : {}),
    });
  }

  async sendAudioEnd(ttsTime: number): Promise<void> {
    this.send({ type: 'audio_end', tts_time: ttsTime });
  }

  async sendDone(): Promise<void> {
    this.send({ type: 'done' });
  }

  async sendError(message: string): Promise<void> {
    this.send({ type: 'error', message });
  }

  private send(payload: object): void {
    if (this.ws.readyState !== this.ws.OPEN) return;
    this.ws.send(JSON.stringify(payload));
  }
}
