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
