export type { PresetId } from "../enums/presetId";

export type AnyObj = Record<string, unknown>;

export interface CapturedFrame {
  imageBase64: string; // JPEG base64
  width: number;
  height: number;
  capturedAt: number; // unix ms
  sourceLabel: string;
}
