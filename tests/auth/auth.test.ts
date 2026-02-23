import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createApp } from '../../src/app/createApp';

const loginResponseSchema = z.object({
  authenticated: z.boolean(),
  role: z.string(),
  userId: z.string()
});

const csrfResponseSchema = z.object({
  csrfToken: z.string().min(1)
});

const meResponseSchema = z.object({
  userId: z.string(),
  role: z.string()
});

describe('auth routes', () => {
  it('issues cookie session and verifies authenticated profile', async () => {
    const app = createApp();

    const loginResponse = await request(app).post('/api/v1/auth/login').send({
      userId: 'user-1',
      role: 'admin'
    });

    expect(loginResponse.status).toBe(200);
    const loginPayload = loginResponseSchema.parse(loginResponse.body);
    expect(loginPayload.authenticated).toBe(true);
    const authCookie = loginResponse.headers['set-cookie'][0];
    expect(authCookie).toContain('access_token=');

    const csrfResponse = await request(app).get('/api/v1/auth/csrf').set('cookie', authCookie);
    expect(csrfResponse.status).toBe(200);
    const csrfPayload = csrfResponseSchema.parse(csrfResponse.body);
    expect(csrfPayload.csrfToken).toBeTruthy();

    const meResponse = await request(app).get('/api/v1/auth/me').set('cookie', authCookie);

    expect(meResponse.status).toBe(200);
    const mePayload = meResponseSchema.parse(meResponse.body);
    expect(mePayload.userId).toBe('user-1');
    expect(mePayload.role).toBe('admin');
  });
});
