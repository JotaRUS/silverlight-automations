import { z } from 'zod';

import { providerTypeSchema } from '../../core/providers/providerTypes';

export const providerAccountPathParamsSchema = z.object({
  providerAccountId: z.string().uuid()
});

export const providerAccountCreateSchema = z.object({
  providerType: providerTypeSchema,
  accountLabel: z.string().min(1).max(120),
  credentials: z.record(z.unknown()),
  isActive: z.boolean().optional(),
  rateLimitConfig: z
    .object({
      strategy: z.enum(['round_robin', 'weighted', 'single']).optional(),
      requestsPerMinute: z.number().int().positive().optional(),
      quarantineSeconds: z.number().int().positive().optional()
    })
    .passthrough()
    .optional()
});

export const providerAccountUpdateSchema = providerAccountCreateSchema
  .omit({
    providerType: true
  })
  .partial()
  .refine(
    (value) => Object.keys(value).length > 0,
    {
      message: 'At least one field must be provided'
    }
  );

export const providerAccountListQuerySchema = z.object({
  providerType: providerTypeSchema.optional(),
  isActive: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => {
      if (!value) {
        return undefined;
      }
      return value === 'true';
    })
});

export const providerAccountBindProjectSchema = z.object({
  projectId: z.string().uuid()
});

