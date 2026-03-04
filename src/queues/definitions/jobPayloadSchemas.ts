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
  salesNavSearchId: z.string().uuid().optional(),
  source: z.enum(['sales_nav', 'apollo', 'manual']).default('sales_nav'),
  lead: salesNavWebhookLeadSchema
});

export type LeadIngestionJob = z.infer<typeof leadIngestionJobSchema>;

export const apolloLeadSourcingJobSchema = z.object({
  projectId: z.string().uuid(),
  personLocations: z.array(z.string()).optional(),
  personTitles: z.array(z.string()).optional(),
  personSeniorities: z.array(z.string()).optional(),
  personDepartments: z.array(z.string()).optional(),
  personFunctions: z.array(z.string()).optional(),
  personNotTitles: z.array(z.string()).optional(),
  personSkills: z.array(z.string()).optional(),
  organizationDomains: z.array(z.string()).optional(),
  organizationNames: z.array(z.string()).optional(),
  organizationLocations: z.array(z.string()).optional(),
  organizationNumEmployeesRanges: z.array(z.string()).optional(),
  keywords: z.string().optional(),
  maxPages: z.number().int().min(1).max(10).optional(),
  perPage: z.number().int().min(1).max(100).optional()
});

export type ApolloLeadSourcingJob = z.infer<typeof apolloLeadSourcingJobSchema>;

export const enrichmentJobSchema = z.object({
  leadId: z.string().uuid(),
  projectId: z.string().uuid(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  fullName: z.string().optional(),
  companyName: z.string().optional(),
  jobTitle: z.string().optional(),
  linkedinUrl: z.string().url().optional(),
  countryIso: z.string().length(2).optional(),
  emails: z.array(z.string().email()).default([]),
  phones: z.array(z.string()).default([])
});

export type EnrichmentJob = z.infer<typeof enrichmentJobSchema>;

export const jobTitleDiscoveryJobSchema = jobTitleDiscoveryRequestSchema;

export type JobTitleDiscoveryJob = z.infer<typeof jobTitleDiscoveryJobSchema>;

export const googleSheetsSyncJobSchema = z.object({
  projectId: z.string().uuid(),
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
  body: z.string().min(1).optional(),
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

export const linkedInFetchResponseJobSchema = z.object({
  providerAccountId: z.string().uuid(),
  responseId: z.string().min(1),
  formUrn: z.string().optional(),
  organizationId: z.string().min(1),
  leadType: z.string().default('SPONSORED'),
  projectId: z.string().uuid().optional()
});

export type LinkedInFetchResponseJob = z.infer<typeof linkedInFetchResponseJobSchema>;
