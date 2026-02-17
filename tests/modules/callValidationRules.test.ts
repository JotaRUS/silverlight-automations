import { describe, expect, it } from 'vitest';

import { evaluateCallFraud } from '../../src/modules/call-validation/callValidationRules';

describe('evaluateCallFraud', () => {
  it('flags short calls as fraud', () => {
    const result = evaluateCallFraud({
      durationSeconds: 2,
      timezoneMismatch: false,
      recentShortCalls: 1
    });
    expect(result.isFraud).toBe(true);
    expect(result.shouldSuspend).toBe(false);
  });

  it('suspends after repeated short calls', () => {
    const result = evaluateCallFraud({
      durationSeconds: 2,
      timezoneMismatch: false,
      recentShortCalls: 3
    });
    expect(result.isFraud).toBe(true);
    expect(result.shouldSuspend).toBe(true);
  });

  it('flags timezone mismatch as fraud', () => {
    const result = evaluateCallFraud({
      durationSeconds: 20,
      timezoneMismatch: true,
      recentShortCalls: 0
    });
    expect(result.isFraud).toBe(true);
  });

  it('passes valid calls', () => {
    const result = evaluateCallFraud({
      durationSeconds: 20,
      timezoneMismatch: false,
      recentShortCalls: 0
    });
    expect(result.isFraud).toBe(false);
    expect(result.shouldSuspend).toBe(false);
  });
});
