import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '../../src/core/errors/appError';
import { requestJson } from '../../src/core/http/httpJsonClient';

describe('requestJson', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('sends json body with content-type and parses response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: true })
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const response = await requestJson<{ success: boolean }>({
      method: 'POST',
      url: 'https://example.test/api',
      body: { alpha: 1 },
      provider: 'test-provider',
      operation: 'create',
      correlationId: 'cid-1'
    });

    expect(response.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(call[1].headers).toMatchObject({ 'content-type': 'application/json' });
    expect(call[1].body).toBe(JSON.stringify({ alpha: 1 }));
  });

  it('throws AppError for non-ok responses', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: () => Promise.resolve({ error: 'bad_gateway' })
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      requestJson({
        method: 'GET',
        url: 'https://example.test/fail',
        provider: 'test-provider',
        operation: 'fetch',
        correlationId: 'cid-2'
      })
    ).rejects.toBeInstanceOf(AppError);
  });
});
