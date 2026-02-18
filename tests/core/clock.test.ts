import { describe, expect, it } from 'vitest';

import { FixedClock } from '../../src/core/time/clock';

describe('FixedClock', () => {
  it('returns deterministic now values', () => {
    const fixedDate = new Date('2026-02-17T10:00:00.000Z');
    const fixedClock = new FixedClock(fixedDate);

    expect(fixedClock.now().toISOString()).toBe('2026-02-17T10:00:00.000Z');
    expect(fixedClock.now().toISOString()).toBe('2026-02-17T10:00:00.000Z');
  });
});
