import { z } from 'zod';
import { providerTypeSchema } from '../../core/providers/providerTypes';

const enrichmentProviderTypeSchema = providerTypeSchema.refine(
  (providerType) =>
    providerType === 'LEADMAGIC' ||
    providerType === 'PROSPEO' ||
    providerType === 'EXA' ||
    providerType === 'ROCKETREACH' ||
    providerType === 'WIZA' ||
    providerType === 'FORAGER' ||
    providerType === 'ZELIQ' ||
    providerType === 'CONTACTOUT' ||
    providerType === 'DATAGM' ||
    providerType === 'PEOPLEDATALABS',
  {
    message: 'providerType must be an enrichment provider'
  }
);

const providerBindingSchema = z
  .object({
    apolloProviderAccountId: z.string().uuid().optional(),
    salesNavWebhookProviderAccountId: z.string().uuid().optional(),
    leadmagicProviderAccountId: z.string().uuid().optional(),
    prospeoProviderAccountId: z.string().uuid().optional(),
    exaProviderAccountId: z.string().uuid().optional(),
    rocketreachProviderAccountId: z.string().uuid().optional(),
    wizaProviderAccountId: z.string().uuid().optional(),
    foragerProviderAccountId: z.string().uuid().optional(),
    zeliqProviderAccountId: z.string().uuid().optional(),
    contactoutProviderAccountId: z.string().uuid().optional(),
    datagmProviderAccountId: z.string().uuid().optional(),
    peopledatalabsProviderAccountId: z.string().uuid().optional(),
    linkedinProviderAccountId: z.string().uuid().optional(),
    emailProviderAccountId: z.string().uuid().optional(),
    twilioProviderAccountId: z.string().uuid().optional(),
    whatsapp2chatProviderAccountId: z.string().uuid().optional(),
    respondioProviderAccountId: z.string().uuid().optional(),
    lineProviderAccountId: z.string().uuid().optional(),
    wechatProviderAccountId: z.string().uuid().optional(),
    viberProviderAccountId: z.string().uuid().optional(),
    telegramProviderAccountId: z.string().uuid().optional(),
    kakaotalkProviderAccountId: z.string().uuid().optional(),
    voicemailDropProviderAccountId: z.string().uuid().optional(),
    yayProviderAccountId: z.string().uuid().optional(),
    googleSheetsProviderAccountId: z.string().uuid().optional()
  })
  .strict();

export const projectCreateSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().optional(),
    targetThreshold: z.number().int().positive(),
    geographyIsoCodes: z.array(z.string().length(2)).min(1),
    priority: z.number().int().min(0).default(0),
    overrideCooldown: z.boolean().default(false),
    regionConfig: z.record(z.unknown()).default({}),
    enrichmentRoutingConfig: z
      .object({
        enrichment_strategy: z.enum(['weighted', 'ordered', 'single']),
        providers: z.array(
          z.object({
            providerType: enrichmentProviderTypeSchema,
            providerAccountId: z.string().uuid(),
            weight: z.number().int().positive().optional(),
            order: z.number().int().positive().optional()
          })
        )
      })
      .optional()
      .nullable()
  })
  .merge(providerBindingSchema)
  .strict();

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
