import { z } from "zod";
import { trimmedStringSchema } from "../../../../shared/validations/common";

export const updateSessionValidationSchema = z.object({
  name: trimmedStringSchema.optional(),
});

export type UpdateSessionValidation = z.infer<
  typeof updateSessionValidationSchema
>;
