import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../src/app/createApp';

describe('system health routes', () => {
  it('returns health status', async () => {
    const app = createApp();

    const response = await request(app).get('/api/v1/system/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});
