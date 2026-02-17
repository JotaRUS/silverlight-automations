import { describe, expect, it } from 'vitest';

import { salesNavWebhookPayloadSchema } from '../../src/modules/sales-nav/salesNavWebhookSchemas';

describe('salesNavWebhookPayloadSchema', () => {
  it('accepts valid payload', () => {
    const parsed = salesNavWebhookPayloadSchema.safeParse({
      projectId: 'ee65e470-9fe2-43f8-ab7f-cf10ec95f496',
      sourceUrl: 'https://www.linkedin.com/sales/search/people?query=abc',
      normalizedUrl: 'https://www.linkedin.com/sales/search/people?query=abc',
      metadata: {},
      leads: [
        {
          fullName: 'Jane Doe',
          linkedinUrl: 'https://www.linkedin.com/in/jane-doe'
        }
      ]
    });

    expect(parsed.success).toBe(true);
  });

  it('rejects invalid project id', () => {
    const parsed = salesNavWebhookPayloadSchema.safeParse({
      projectId: 'not-a-uuid',
      sourceUrl: 'https://www.linkedin.com/sales/search/people?query=abc',
      normalizedUrl: 'https://www.linkedin.com/sales/search/people?query=abc',
      metadata: {},
      leads: []
    });

    expect(parsed.success).toBe(false);
  });
});
