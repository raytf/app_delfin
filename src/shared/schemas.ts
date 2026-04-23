import { z } from 'zod'

export const wsInboundMessageSchema = z.object({
  type: z.enum(['token', 'audio_start', 'audio_chunk', 'audio_end', 'done', 'error', 'memory_progress', 'tool_result']),
  text: z.string().optional(),
  audio: z.string().optional(),
  message: z.string().optional(),
  sample_rate: z.number().optional(),
  sentence_count: z.number().optional(),
  index: z.number().optional(),
  tts_time: z.number().optional(),
  // Memory progress fields
  job_id: z.string().optional(),
  op: z.enum(['ingest', 'lint']).optional(),
  phase: z.enum(['extract', 'summarize', 'propose_update', 'apply', 'done', 'error']).optional(),
  subject: z.string().optional(),
  pct: z.number().optional(),
  // Tool result fields
  tool_name: z.string().optional(),
  result: z.any().optional(),
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
  backend: z.string().optional(),
  model: z.string().optional(),
  visionTokens: z.string().optional(),
})
