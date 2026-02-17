import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createApp } from '../../src/app/createApp';

const openApiSchema = z.object({
  openapi: z.string(),
  paths: z.record(z.unknown())
});

describe('openapi endpoint', () => {
  it('returns openapi specification', async () => {
    const app = createApp();
    const response = await request(app).get('/api/v1/openapi.json');

    expect(response.status).toBe(200);
    const parsedBody = openApiSchema.parse(response.body);
    expect(parsedBody.openapi).toBe('3.1.0');
    expect(parsedBody.paths['/api/v1/projects']).toBeDefined();
  });
});
