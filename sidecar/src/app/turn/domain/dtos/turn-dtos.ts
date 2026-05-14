import type { Nullable } from '../../../../shared/types/object';

export type TurnRequestDto = {
  requestId: string;
  text: Nullable<string>;
  imageBase64: Nullable<string>;
  audioBase64: Nullable<string>;
  presetId: string;
};

export type TurnStreamEventDto =
  | { type: "token"; requestId: string; text: string }
  | {
      type: "audio_start";
      requestId: string;
      sampleRate: number;
      sentenceCount: number;
    }
  | { type: "audio_chunk"; requestId: string; audio: string; index?: number }
  | { type: "audio_end"; requestId: string; ttsTime: number }
  | { type: "done"; requestId: string; interrupted?: boolean }
  | { type: "error"; requestId?: string; message: string };
