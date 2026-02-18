import { describe, expect, it } from 'vitest';

import {
  deduplicateNormalizedTitles,
  normalizeJobTitle
} from '../../src/modules/job-title-engine/titleNormalizer';

describe('job title normalizer', () => {
  it('normalizes punctuation and casing', () => {
    expect(normalizeJobTitle('Senior Director, R&D')).toBe('senior director r d');
  });

  it('deduplicates normalized variants', () => {
    const result = deduplicateNormalizedTitles([
      'VP, Sales',
      'vp sales',
      ' VP  Sales ',
      'Head of Sales'
    ]);
    expect(result).toEqual(['vp sales', 'head of sales']);
  });
});
