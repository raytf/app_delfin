import type { SidecarSessionInboundType } from "../enums/sidecarSessionInboundType";

export interface SidecarSessionOutboundMessage {
  session_id: string;
  image?: string;
  text: string;
  preset_id: string;
  audio?: string; // base64 WAV (16 kHz, 16-bit mono) — present on voice turns
}

export interface SidecarSessionInterruptMessage {
  type: "interrupt";
}

export interface SidecarSessionInboundMessage {
  type: SidecarSessionInboundType;
  text?: string;
  audio?: string;
  message?: string;
  /** Present on audio_start — sample rate of the PCM stream (e.g. 24000). */
  sample_rate?: number;
  /** Present on audio_start — number of sentences being synthesised. */
  sentence_count?: number;
  /** Present on audio_chunk — zero-based sentence index. */
  index?: number;
  /** Present on audio_end — total TTS synthesis time in seconds. */
  tts_time?: number;
}

export interface SidecarStatus {
  connected: boolean;
  backend?: string;
  model?: string;
  visionTokens?: string;
}
