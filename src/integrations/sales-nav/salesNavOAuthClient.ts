import { AppError } from '../../core/errors/appError';
import { logger } from '../../core/logging/logger';

interface SalesNavTokenResponse {
  access_token: string;
  expires_in: number;
}

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

const tokenCache = new Map<string, CachedToken>();
const TOKEN_REFRESH_BUFFER_MS = 60 * 1000;

export async function getSalesNavAccessToken(
  clientId: string,
  clientSecret: string
): Promise<string> {
  const cacheKey = clientId;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + TOKEN_REFRESH_BUFFER_MS) {
    return cached.accessToken;
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret
  });

  const response = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'unknown');
    logger.error(
      { statusCode: response.status, error: errorText },
      'sales-nav-oauth-token-exchange-failed'
    );
    throw new AppError(
      'Failed to obtain Sales Navigator access token',
      502,
      'sales_nav_token_failed',
      { statusCode: response.status }
    );
  }

  const data = (await response.json()) as SalesNavTokenResponse;

  tokenCache.set(cacheKey, {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000
  });

  return data.access_token;
}

export function clearSalesNavTokenCache(clientId?: string): void {
  if (clientId) {
    tokenCache.delete(clientId);
  } else {
    tokenCache.clear();
  }
}
