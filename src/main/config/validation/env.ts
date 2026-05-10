import { z } from "zod";

const wsUrlSchema = z
  .string()
  .trim()
  .refine(
    (value) => value.startsWith("ws://") || value.startsWith("wss://"),
    'expected a WebSocket URL starting with "ws://" or "wss://"',
  );

const runtimeEnvSchema = z.object({
  ELECTRON_RENDERER_URL: z.string().trim().optional(),
  SIDECAR_WS_URL: wsUrlSchema.optional(),
  SIDECAR_PORT: z.string().trim().optional(),
});

const featureEnvSchema = z.object({
  VOICE_ENABLED: z.enum(["true", "false"]).optional(),
  TTS_ENABLED: z.enum(["true", "false"]).optional(),
  TTS_BACKEND: z.enum(["web-speech", "kokoro", "mlx"]).optional(),
  LITERT_AUDIO_BACKEND: z.enum(["CPU", "GPU"]).optional(),
});

const inferenceEnvSchema = z.object({
  MODEL_FILE: z.string().trim().optional(),
  LITERT_CPP_BIN: z.string().trim().optional(),
  LITERT_CPP_MODEL: z.string().trim().optional(),
  LITERT_CPP_TTS_BACKEND: z.string().trim().optional(),
});

const piperEnvSchema = z.object({
  PIPER_BIN: z.string().trim().optional(),
  PIPER_MODEL: z.string().trim().optional(),
  PIPER_CONFIG: z.string().trim().optional(),
  PIPER_VOICE: z.string().trim().optional(),
});

export const envSchema = runtimeEnvSchema
  .extend(featureEnvSchema.shape)
  .extend(inferenceEnvSchema.shape)
  .extend(piperEnvSchema.shape)
  .loose();

export type ElectronEnv = z.infer<typeof envSchema>;
