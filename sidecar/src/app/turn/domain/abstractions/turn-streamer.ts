export interface TurnStreamer {
  sendToken(requestId: string, text: string): Promise<void>;
  sendAudioStart(
    requestId: string,
    sampleRate: number,
    sentenceCount: number,
  ): Promise<void>;
  sendAudioChunk(
    requestId: string,
    audio: string,
    index?: number,
  ): Promise<void>;
  sendAudioEnd(requestId: string, ttsTime: number): Promise<void>;
  sendDone(requestId: string, interrupted?: boolean): Promise<void>;
  sendError(message: string, requestId?: string): Promise<void>;
}
