import { describe, expect, it } from 'vitest';

import { LOG_REDACTION_OPTIONS } from '../../src/core/logging/redaction';

describe('LOG_REDACTION_OPTIONS', () => {
  it('includes sensitive auth and credential paths', () => {
    expect(LOG_REDACTION_OPTIONS.paths).toContain('req.headers.authorization');
    expect(LOG_REDACTION_OPTIONS.paths).toContain('headers.cookie');
    expect(LOG_REDACTION_OPTIONS.paths).toContain('accessToken');
    expect(LOG_REDACTION_OPTIONS.paths).toContain('apiKey');
    expect(LOG_REDACTION_OPTIONS.censor).toBe('[REDACTED]');
  });
});
