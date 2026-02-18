import { describe, expect, it } from 'vitest';

import { callerCreateSchema } from '../../src/modules/callers/callersSchemas';

describe('callerCreateSchema', () => {
  it('validates required caller payload fields', () => {
    const result = callerCreateSchema.safeParse({
      email: 'caller@example.com',
      name: 'Caller One',
      timezone: 'Europe/London',
      languageCodes: ['en'],
      regionIsoCodes: ['GB']
    });

    expect(result.success).toBe(true);
  });

  it('rejects invalid email', () => {
    const result = callerCreateSchema.safeParse({
      email: 'invalid-email',
      name: 'Caller One',
      timezone: 'Europe/London',
      languageCodes: ['en'],
      regionIsoCodes: ['GB']
    });

    expect(result.success).toBe(false);
  });
});
