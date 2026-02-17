import { z } from 'zod';

export const projectCreateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  targetThreshold: z.number().int().positive(),
  geographyIsoCodes: z.array(z.string().length(2)).min(1),
  priority: z.number().int().min(0).default(0),
  overrideCooldown: z.boolean().default(false),
  regionConfig: z.record(z.unknown()).default({})
});

export const projectUpdateSchema = projectCreateSchema.partial();

export const attachCompaniesSchema = z.object({
  companies: z
    .array(
      z.object({
        name: z.string().min(1),
        domain: z.string().optional(),
        countryIso: z.string().length(2).optional(),
        metadata: z.record(z.unknown()).optional()
      })
    )
    .min(1)
});

export const salesNavSearchCreateSchema = z.object({
  searches: z
    .array(
      z.object({
        sourceUrl: z.string().url(),
        normalizedUrl: z.string().url(),
        metadata: z.record(z.unknown()).default({})
      })
    )
    .min(6)
});

export const screeningQuestionCreateSchema = z.object({
  prompt: z.string().min(1),
  displayOrder: z.number().int().min(1),
  required: z.boolean().default(true),
  metadata: z.record(z.unknown()).optional()
});

export const screeningQuestionUpdateSchema = screeningQuestionCreateSchema.partial();
