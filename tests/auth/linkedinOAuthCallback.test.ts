import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('../../src/queues/redis', () => ({
  redisConnection: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1)
  }
}));

import { createApp } from '../../src/app/createApp';

const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string()
  })
});

describe('linkedin oauth callback route', () => {
  it('rejects callback when OAuth state is invalid', async () => {
    const app = createApp();

    const response = await request(app)
      .get('/api/v1/auth/linkedin/callback')
      .query({ code: 'dummy-code', state: 'invalid-state' });

    expect(response.status).toBe(400);
    const parsed = errorResponseSchema.parse(response.body);
    expect(parsed.error.code).toBe('invalid_oauth_state');
  });

  it('returns oauth error details from linkedin callback', async () => {
    const app = createApp();

    const response = await request(app)
      .get('/api/v1/auth/linkedin/callback')
      .query({ error: 'access_denied', error_description: 'user_denied' });

    expect(response.status).toBe(400);
    const parsed = errorResponseSchema.parse(response.body);
    expect(parsed.error.code).toBe('linkedin_oauth_error');
    expect(parsed.error.message).toBe('user_denied');
  });
});
