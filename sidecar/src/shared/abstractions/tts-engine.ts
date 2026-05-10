export type TtsAudioStart = {
  sampleRate: number;
  sentenceCount: number;
};

export type TtsAudioChunk = {
  audio: string;
  index: number;
};

export type TtsAudioEnd = {
  ttsTime: number;
};

export interface TtsStream {
  pushText(text: string): Promise<void>;
  finalize(): Promise<void>;
  cancel(): Promise<void>;
}

export interface TtsEngine {
  isAvailable(): boolean;
  createStream(handlers: {
    onStart: (event: TtsAudioStart) => Promise<void>;
    onChunk: (event: TtsAudioChunk) => Promise<void>;
    onEnd: (event: TtsAudioEnd) => Promise<void>;
  }): TtsStream;
}
