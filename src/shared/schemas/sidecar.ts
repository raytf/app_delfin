import { z } from "zod";
import { SIDECAR_SESSION_INBOUND_TYPES } from "../enums/sidecarSessionInboundType";

export const sidecarSessionInboundMessageSchema = z.object({
  type: z.enum(SIDECAR_SESSION_INBOUND_TYPES),
  text: z.string().optional(),
  audio: z.string().optional(),
  message: z.string().optional(),
  sample_rate: z.number().optional(),
  sentence_count: z.number().optional(),
  index: z.number().optional(),
  tts_time: z.number().optional(),
});

export const sidecarSessionOutboundMessageSchema = z.object({
  session_id: z.string(),
  image: z.string().optional(),
  text: z.string(),
  preset_id: z.string(),
  audio: z.string().optional(), // base64 WAV — present on voice turns
});

export const sidecarSessionInterruptMessageSchema = z.object({
  type: z.literal("interrupt"),
});
