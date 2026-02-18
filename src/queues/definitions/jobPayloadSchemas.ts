import { z } from 'zod';

import { jobTitleDiscoveryRequestSchema } from '../../modules/job-title-engine/jobTitleDiscoverySchemas';

export const salesNavWebhookLeadSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  fullName: z.string().optional(),
  companyName: z.string().optional(),
  jobTitle: z.string().optional(),
  linkedinUrl: z.string().url().optional(),
  countryIso: z.string().length(2).optional(),
  regionIso: z.string().length(2).optional(),
  emails: z.array(z.string().email()).default([]),
  phones: z.array(z.string()).default([]),
  metadata: z.record(z.unknown()).default({})
});

export const salesNavIngestionJobSchema = z.object({
  projectId: z.string().uuid(),
  sourceUrl: z.string().url(),
  normalizedUrl: z.string().url(),
  metadata: z.record(z.unknown()).default({}),
  pageCursor: z.string().optional(),
  leads: z.array(salesNavWebhookLeadSchema).default([])
});

export type SalesNavIngestionJob = z.infer<typeof salesNavIngestionJobSchema>;

export const leadIngestionJobSchema = z.object({
  projectId: z.string().uuid(),
  salesNavSearchId: z.string().uuid(),
  lead: salesNavWebhookLeadSchema
});

export type LeadIngestionJob = z.infer<typeof leadIngestionJobSchema>;

export const enrichmentJobSchema = z.object({
  leadId: z.string().uuid(),
  projectId: z.string().uuid(),
  fullName: z.string().optional(),
  companyName: z.string().optional(),
  linkedinUrl: z.string().url().optional(),
  countryIso: z.string().length(2).optional(),
  emails: z.array(z.string().email()).default([]),
  phones: z.array(z.string()).default([])
});

export type EnrichmentJob = z.infer<typeof enrichmentJobSchema>;

export const jobTitleDiscoveryJobSchema = jobTitleDiscoveryRequestSchema;

export type JobTitleDiscoveryJob = z.infer<typeof jobTitleDiscoveryJobSchema>;

export const googleSheetsSyncJobSchema = z.object({
  projectId: z.string().uuid().optional(),
  tabName: z.string().min(1),
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  rowData: z.array(z.string()).optional(),
  entityPayload: z.record(z.unknown()).optional()
});

export type GoogleSheetsSyncJob = z.infer<typeof googleSheetsSyncJobSchema>;

export const outreachMessageJobSchema = z.object({
  projectId: z.string().uuid(),
  expertId: z.string().uuid(),
  channel: z.enum([
    'PHONE',
    'EMAIL',
    'LINKEDIN',
    'WHATSAPP',
    'RESPONDIO',
    'SMS',
    'IMESSAGE',
    'LINE',
    'WECHAT',
    'VIBER',
    'TELEGRAM',
    'KAKAOTALK',
    'VOICEMAIL'
  ]),
  recipient: z.string().min(1),
  body: z.string().min(1),
  overrideCooldown: z.boolean().default(false)
});

export type OutreachMessageJob = z.infer<typeof outreachMessageJobSchema>;

export const documentationGenerationJobSchema = z.object({
  requestedByUserId: z.string().uuid().optional()
});

export type DocumentationGenerationJob = z.infer<typeof documentationGenerationJobSchema>;

export const callValidationJobSchema = z.object({
  event: z.unknown()
});

export type CallValidationJob = z.infer<typeof callValidationJobSchema>;

export const callAllocationJobSchema = z.object({
  callerId: z.string().uuid()
});

export type CallAllocationJob = z.infer<typeof callAllocationJobSchema>;
