import { z } from 'zod'

export const wsInboundMessageSchema = z.object({
  type: z.enum(['token', 'audio_start', 'audio_chunk', 'audio_end', 'done', 'error']),
  text: z.string().optional(),
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
