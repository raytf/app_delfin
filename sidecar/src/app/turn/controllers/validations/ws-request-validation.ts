import { z } from "zod";
import { trimmedStringSchema } from "../../../../shared/validations/common";

export const interruptTurnSchema = z.object({
  type: z.literal("interrupt"),
  requestId: trimmedStringSchema,
});

const turnRequestSchema = z
  .object({
    type: z.literal("turn").optional(),
    requestId: trimmedStringSchema,
    sessionId: trimmedStringSchema,
    presetId: trimmedStringSchema.default("generic-screen"),
    text: z.string().nullable().optional(),
    imageBase64: z.string().nullable().optional(),
    audioBase64: z.string().nullable().optional(),
  })
  .superRefine((value, context) => {
    const hasText =
      typeof value.text === "string" && value.text.trim().length > 0;
    const hasImage =
      typeof value.imageBase64 === "string" && value.imageBase64.length > 0;
    const hasAudio =
      typeof value.audioBase64 === "string" && value.audioBase64.length > 0;

    if (!hasText && !hasImage && !hasAudio) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Turn payload must include at least one of text, imageBase64, or audioBase64.",
      });
    }
  });

export const wsRequestSchema = z.union([
  interruptTurnSchema,
  turnRequestSchema,
]);

export type WsRequest = z.infer<typeof wsRequestSchema>;
export type TurnRequest = z.infer<typeof turnRequestSchema>;
