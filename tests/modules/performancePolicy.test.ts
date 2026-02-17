import { describe, expect, it } from 'vitest';

import { computeAllocationStatus } from '../../src/modules/performance-engine/performanceService';

describe('computeAllocationStatus', () => {
  it('keeps restricted statuses unchanged', () => {
    const status = computeAllocationStatus({
      currentStatus: 'RESTRICTED_FRAUD',
      rolling60MinuteDials: 100,
      lowRateConsecutiveMinutes: 0,
      warmupActive: false
    });
    expect(status).toBe('RESTRICTED_FRAUD');
  });

  it('returns warmup status while warmup active', () => {
    const status = computeAllocationStatus({
      currentStatus: 'WARMUP_GRACE',
      rolling60MinuteDials: 0,
      lowRateConsecutiveMinutes: 0,
      warmupActive: true
    });
    expect(status).toBe('WARMUP_GRACE');
  });

  it('returns at risk after five low-rate minutes', () => {
    const status = computeAllocationStatus({
      currentStatus: 'ACTIVE',
      rolling60MinuteDials: 20,
      lowRateConsecutiveMinutes: 5,
      warmupActive: false
    });
    expect(status).toBe('AT_RISK');
  });

  it('returns paused after ten low-rate minutes', () => {
    const status = computeAllocationStatus({
      currentStatus: 'ACTIVE',
      rolling60MinuteDials: 20,
      lowRateConsecutiveMinutes: 10,
      warmupActive: false
    });
    expect(status).toBe('PAUSED_LOW_DIAL_RATE');
  });

  it('returns active when dial threshold met', () => {
    const status = computeAllocationStatus({
      currentStatus: 'PAUSED_LOW_DIAL_RATE',
      rolling60MinuteDials: 30,
      lowRateConsecutiveMinutes: 0,
      warmupActive: false
    });
    expect(status).toBe('ACTIVE');
  });
});
