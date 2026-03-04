import { z } from 'zod';

import { salesNavWebhookLeadSchema } from '../../queues/definitions/jobPayloadSchemas';

export const salesNavWebhookPayloadSchema = z.object({
  projectId: z.string().uuid(),
  sourceUrl: z.string().url(),
  normalizedUrl: z.string().url(),
  metadata: z.record(z.unknown()).default({}),
  pageCursor: z.string().optional(),
  leads: z.array(salesNavWebhookLeadSchema).default([])
});

export type SalesNavWebhookPayload = z.infer<typeof salesNavWebhookPayloadSchema>;

export const linkedInLeadNotificationSchema = z.object({
  type: z.literal('LEAD_ACTION'),
  leadGenFormResponse: z.string().min(1),
  leadGenForm: z.string().optional(),
  owner: z.record(z.unknown()).optional(),
  associatedEntity: z.record(z.unknown()).optional(),
  leadType: z.string().min(1),
  leadAction: z.enum(['CREATED', 'DELETED']),
  occurredAt: z.number()
});

export type LinkedInLeadNotification = z.infer<typeof linkedInLeadNotificationSchema>;
