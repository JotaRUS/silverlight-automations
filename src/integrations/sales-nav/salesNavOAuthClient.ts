import crypto from 'node:crypto';

import type { Prisma, PrismaClient } from '@prisma/client';

import { AppError } from '../../core/errors/appError';
import { logger } from '../../core/logging/logger';
import {
  decryptProviderCredentials,
  encryptProviderCredentials
} from '../../core/providers/providerCredentialsCrypto';

const LINKEDIN_OAUTH_BASE = 'https://www.linkedin.com/oauth/v2';
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;
const LEAD_SYNC_SCOPE = 'r_marketing_leadgen_automation';

// ---------------------------------------------------------------------------
// Authorization URL builder (Step 1 of 3-legged OAuth)
// ---------------------------------------------------------------------------

export function buildLinkedInAuthorizationUrl(
  clientId: string,
  redirectUri: string,
  state: string,
  scope: string = LEAD_SYNC_SCOPE
): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    scope
  });
  return `${LINKEDIN_OAUTH_BASE}/authorization?${params.toString()}`;
}

export function generateOAuthState(providerAccountId: string): string {
  const nonce = crypto.randomBytes(16).toString('hex');
  return `${providerAccountId}:${nonce}`;
}

export function parseOAuthState(state: string): { providerAccountId: string } {
  const colonIdx = state.indexOf(':');
  if (colonIdx === -1) {
    throw new AppError('Invalid OAuth state parameter', 400, 'invalid_oauth_state');
  }
  return { providerAccountId: state.slice(0, colonIdx) };
}

// ---------------------------------------------------------------------------
// Exchange authorization code for tokens (Step 2)
// ---------------------------------------------------------------------------

interface LinkedInTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  scope?: string;
}

export interface LinkedInOAuthTokens {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken?: string;
  refreshTokenExpiresAt?: string;
  scope?: string;
}

export async function exchangeAuthorizationCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
): Promise<LinkedInOAuthTokens> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri
  });

  const response = await fetch(`${LINKEDIN_OAUTH_BASE}/accessToken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'unknown');
    logger.error(
      { statusCode: response.status, error: errorText },
      'linkedin-oauth-code-exchange-failed'
    );
    throw new AppError(
      'Failed to exchange LinkedIn authorization code for tokens',
      502,
      'linkedin_code_exchange_failed',
      { statusCode: response.status }
    );
  }

  const data = (await response.json()) as LinkedInTokenResponse;
  const now = Date.now();

  return {
    accessToken: data.access_token,
    accessTokenExpiresAt: new Date(now + data.expires_in * 1000).toISOString(),
    refreshToken: data.refresh_token,
    refreshTokenExpiresAt: data.refresh_token_expires_in
      ? new Date(now + data.refresh_token_expires_in * 1000).toISOString()
      : undefined,
    scope: data.scope
  };
}

// ---------------------------------------------------------------------------
// Refresh access token using refresh token (Step 3)
// ---------------------------------------------------------------------------

export async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<LinkedInOAuthTokens> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret
  });

  const response = await fetch(`${LINKEDIN_OAUTH_BASE}/accessToken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'unknown');
    logger.error(
      { statusCode: response.status, error: errorText },
      'linkedin-oauth-token-refresh-failed'
    );
    throw new AppError(
      'Failed to refresh LinkedIn access token — re-authorization may be required',
      502,
      'linkedin_token_refresh_failed',
      { statusCode: response.status }
    );
  }

  const data = (await response.json()) as LinkedInTokenResponse;
  const now = Date.now();

  return {
    accessToken: data.access_token,
    accessTokenExpiresAt: new Date(now + data.expires_in * 1000).toISOString(),
    refreshToken: data.refresh_token ?? refreshToken,
    refreshTokenExpiresAt: data.refresh_token_expires_in
      ? new Date(now + data.refresh_token_expires_in * 1000).toISOString()
      : undefined,
    scope: data.scope
  };
}

// ---------------------------------------------------------------------------
// High-level token retrieval: reads stored tokens, auto-refreshes if expired
// ---------------------------------------------------------------------------

export interface LinkedInCredentials {
  clientId: string;
  clientSecret: string;
  organizationId: string;
  sponsoredAccountId?: string;
  oauthAccessToken?: string;
  oauthAccessTokenExpiresAt?: string;
  oauthRefreshToken?: string;
  oauthRefreshTokenExpiresAt?: string;
  oauthScope?: string;
}

function isTokenExpired(expiresAtIso: string | undefined): boolean {
  if (!expiresAtIso) return true;
  return new Date(expiresAtIso).getTime() <= Date.now() + TOKEN_REFRESH_BUFFER_MS;
}

export async function getLinkedInOAuthToken(
  providerAccountId: string,
  prismaClient: PrismaClient
): Promise<{ token: string; organizationId: string; credentials: LinkedInCredentials }> {
  const account = await prismaClient.providerAccount.findUniqueOrThrow({
    where: { id: providerAccountId }
  });

  const raw = decryptProviderCredentials(account.credentialsJson);
  const creds = raw as unknown as LinkedInCredentials;

  if (!creds.clientId || !creds.clientSecret || !creds.organizationId) {
    throw new AppError(
      'LinkedIn provider account missing required credentials (clientId, clientSecret, organizationId)',
      422,
      'missing_linkedin_credentials'
    );
  }

  if (!creds.oauthAccessToken) {
    throw new AppError(
      'LinkedIn account has not been authorized yet. Click "Authorize with LinkedIn" in the provider settings.',
      422,
      'linkedin_not_authorized'
    );
  }

  if (!isTokenExpired(creds.oauthAccessTokenExpiresAt)) {
    return { token: creds.oauthAccessToken, organizationId: creds.organizationId, credentials: creds };
  }

  if (!creds.oauthRefreshToken || isTokenExpired(creds.oauthRefreshTokenExpiresAt)) {
    throw new AppError(
      'LinkedIn tokens have expired. Please re-authorize by clicking "Authorize with LinkedIn" in the provider settings.',
      401,
      'linkedin_tokens_expired'
    );
  }

  logger.info({ providerAccountId }, 'linkedin-oauth-refreshing-token');
  const refreshed = await refreshAccessToken(creds.oauthRefreshToken, creds.clientId, creds.clientSecret);

  const updatedCreds = {
    ...creds,
    oauthAccessToken: refreshed.accessToken,
    oauthAccessTokenExpiresAt: refreshed.accessTokenExpiresAt,
    oauthRefreshToken: refreshed.refreshToken ?? creds.oauthRefreshToken,
    oauthRefreshTokenExpiresAt: refreshed.refreshTokenExpiresAt ?? creds.oauthRefreshTokenExpiresAt,
    oauthScope: refreshed.scope ?? creds.oauthScope
  };

  const encryptedCreds = encryptProviderCredentials(updatedCreds as unknown as Record<string, unknown>);
  await prismaClient.providerAccount.update({
    where: { id: providerAccountId },
    data: { credentialsJson: encryptedCreds as unknown as Prisma.InputJsonValue }
  });

  return { token: refreshed.accessToken, organizationId: creds.organizationId, credentials: updatedCreds };
}
