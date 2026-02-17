import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../src/app/createApp';

describe('openapi endpoint', () => {
  it('returns openapi specification', async () => {
    const app = createApp();
    const response = await request(app).get('/api/v1/openapi.json');

    expect(response.status).toBe(200);
    expect(response.body.openapi).toBe('3.1.0');
    expect(response.body.paths['/api/v1/projects']).toBeDefined();
  });
});
