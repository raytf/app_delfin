import { z } from 'zod';

const positiveInt = z.coerce.number().int().positive();
const nonNegativeInt = z.coerce.number().int().min(0);

export const envSchema = z.object({
  SIDECAR_PORT: positiveInt.optional(),

  LITERT_CPP_BIN: z.string().trim().optional(),
  LITERT_CPP_MODEL: z.string().trim().optional(),

  TTS_BACKEND: z.enum(['none', 'piper']).optional(),
  TTS_SOFT_MIN_CHARS: nonNegativeInt.optional(),
  TTS_SOFT_MAX_CHARS: nonNegativeInt.optional(),

  PIPER_BIN: z.string().trim().optional(),
  PIPER_MODEL: z.string().trim().optional(),
  PIPER_CONFIG: z.string().trim().optional(),
  PIPER_SAMPLE_RATE: positiveInt.optional(),
});

export type SidecarEnv = z.infer<typeof envSchema>;
