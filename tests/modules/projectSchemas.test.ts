import { describe, expect, it } from 'vitest';

import { salesNavSearchCreateSchema } from '../../src/modules/projects/projectSchemas';

describe('salesNavSearchCreateSchema', () => {
  it('requires at least one Sales Navigator search', () => {
    const result = salesNavSearchCreateSchema.safeParse({
      searches: []
    });

    expect(result.success).toBe(false);
  });

  it('accepts a single Sales Navigator search', () => {
    const result = salesNavSearchCreateSchema.safeParse({
      searches: [
        {
          sourceUrl: 'https://www.linkedin.com/sales/search/people?query=abc',
          normalizedUrl: 'https://www.linkedin.com/sales/search/people?query=abc',
          metadata: {}
        }
      ]
    });

    expect(result.success).toBe(true);
  });
});
