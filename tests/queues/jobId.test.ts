import { describe, expect, it } from 'vitest';

import { buildJobId } from '../../src/queues/jobId';

describe('buildJobId', () => {
  it('replaces colons and slashes in all parts', () => {
    const jobId = buildJobId('yay', 'event:123', 'https://example.com/a:b');
    expect(jobId).toBe('yay--event_123--https___example.com_a_b');
    expect(jobId.includes(':')).toBe(false);
  });

  it('normalizes nullish values to na placeholders', () => {
    const jobId = buildJobId('prefix', undefined, null, 42);
    expect(jobId).toBe('prefix--na--na--42');
  });
});
