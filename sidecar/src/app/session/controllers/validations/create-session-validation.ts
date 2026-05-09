import { z } from 'zod';
import { trimmedStringSchema } from '../../../../shared/validations/common';

export const createSessionValidationSchema = z.object({
  sessionName: trimmedStringSchema,
  presetId: trimmedStringSchema.optional(),
});

export type CreateSessionValidation = z.infer<typeof createSessionValidationSchema>;
