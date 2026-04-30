import { z } from "zod";
import { PresetId } from "../enums/presetId";
import { SidecarSessionInboundType } from "../enums/sidecarSessionInboundType";

export const sidecarSessionInboundMessageSchema = z.object({
  type: z.enum(SidecarSessionInboundType),
  text: z.string().optional(),
  audio: z.string().optional(),
  message: z.string().optional(),
  sample_rate: z.number().optional(),
  sentence_count: z.number().optional(),
  index: z.number().optional(),
  tts_time: z.number().optional(),
});

export type SidecarSessionStreamMessage = z.infer<
  typeof sidecarSessionInboundMessageSchema
>;

export const sidecarSessionSubmitTurnMessageSchema = z.object({
  session_id: z.string(),
  image: z.string().optional(),
  text: z.string(),
  preset_id: z.enum(PresetId),
  audio: z.string().optional(), // base64 WAV — present on voice turns
});

export type SidecarSessionSubmitTurnMessage = z.infer<
  typeof sidecarSessionSubmitTurnMessageSchema
>;

export const sidecarSessionInterruptTurnMessageSchema = z.object({
  type: z.literal("interrupt"),
});

export type SidecarSessionInterruptTurnMessage = z.infer<
  typeof sidecarSessionInterruptTurnMessageSchema
>;

export const sidecarConnectionStatusSchema = z.object({
  connected: z.boolean(),
  backend: z.string().optional(),
  model: z.string().optional(),
  visionTokens: z.string().optional(),
});

export type SidecarConnectionStatus = z.infer<
  typeof sidecarConnectionStatusSchema
>;
