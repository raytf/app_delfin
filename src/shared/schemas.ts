import { z } from 'zod'

export const wsInboundMessageSchema = z.object({
  type: z.enum(['token', 'audio_start', 'audio_chunk', 'audio_end', 'done', 'error']),
  text: z.string().optional(),
  audio: z.string().optional(),
  message: z.string().optional(),
  sample_rate: z.number().optional(),
  sentence_count: z.number().optional(),
  index: z.number().optional(),
  tts_time: z.number().optional(),
})

export const wsOutboundMessageSchema = z.object({
  image: z.string().optional(),
  text: z.string(),
  preset_id: z.string(),
  audio: z.string().optional(), // base64 WAV — present on voice turns
})

export const wsInterruptMessageSchema = z.object({
  type: z.literal('interrupt'),
})

export const sessionPromptRequestSchema = z.object({
  messageId: z.string(),
  text: z.string(),
  presetId: z.enum(['lecture-slide', 'generic-screen']),
  audio: z.string().optional(), // base64 WAV — present on voice turns
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
  healthy: z.boolean().optional(),
  backend: z.string().optional(),
  model: z.string().optional(),
  visionTokens: z.string().optional(),
})

export const modelAssetIdSchema = z.enum(['litert-cpp-model', 'piper-voice'])

export const modelStatusSchema = z.object({
  ready: z.boolean(),
  missing: z.array(modelAssetIdSchema),
  downloadInProgress: z.boolean(),
})

export const downloadProgressSchema = z.object({
  asset: modelAssetIdSchema,
  receivedBytes: z.number(),
  totalBytes: z.number().optional(),
  percent: z.number().optional(),
})
