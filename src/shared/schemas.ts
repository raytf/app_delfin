import { z } from 'zod'

// Helper: coerce a string-or-array value to string[].
// Gemma 4 sometimes emits list fields as a newline-delimited plain string
// rather than a JSON array.  This preprocessor normalises both forms so that
// Zod validation never silently drops the entire inbound message.
const stringListSchema = z.preprocess(
  (val) => {
    if (Array.isArray(val)) return val
    if (typeof val === 'string' && val.trim().length > 0) {
      return val
        .split('\n')
        .map((l) => l.replace(/^[-*•]\s*/, '').trim())
        .filter((l) => l.length > 0)
    }
    return []
  },
  z.array(z.string()).default([]),
)

export const structuredResponseSchema = z.object({
  // .catch('') means a missing/null/wrong-type value becomes '' instead of
  // throwing, so one bad field never discards the whole message.
  summary: z.string().catch(''),
  answer: z.string().catch(''),
  key_points: stringListSchema,
  /** Graduated hints: broad conceptual nudge → specific pointer → near-answer scaffold. */
  hints: stringListSchema.optional(),
  /** Socratic follow-up questions to deepen understanding. */
  follow_up_questions: stringListSchema.optional(),
})

export const wsInboundMessageSchema = z.object({
  type: z.enum(['token', 'structured', 'audio_start', 'audio_chunk', 'audio_end', 'done', 'error']),
  text: z.string().optional(),
  data: structuredResponseSchema.optional(),
  audio: z.string().optional(),
  message: z.string().optional(),
})

export const wsOutboundMessageSchema = z.object({
  image: z.string().optional(),
  text: z.string(),
  preset_id: z.string(),
})

export const wsInterruptMessageSchema = z.object({
  type: z.literal('interrupt'),
})

export const captureFrameSchema = z.object({
  imageBase64: z.string(),
  width: z.number(),
  height: z.number(),
  capturedAt: z.number(),
  sourceLabel: z.string(),
})

export const sidecarStatusSchema = z.object({
  connected: z.boolean(),
  backend: z.string().optional(),
  model: z.string().optional(),
  visionTokens: z.string().optional(),
})
