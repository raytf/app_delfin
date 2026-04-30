import { z } from "zod";
import { PRESET_IDS } from "../enums/presetId";

export const sessionPromptRequestSchema = z.object({
  sessionId: z.string(),
  messageId: z.string(),
  text: z.string(),
  presetId: z.enum(PRESET_IDS),
  audio: z.string().optional(), // base64 WAV — present on voice turns
});
