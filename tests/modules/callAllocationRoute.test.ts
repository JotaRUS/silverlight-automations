import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createApp } from '../../src/app/createApp';

const errorResponseSchema = z.object({
  error: z.object({
    code: z.string()
  })
});

const tokenResponseSchema = z.object({
  accessToken: z.string()
});

describe('call allocation route', () => {
  it('rejects unauthenticated current task request', async () => {
    const app = createApp();
    const response = await request(app).get('/api/v1/call-tasks/current');
    expect(response.status).toBe(401);
    expect(errorResponseSchema.parse(response.body).error.code).toBe('missing_authorization_header');
  });

  it('blocks non-caller role from caller-only current task endpoint', async () => {
    const app = createApp();
    const tokenResponse = await request(app).post('/api/v1/auth/token').send({
      userId: 'admin-user',
      role: 'admin'
    });
    const token = tokenResponseSchema.parse(tokenResponse.body).accessToken;

    const response = await request(app)
      .get('/api/v1/call-tasks/current')
      .set('authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(errorResponseSchema.parse(response.body).error.code).toBe('forbidden');
  });

  it('blocks caller role from operator task management endpoints', async () => {
    const app = createApp();
    const tokenResponse = await request(app).post('/api/v1/auth/token').send({
      userId: 'caller-user',
      role: 'caller'
    });
    const token = tokenResponseSchema.parse(tokenResponse.body).accessToken;

    const response = await request(app)
      .get('/api/v1/call-tasks/operator/tasks')
      .set('authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(errorResponseSchema.parse(response.body).error.code).toBe('forbidden');
  });
});
