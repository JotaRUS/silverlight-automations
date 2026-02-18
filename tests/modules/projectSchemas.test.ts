import { describe, expect, it } from 'vitest';

import { salesNavSearchCreateSchema } from '../../src/modules/projects/projectSchemas';

describe('salesNavSearchCreateSchema', () => {
  it('requires at least six Sales Navigator URLs', () => {
    const result = salesNavSearchCreateSchema.safeParse({
      searches: Array.from({ length: 5 }).map((_, index) => ({
        sourceUrl: `https://www.linkedin.com/sales/search/${String(index)}`,
        normalizedUrl: `https://www.linkedin.com/sales/search/${String(index)}`,
        metadata: {}
      }))
    });

    expect(result.success).toBe(false);
  });

  it('accepts six Sales Navigator URLs', () => {
    const result = salesNavSearchCreateSchema.safeParse({
      searches: Array.from({ length: 6 }).map((_, index) => ({
        sourceUrl: `https://www.linkedin.com/sales/search/${String(index)}`,
        normalizedUrl: `https://www.linkedin.com/sales/search/${String(index)}`,
        metadata: {}
      }))
    });

    expect(result.success).toBe(true);
  });
});
