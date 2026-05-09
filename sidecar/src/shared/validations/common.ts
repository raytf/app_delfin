import { z } from 'zod';

export const trimmedStringSchema = z.string().trim().min(1);
export const trimmedEmailSchema = z.string().trim().email();
