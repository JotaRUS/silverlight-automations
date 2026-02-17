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
