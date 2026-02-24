import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createApp } from '../../src/app/createApp';

const errorResponseSchema = z.object({
  error: z.object({
    code: z.string()
  })
});

const loginResponseSchema = z.object({
  authenticated: z.boolean()
});

describe('call allocation route', () => {
  it('rejects unauthenticated current task request', async () => {
    const app = createApp();
    const response = await request(app).get('/api/v1/call-tasks/current');
    expect(response.status).toBe(401);
    expect(errorResponseSchema.parse(response.body).error.code).toBe('missing_auth_cookie');
  });

  it('blocks non-caller role from caller-only current task endpoint', async () => {
    const app = createApp();
    const loginResponse = await request(app).post('/api/v1/auth/login').send({
      userId: 'admin-user',
      role: 'admin'
    });
    loginResponseSchema.parse(loginResponse.body);
    const authCookie = loginResponse.headers['set-cookie'][0];

    const response = await request(app)
      .get('/api/v1/call-tasks/current')
      .set('cookie', authCookie);

    expect(response.status).toBe(403);
    expect(errorResponseSchema.parse(response.body).error.code).toBe('forbidden');
  });

  it('blocks caller role from operator task management endpoints', async () => {
    const app = createApp();
    const loginResponse = await request(app).post('/api/v1/auth/login').send({
      userId: 'caller-user',
      role: 'caller'
    });
    loginResponseSchema.parse(loginResponse.body);
    const authCookie = loginResponse.headers['set-cookie'][0];

    const response = await request(app)
      .get('/api/v1/call-tasks/operator/tasks')
      .set('cookie', authCookie);

    expect(response.status).toBe(403);
    expect(errorResponseSchema.parse(response.body).error.code).toBe('forbidden');
  });
});
