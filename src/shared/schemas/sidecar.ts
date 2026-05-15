import { z } from "zod";
import { SidecarSessionInboundType } from "../enums/sidecarSessionInboundType";

export const sidecarSessionInboundMessageSchema = z.object({
  type: z.enum(SidecarSessionInboundType),
  requestId: z.string().optional(),
  text: z.string().optional(),
  audio: z.string().optional(),
  message: z.string().optional(),
  sample_rate: z.number().optional(),
  sentence_count: z.number().optional(),
  index: z.number().optional(),
  tts_time: z.number().optional(),
  interrupted: z.boolean().optional(),
});

export type SidecarSessionStreamMessage = z.infer<
  typeof sidecarSessionInboundMessageSchema
>;
