import type { Nullable } from '../../../../shared/types/object';

export type TurnRequestDto = {
  text: Nullable<string>;
  imageBase64: Nullable<string>;
  audioBase64: Nullable<string>;
  presetId: string;
};

export type TurnStreamEventDto =
  | { type: 'token'; text: string }
  | { type: 'done' }
  | { type: 'error'; message: string };
