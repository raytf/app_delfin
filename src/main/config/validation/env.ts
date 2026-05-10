import { z } from "zod";

const wsUrlSchema = z
  .string()
  .trim()
  .refine(
    (value) => value.startsWith("ws://") || value.startsWith("wss://"),
    'expected a WebSocket URL starting with "ws://" or "wss://"',
  );

const httpUrlSchema = z
  .string()
  .trim()
  .refine(
    (value) => value.startsWith("http://") || value.startsWith("https://"),
    'expected an HTTP URL starting with "http://" or "https://"',
  );

const runtimeEnvSchema = z.object({
  ELECTRON_RENDERER_URL: z.string().trim().optional(),
  SIDECAR_WS_URL: wsUrlSchema,
  SIDECAR_URL: httpUrlSchema,
});

const featureEnvSchema = z.object({
  VOICE_ENABLED: z.enum(["true", "false"]).optional(),
  TTS_ENABLED: z.enum(["true", "false"]).optional(),
});

const childProcessEnvSchema = z.object({
  SIDECAR_PORT: z.string().trim().optional(),
  MODEL_FILE: z.string().trim().optional(),
  LITERT_CPP_BIN: z.string().trim().optional(),
  LITERT_CPP_MODEL: z.string().trim().optional(),
  TTS_BACKEND: z.enum(["none", "piper", "web-speech", "kokoro", "mlx"]).optional(),
  PIPER_BIN: z.string().trim().optional(),
  PIPER_MODEL: z.string().trim().optional(),
  PIPER_CONFIG: z.string().trim().optional(),
  PIPER_SAMPLE_RATE: z.string().trim().optional(),
  PIPER_VOICE: z.string().trim().optional(),
});

export const envSchema = runtimeEnvSchema
  .extend(featureEnvSchema.shape)
  .extend(childProcessEnvSchema.shape)
  .loose();

export type ElectronEnv = z.infer<typeof envSchema>;
export type ElectronChildProcessEnv = z.infer<typeof childProcessEnvSchema>;
