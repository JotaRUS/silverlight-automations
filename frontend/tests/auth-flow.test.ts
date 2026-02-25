import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchCsrfToken, login } from '@/services/authService';

describe('auth service flow', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs in and retrieves csrf token', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          authenticated: true,
          userId: 'admin-1',
          role: 'admin'
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          csrfToken: 'csrf-abc'
        })
      });

    vi.stubGlobal('fetch', fetchMock);

    const authUser = await login({
      userId: 'admin-1',
      role: 'admin'
    });
    const csrfToken = await fetchCsrfToken();

    expect(authUser.userId).toBe('admin-1');
    expect(authUser.role).toBe('admin');
    expect(csrfToken).toBe('csrf-abc');
  });
});
