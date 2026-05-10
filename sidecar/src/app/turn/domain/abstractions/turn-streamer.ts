export interface TurnStreamer {
  sendToken(text: string): Promise<void>;
  sendAudioStart(sampleRate: number, sentenceCount: number): Promise<void>;
  sendAudioChunk(audio: string, index?: number): Promise<void>;
  sendAudioEnd(ttsTime: number): Promise<void>;
  sendDone(): Promise<void>;
  sendError(message: string): Promise<void>;
}
