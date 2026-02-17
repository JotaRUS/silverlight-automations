import { z } from 'zod';

export const callerCreateSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  timezone: z.string().min(1),
  languageCodes: z.array(z.string().min(2)).min(1),
  regionIsoCodes: z.array(z.string().length(2)).min(1),
  metadata: z.record(z.unknown()).optional()
});

export const callerUpdateSchema = callerCreateSchema.partial();

export const callerPathParamsSchema = z.object({
  callerId: z.string().uuid()
});
