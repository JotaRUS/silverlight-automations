import { afterEach, describe, expect, it, vi } from 'vitest';

import { runProviderHealthCheck } from '../../src/integrations/providers/providerHealthChecker';
import { MessagingClient } from '../../src/integrations/messaging/messagingClient';
import { getSalesNavAccessToken } from '../../src/integrations/sales-nav/salesNavOAuthClient';

vi.mock('../../src/db/client', () => ({
  prisma: {}
}));

vi.mock('../../src/integrations/sales-nav/salesNavOAuthClient', () => ({
  getSalesNavAccessToken: vi.fn()
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

describe('LinkedIn OAuth token fallback consistency', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('health check reports healthy by falling back to client credentials when oauth token is expired', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === 'https://api.linkedin.com/v2/userinfo') {
        return Promise.resolve({
          status: 401,
          statusText: 'Unauthorized',
          text: () => Promise.resolve(JSON.stringify({ message: 'expired token' }))
        } as Response);
      }

      if (url === 'https://www.linkedin.com/oauth/v2/accessToken') {
        return Promise.resolve(
          createJsonResponse(200, { access_token: 'client-credentials-token' }) as unknown as Response
        );
      }

      if (url === 'https://api.linkedin.com/rest/leadForms?q=owner') {
        return Promise.resolve({
          status: 400,
          statusText: 'Bad Request',
          text: () => Promise.resolve(JSON.stringify({ message: 'probe validation failure' }))
        } as Response);
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await runProviderHealthCheck({
      providerType: 'SALES_NAV_WEBHOOK',
      credentials: {
        oauthAccessToken: 'expired-oauth-token',
        clientId: 'linkedin-client-id',
        clientSecret: 'linkedin-client-secret'
      },
      correlationId: 'corr-health-1'
    });

    expect(result.healthy).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith('https://api.linkedin.com/v2/userinfo', expect.any(Object));
    expect(fetchMock).toHaveBeenCalledWith('https://www.linkedin.com/oauth/v2/accessToken', expect.any(Object));
  });

  it('retries LinkedIn send with client credentials when oauth token is expired', async () => {
    const resolveMock = vi.fn().mockResolvedValue({
      providerAccountId: 'provider-account-1',
      credentials: {
        oauthAccessToken: 'expired-oauth-token',
        clientId: 'linkedin-client-id',
        clientSecret: 'linkedin-client-secret'
      }
    });
    const markFailureMock = vi.fn().mockResolvedValue(undefined);

    const resolver = {
      resolve: resolveMock,
      markFailure: markFailureMock
    };

    vi.mocked(getSalesNavAccessToken).mockResolvedValue('fresh-client-credentials-token');

    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url !== 'https://api.linkedin.com/v2/messages') {
        throw new Error(`Unexpected fetch URL: ${url}`);
      }

      const authHeader = (init?.headers as Record<string, string> | undefined)?.authorization;
      if (authHeader === 'Bearer expired-oauth-token') {
        return Promise.resolve(
          createJsonResponse(401, { message: 'oauth token expired' }, 'Unauthorized') as unknown as Response
        );
      }
      if (authHeader === 'Bearer fresh-client-credentials-token') {
        return Promise.resolve(
          createJsonResponse(200, { id: 'linkedin-message-1' }, 'OK') as unknown as Response
        );
      }

      return Promise.resolve(
        createJsonResponse(400, { message: 'unexpected auth header' }, 'Bad Request') as unknown as Response
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
    expect(getSalesNavAccessToken).toHaveBeenCalledWith('linkedin-client-id', 'linkedin-client-secret');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(markFailureMock).not.toHaveBeenCalled();
  });
});
