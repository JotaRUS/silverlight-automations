import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createProviderAccount,
  listProviderAccounts,
  updateProviderAccount
} from '@/services/providerService';

describe('provider service', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('performs list, create, and update requests', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => []
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'provider-1',
          providerType: 'APOLLO',
          accountLabel: 'Apollo Main'
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'provider-1',
          providerType: 'APOLLO',
          accountLabel: 'Apollo Main Updated'
        })
      });
    vi.stubGlobal('fetch', fetchMock);

    const list = await listProviderAccounts();
    const created = await createProviderAccount({
      providerType: 'APOLLO',
      accountLabel: 'Apollo Main',
      credentials: {
        apiKey: 'key'
      }
    });
    const updated = await updateProviderAccount('provider-1', {
      accountLabel: 'Apollo Main Updated'
    });

    expect(list).toEqual([]);
    expect(created.accountLabel).toBe('Apollo Main');
    expect(updated.accountLabel).toBe('Apollo Main Updated');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
