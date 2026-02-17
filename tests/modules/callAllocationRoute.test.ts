import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createApp } from '../../src/app/createApp';

const errorResponseSchema = z.object({
  error: z.object({
    code: z.string()
  })
});

describe('call allocation route', () => {
  it('rejects unauthenticated current task request', async () => {
    const app = createApp();
    const response = await request(app).get('/api/v1/call-tasks/current');
    expect(response.status).toBe(401);
    expect(errorResponseSchema.parse(response.body).error.code).toBe('missing_authorization_header');
  });
});
