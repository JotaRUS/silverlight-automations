import { createHmac } from 'node:crypto';

import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../../src/app/createApp';
import { env } from '../../src/config/env';
import { prisma } from '../../src/db/client';
import { cleanDatabase, disconnectDatabase } from './helpers/testDb';

function signYayPayload(timestamp: string, payload: unknown): string {
  return createHmac('sha256', env.YAY_WEBHOOK_SECRET).update(timestamp + JSON.stringify(payload)).digest('hex');
}

describe('yay webhook idempotency integration', () => {
  const app = createApp();

  beforeEach(async () => {
    await cleanDatabase();
  });

  it('accepts first event and rejects duplicates by event id', async () => {
    const payload = {
      event_id: 'event_1234',
      event_type: 'call.started',
      event_version: '1.0',
      timestamp: new Date().toISOString(),
      account_id: 'account_1',
      data: {
        call_id: 'call_1234',
        direction: 'outbound',
        status: 'started',
        from: {
          number: '+123456789'
        },
        to: {
          number: '+198765432'
        },
        call_metadata: {
          project_id: 'project_1',
          expert_id: 'expert_1',
          call_task_id: 'task_1',
          caller_id: 'caller_1'
        },
        timing: {
          initiated_at: new Date().toISOString(),
          duration_seconds: 0,
          billable_seconds: 0,
          ring_duration_seconds: 0
        },
        termination: {
          reason: 'in_progress'
        }
      }
    } as const;

    const timestamp = new Date().toISOString();
    const signature = signYayPayload(timestamp, payload);

    const firstResponse = await request(app)
      .post('/webhooks/yay')
      .set('x-yay-signature', signature)
      .set('x-yay-timestamp', timestamp)
      .set('x-yay-event-id', payload.event_id)
      .send(payload);

    expect(firstResponse.status).toBe(200);
    expect(firstResponse.body).toEqual({ accepted: true });

    const duplicateResponse = await request(app)
      .post('/webhooks/yay')
      .set('x-yay-signature', signature)
      .set('x-yay-timestamp', timestamp)
      .set('x-yay-event-id', payload.event_id)
      .send(payload);

    expect(duplicateResponse.status).toBe(200);
    expect(duplicateResponse.body).toEqual({
      accepted: false,
      reason: 'duplicate'
    });

    const processedEventCount = await prisma.processedWebhookEvent.count();
    const rawLogCount = await prisma.callLogRaw.count();

    expect(processedEventCount).toBe(1);
    expect(rawLogCount).toBe(1);
  });
});

afterAll(async () => {
  await disconnectDatabase();
});
