import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createApp } from '../../src/app/createApp';

const tokenResponseSchema = z.object({
  accessToken: z.string(),
  tokenType: z.string()
});

const meResponseSchema = z.object({
  userId: z.string(),
  role: z.string()
});

describe('auth routes', () => {
  it('issues and verifies JWT token', async () => {
    const app = createApp();

    const tokenResponse = await request(app).post('/api/v1/auth/token').send({
      userId: 'user-1',
      role: 'admin'
    });

    expect(tokenResponse.status).toBe(200);
    const tokenPayload = tokenResponseSchema.parse(tokenResponse.body);
    expect(tokenPayload.accessToken).toBeTruthy();

    const meResponse = await request(app)
      .get('/api/v1/auth/me')
      .set('authorization', `Bearer ${tokenPayload.accessToken}`);

    expect(meResponse.status).toBe(200);
    const mePayload = meResponseSchema.parse(meResponse.body);
    expect(mePayload.userId).toBe('user-1');
    expect(mePayload.role).toBe('admin');
  });
});
