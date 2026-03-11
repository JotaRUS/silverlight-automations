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
    providerType === 'PEOPLEDATALABS' ||
    providerType === 'ANYLEADS',
  {
    message: 'providerType must be an enrichment provider'
  }
);

const optionalUuidOrNull = z.string().uuid().optional().nullable();

const providerBindingSchema = z
  .object({
    apolloProviderAccountId: optionalUuidOrNull,
    salesNavWebhookProviderAccountId: optionalUuidOrNull,
    leadmagicProviderAccountId: optionalUuidOrNull,
    prospeoProviderAccountId: optionalUuidOrNull,
    exaProviderAccountId: optionalUuidOrNull,
    rocketreachProviderAccountId: optionalUuidOrNull,
    wizaProviderAccountId: optionalUuidOrNull,
    foragerProviderAccountId: optionalUuidOrNull,
    zeliqProviderAccountId: optionalUuidOrNull,
    contactoutProviderAccountId: optionalUuidOrNull,
    datagmProviderAccountId: optionalUuidOrNull,
    peopledatalabsProviderAccountId: optionalUuidOrNull,
    linkedinProviderAccountId: optionalUuidOrNull,
    emailProviderAccountId: optionalUuidOrNull,
    twilioProviderAccountId: optionalUuidOrNull,
    whatsapp2chatProviderAccountId: optionalUuidOrNull,
    respondioProviderAccountId: optionalUuidOrNull,
    lineProviderAccountId: optionalUuidOrNull,
    wechatProviderAccountId: optionalUuidOrNull,
    viberProviderAccountId: optionalUuidOrNull,
    telegramProviderAccountId: optionalUuidOrNull,
    kakaotalkProviderAccountId: optionalUuidOrNull,
    voicemailDropProviderAccountId: optionalUuidOrNull,
    yayProviderAccountId: optionalUuidOrNull,
    anyleadsProviderAccountId: optionalUuidOrNull,
    googleSheetsProviderAccountId: optionalUuidOrNull,
    supabaseProviderAccountId: optionalUuidOrNull
  })
  .strict();

export const projectCreateSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().optional().nullable(),
    targetThreshold: z.number().int().positive(),
    geographyIsoCodes: z.array(z.string().length(2)).min(1),
    priority: z.number().int().min(0).default(0),
    status: z.enum(['ACTIVE', 'COMPLETED', 'PAUSED', 'ARCHIVED']).optional(),
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
      .nullable(),
    outreachMessageTemplate: z.string().optional().nullable()
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
});

export const attachJobTitlesSchema = z.object({
  jobTitles: z
    .array(
      z.object({
        title: z.string().min(1),
        relevanceScore: z.number().min(0).max(1).optional()
      })
    )
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
    .min(1)
});

export const screeningQuestionCreateSchema = z.object({
  prompt: z.string().min(1),
  displayOrder: z.number().int().min(1),
  required: z.boolean().default(true),
  metadata: z.record(z.unknown()).optional()
});

export const screeningQuestionUpdateSchema = screeningQuestionCreateSchema.partial();
