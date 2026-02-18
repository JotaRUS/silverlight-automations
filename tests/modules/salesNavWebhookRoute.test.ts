import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createApp } from '../../src/app/createApp';

const webhookErrorResponseSchema = z.object({
  error: z.object({
    code: z.string()
  })
});

describe('sales nav webhook route', () => {
  it('rejects unauthorized webhook requests', async () => {
    const app = createApp();

    const response = await request(app).post('/webhooks/sales-nav').send({
      projectId: 'ee65e470-9fe2-43f8-ab7f-cf10ec95f496',
      sourceUrl: 'https://www.linkedin.com/sales/search/people?query=abc',
      normalizedUrl: 'https://www.linkedin.com/sales/search/people?query=abc',
      metadata: {},
      leads: []
    });

    expect(response.status).toBe(401);
    const body = webhookErrorResponseSchema.parse(response.body);
    expect(body.error.code).toBe('sales_nav_webhook_unauthorized');
  });
});
