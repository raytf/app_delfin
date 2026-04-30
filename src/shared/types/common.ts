export type { PresetId } from "../enums/presetId";

export type AnyObj = Record<string, unknown>;

export interface CapturedFrame {
  imageBase64: string; // JPEG base64
  width: number;
  height: number;
  capturedAt: number; // unix ms
  sourceLabel: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  latencyMs?: number;
  imagePath?: string;
  imageDataUrl?: string;
  audioPath?: string;
  interrupted?: boolean;
}
