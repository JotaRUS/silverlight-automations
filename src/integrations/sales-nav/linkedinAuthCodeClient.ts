import { requestJson } from '../../core/http/httpJsonClient';

export interface LinkedInAuthorizationCodeTokenResponse {
  access_token: string;
  expires_in: number;
  scope?: string;
  refresh_token?: string;
  refresh_token_expires_in?: number;
}

interface BuildAuthorizeUrlInput {
  clientId: string;
  redirectUri: string;
  state: string;
  scopes: string[];
}

interface ExchangeAuthCodeInput {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  correlationId: string;
}

export function buildLinkedInRedirectUri(externalAppBaseUrl: string): string {
  return `${externalAppBaseUrl.replace(/\/+$/, '')}/api/v1/auth/linkedin/callback`;
}

export function buildLinkedInAuthorizeUrl(input: BuildAuthorizeUrlInput): string {
  const scopes = input.scopes.join(' ');
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    state: input.state,
    scope: scopes
  });
  return `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;
}

export async function exchangeLinkedInAuthorizationCode(
  input: ExchangeAuthCodeInput
): Promise<LinkedInAuthorizationCodeTokenResponse> {
  return requestJson<LinkedInAuthorizationCodeTokenResponse>({
    method: 'POST',
    url: 'https://www.linkedin.com/oauth/v2/accessToken',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: input.code,
      redirect_uri: input.redirectUri,
      client_id: input.clientId,
      client_secret: input.clientSecret
    }).toString(),
    provider: 'linkedin-sales-navigator',
    operation: 'exchange-auth-code',
    correlationId: input.correlationId
  });
}
