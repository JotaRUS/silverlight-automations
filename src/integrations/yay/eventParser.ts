import { z } from 'zod';

import type { YayWebhookEvent } from './types';

const yayWebhookEventSchema = z.object({
  event_id: z.string().min(1),
  event_type: z.enum([
    'call.started',
    'call.ringing',
    'call.answered',
    'call.ended',
    'call.failed',
    'call.recording_ready'
  ]),
  event_version: z.string().min(1),
  timestamp: z.string().datetime(),
  account_id: z.string().min(1),
  data: z.object({
    call_id: z.string().min(1),
    direction: z.enum(['outbound', 'inbound']),
    status: z.string().min(1),
    from: z.object({
      number: z.string().min(1),
      extension: z.string().optional()
    }),
    to: z.object({
      number: z.string().min(1),
      country: z.string().optional()
    }),
    call_metadata: z
      .object({
        project_id: z.string().min(1),
        expert_id: z.string().min(1),
        call_task_id: z.string().min(1),
        caller_id: z.string().min(1)
      })
      .optional(),
    timing: z.object({
      initiated_at: z.string().datetime().optional(),
      answered_at: z.string().datetime().optional(),
      ended_at: z.string().datetime().optional(),
      duration_seconds: z.number().int().nonnegative(),
      billable_seconds: z.number().int().nonnegative().optional(),
      ring_duration_seconds: z.number().int().nonnegative().optional()
    }),
    termination: z.object({
      reason: z.string().min(1),
      sip_code: z.number().int().optional()
    }),
    recording: z
      .object({
        available: z.boolean(),
        recording_id: z.string().optional(),
        recording_url: z.string().url().optional()
      })
      .optional()
  })
});

export function parseYayWebhookEvent(payload: unknown): YayWebhookEvent {
  return yayWebhookEventSchema.parse(payload);
}
