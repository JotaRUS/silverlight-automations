import { afterEach, describe, expect, it, vi } from 'vitest';

import { MessagingClient } from '../../src/integrations/messaging/messagingClient';

vi.mock('../../src/db/client', () => ({
  prisma: {}
}));

interface MockJsonResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
  statusText?: string;
}

function createJsonResponse(status: number, body: unknown, statusText = ''): MockJsonResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
    statusText
  };
}

describe('LinkedIn OAuth token in messaging', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('uses stored OAuth token for LinkedIn messaging when token is valid', async () => {
    const futureExpiry = new Date(Date.now() + 3600 * 1000).toISOString();
    const resolveMock = vi.fn().mockResolvedValue({
      providerAccountId: 'provider-account-1',
      credentials: {
        oauthAccessToken: 'valid-oauth-token',
        oauthAccessTokenExpiresAt: futureExpiry,
        clientId: 'linkedin-client-id',
        clientSecret: 'linkedin-client-secret'
      }
    });
    const markFailureMock = vi.fn().mockResolvedValue(undefined);

    const resolver = {
      resolve: resolveMock,
      markFailure: markFailureMock
    };

    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      const authHeader = (init?.headers as Record<string, string> | undefined)?.authorization;
      expect(authHeader).toBe('Bearer valid-oauth-token');
      return Promise.resolve(
        createJsonResponse(200, { id: 'linkedin-message-1' }, 'OK') as unknown as Response
      );
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new MessagingClient(resolver as never);
    const result = await client.sendMessage({
      projectId: 'project-1',
      channel: 'linkedin',
      recipient: 'urn:li:person:abc123',
      body: 'hello',
      correlationId: 'corr-send-1'
    });

    expect(result.providerMessageId).toBe('linkedin-message-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws when LinkedIn OAuth token is expired (no client_credentials fallback)', async () => {
    const pastExpiry = new Date(Date.now() - 3600 * 1000).toISOString();
    const resolveMock = vi.fn().mockResolvedValue({
      providerAccountId: 'provider-account-1',
      credentials: {
        oauthAccessToken: 'expired-oauth-token',
        oauthAccessTokenExpiresAt: pastExpiry,
        clientId: 'linkedin-client-id',
        clientSecret: 'linkedin-client-secret'
      }
    });
    const markFailureMock = vi.fn().mockResolvedValue(undefined);

    const resolver = {
      resolve: resolveMock,
      markFailure: markFailureMock
    };

    const fetchMock = vi.fn(() =>
      Promise.resolve(
        createJsonResponse(401, { message: 'Unauthorized' }, 'Unauthorized') as unknown as Response
      )
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new MessagingClient(resolver as never);
    await expect(
      client.sendMessage({
        projectId: 'project-1',
        channel: 'linkedin',
        recipient: 'urn:li:person:abc123',
        body: 'hello',
        correlationId: 'corr-send-2'
      })
    ).rejects.toThrow();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(markFailureMock).toHaveBeenCalled();
  });
});
