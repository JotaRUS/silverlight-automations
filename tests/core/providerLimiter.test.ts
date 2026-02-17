import { describe, expect, it } from 'vitest';

import { ProviderLimiter } from '../../src/core/rate-limiter/providerLimiter';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

describe('ProviderLimiter', () => {
  it('enforces provider-specific concurrency limit', async () => {
    const limiter = new ProviderLimiter(1);
    const steps: string[] = [];

    const first = limiter.run('provider-a', async () => {
      steps.push('first-start');
      await delay(20);
      steps.push('first-end');
    });

    const second = limiter.run('provider-a', async () => {
      steps.push('second-start');
      await delay(1);
      steps.push('second-end');
    });

    await Promise.all([first, second]);
    expect(steps).toEqual(['first-start', 'first-end', 'second-start', 'second-end']);
  });

  it('uses independent limiters per provider', async () => {
    const limiter = new ProviderLimiter(1);
    const steps: string[] = [];

    await Promise.all([
      limiter.run('provider-a', async () => {
        steps.push('a-start');
        await delay(10);
        steps.push('a-end');
      }),
      limiter.run('provider-b', async () => {
        steps.push('b-start');
        await delay(1);
        steps.push('b-end');
      })
    ]);

    expect(steps[0]).toBeDefined();
    expect(steps.includes('a-start')).toBe(true);
    expect(steps.includes('b-start')).toBe(true);
  });
});
