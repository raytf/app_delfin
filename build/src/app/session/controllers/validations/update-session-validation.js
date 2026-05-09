import { z } from 'zod';
import { trimmedStringSchema } from '../../../../shared/validations/common';
export const updateSessionValidationSchema = z.object({
    sessionName: trimmedStringSchema.optional(),
});
