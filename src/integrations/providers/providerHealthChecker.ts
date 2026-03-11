import { createSign } from 'node:crypto';

import { createTransport } from 'nodemailer';

import { AppError } from '../../core/errors/appError';
import { requestJson } from '../../core/http/httpJsonClient';
import { logger } from '../../core/logging/logger';
import type { ProviderType } from '../../core/providers/providerTypes';
import { SupabaseDataClient } from '../supabase/supabaseClient';

function buildBearerHeaders(token: string): Record<string, string> {
  return {
    authorization: `Bearer ${token}`
  };
}

function buildProviderApiHeaders(providerType: ProviderType, apiKey: string): Record<string, string> {
  switch (providerType) {
    case 'LEADMAGIC':
    case 'ZELIQ':
    case 'DATAGM':
    case 'PEOPLEDATALABS':
      return { 'x-api-key': apiKey };
    case 'PROSPEO':
      return { 'X-KEY': apiKey };
    case 'ROCKETREACH':
      return { 'Api-Key': apiKey };
    case 'CONTACTOUT':
      return { token: apiKey };
    default:
      return buildBearerHeaders(apiKey);
  }
}

interface HealthCheckResult {
  healthy: boolean;
  details?: Record<string, unknown>;
}

interface ProviderHealthCheckInput {
  providerType: ProviderType;
  credentials: Record<string, unknown>;
  correlationId: string;
}

function credentialString(credentials: Record<string, unknown>, key: string): string {
  const value = credentials[key];
  return typeof value === 'string' ? value : '';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown';
}

function salesNavOauthErrorMessage(error: unknown): string {
  if (
    error instanceof AppError &&
    error.errorCode === 'provider_request_failed' &&
    typeof error.details === 'object' &&
    error.details !== null
  ) {
    const details = error.details as { statusCode?: unknown };
    const statusCode = typeof details.statusCode === 'number' ? details.statusCode : undefined;
    if (statusCode === 400 || statusCode === 401) {
      return 'LinkedIn OAuth token exchange failed. Verify Client ID/Client Secret and app auth settings.';
    }
    if (statusCode === 403) {
      return 'LinkedIn rejected the OAuth token request. Confirm app permissions and product access.';
    }
    if (statusCode !== undefined) {
      return `LinkedIn OAuth token request failed (HTTP ${statusCode}).`;
    }
  }
  return `OAuth token request failed: ${errorMessage(error)}`;
}

async function runLinkedInSalesNavigatorHealthCheck(
  clientId: string,
  clientSecret: string,
  organizationId: string | undefined,
  correlationId: string
): Promise<HealthCheckResult> {
  let token = '';
  try {
    const response = await requestJson<{ access_token?: string }>({
      method: 'POST',
      url: 'https://www.linkedin.com/oauth/v2/accessToken',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret
      }).toString(),
      provider: 'linkedin-sales-navigator',
      operation: 'health-token',
      correlationId
    });
    token = response.access_token ?? '';
  } catch (error) {
    return {
      healthy: false,
      details: {
        phase: 'oauth_token',
        reason: salesNavOauthErrorMessage(error)
      }
    };
  }

  if (!token) {
    return {
      healthy: false,
      details: {
        phase: 'oauth_token',
        reason: 'empty_access_token'
      }
    };
  }

  const leadFormsUrl = organizationId
    ? `https://api.linkedin.com/rest/leadForms?q=owner&owner=(organization:urn%3Ali%3Aorganization%3A${encodeURIComponent(organizationId)})&count=1`
    : 'https://api.linkedin.com/rest/leadForms?q=owner';
  const leadSyncResponse = await fetch(leadFormsUrl, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      'Linkedin-Version': '202602',
      'X-Restli-Protocol-Version': '2.0.0'
    }
  });
  const responseText = await leadSyncResponse.text().catch(() => '');
  const responseSnippet = responseText.slice(0, 300);

  let healthy = false;
  let reason = `Lead Sync probe failed (HTTP ${leadSyncResponse.status}).`;
  if (leadSyncResponse.status >= 200 && leadSyncResponse.status < 300) {
    healthy = true;
    reason = 'Lead Sync endpoint reachable.';
  } else if (leadSyncResponse.status === 400) {
    // Expected when finder params are incomplete; still confirms endpoint access + auth.
    healthy = true;
    reason = 'Lead Sync endpoint reachable (request validation failed as expected for probe).';
  } else if (leadSyncResponse.status === 401) {
    reason = 'Lead Sync authentication failed (invalid/expired bearer token).';
  } else if (leadSyncResponse.status === 403) {
    reason =
      'Lead Sync access denied. Your app may still be under review or missing Lead Sync permissions/roles.';
  }

  return {
    healthy,
    details: {
      phase: 'lead_sync_probe',
      reason,
      statusCode: leadSyncResponse.status,
      statusText: leadSyncResponse.statusText,
      responseSnippet
    }
  };
}

async function runLinkedInUserTokenHealthCheck(
  accessToken: string,
  correlationId: string
): Promise<HealthCheckResult> {
  const endpoint = 'https://api.linkedin.com/v2/userinfo';
  const response = await fetch(endpoint, {
    method: 'GET',
    headers: { authorization: `Bearer ${accessToken}` }
  });

  const responseText = await response.text().catch(() => '');
  let responseJson: unknown = null;
  try {
    responseJson = responseText ? JSON.parse(responseText) : null;
  } catch {
    responseJson = null;
  }
  const responseSnippet = responseText.slice(0, 500);

  logger.info(
    {
      provider: 'linkedin-sales-navigator',
      operation: 'health-user-token',
      correlationId,
      statusCode: response.status,
      endpoint,
      responseSnippet
    },
    'linkedin-sales-nav-user-token-health-check-response'
  );

  if (response.status === 200) {
    return {
      healthy: true,
      details: {
        phase: 'oauth_user_token',
        statusCode: 200,
        endpoint,
        reason: 'LinkedIn OAuth2 user token valid.'
      }
    };
  }

  return {
    healthy: false,
    details: {
      phase: 'oauth_user_token',
      statusCode: response.status,
      endpoint,
      reason:
        response.status === 401
          ? 'LinkedIn OAuth2 user token invalid or expired.'
          : `LinkedIn OAuth2 user token health probe failed (HTTP ${response.status}).`,
      responseBody: responseJson ?? responseSnippet
    }
  };
}

function base64Url(value: string): string {
  return Buffer.from(value).toString('base64url');
}

async function getGoogleAccessToken(
  serviceAccountJson: string,
  correlationId: string
): Promise<string> {
  const parsed = JSON.parse(serviceAccountJson) as {
    client_email: string;
    private_key: string;
    token_uri: string;
  };
  const nowSeconds = Math.floor(Date.now() / 1000);
  const claims = {
    iss: parsed.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: parsed.token_uri,
    exp: nowSeconds + 3600,
    iat: nowSeconds
  };
  const header = {
    alg: 'RS256',
    typ: 'JWT'
  };
  const unsignedToken = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claims))}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsignedToken);
  signer.end();
  const signature = signer.sign(parsed.private_key, 'base64url');
  const assertion = `${unsignedToken}.${signature}`;

  const tokenResponse = await requestJson<{ access_token: string }>({
    method: 'POST',
    url: parsed.token_uri,
    headers: {
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    }).toString(),
    provider: 'google-sheets',
    operation: 'health-token',
    correlationId
  });
  return tokenResponse.access_token;
}

export async function runProviderHealthCheck(
  input: ProviderHealthCheckInput
): Promise<HealthCheckResult> {
  if (input.providerType === 'SUPABASE') {
    const supabaseClient = new SupabaseDataClient();
    const result = await supabaseClient.verifyTableAccess(input.credentials);
    return {
      healthy: true,
      details: {
        reason: 'Supabase reachable and configured table is accessible.',
        ...result
      }
    };
  }

  if (input.providerType === 'LEADMAGIC') {
    const apiKey = credentialString(input.credentials, 'apiKey');
    const endpoint = 'https://api.leadmagic.io/v1/people/email-finder';
    const payload = {
      first_name: 'Test',
      last_name: 'User',
      domain: 'example.com'
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'content-type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const responseText = await response.text().catch(() => '');
    let responseJson: unknown = null;
    try {
      responseJson = responseText ? JSON.parse(responseText) : null;
    } catch {
      responseJson = null;
    }
    const responseSnippet = responseText.slice(0, 500);

    logger.info(
      {
        provider: 'leadmagic',
        operation: 'health-check',
        correlationId: input.correlationId,
        statusCode: response.status,
        endpoint,
        responseSnippet
      },
      'leadmagic-health-check-response'
    );

    // For connection checks, any non-auth/non-forbidden response confirms key + endpoint reachability.
    if (response.status >= 200 && response.status < 300) {
      return {
        healthy: true,
        details: {
          statusCode: response.status,
          endpoint,
          reason: 'Leadmagic reachable and API key accepted.'
        }
      };
    }

    if (response.status === 401 || response.status === 403) {
      return {
        healthy: false,
        details: {
          statusCode: response.status,
          endpoint,
          reason: 'Leadmagic rejected the API key (unauthorized/forbidden).',
          responseBody: responseJson ?? responseSnippet
        }
      };
    }

    return {
      healthy: false,
      details: {
        statusCode: response.status,
        endpoint,
        reason: `Leadmagic health probe failed (HTTP ${response.status}).`,
        responseBody: responseJson ?? responseSnippet
      }
    };
  }

  if (input.providerType === 'EXA') {
    const apiKey = credentialString(input.credentials, 'apiKey');
    const endpoint = 'https://api.exa.ai/search';

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        query: 'test health check',
        type: 'auto',
        num_results: 1
      })
    });

    const responseText = await response.text().catch(() => '');
    let responseJson: unknown = null;
    try {
      responseJson = responseText ? JSON.parse(responseText) : null;
    } catch {
      responseJson = null;
    }
    const responseSnippet = responseText.slice(0, 500);

    logger.info(
      {
        provider: 'exa',
        operation: 'health-check',
        correlationId: input.correlationId,
        statusCode: response.status,
        endpoint,
        responseSnippet
      },
      'exa-health-check-response'
    );

    if (response.status === 200) {
      const body = responseJson as { results?: unknown[] } | null;
      return {
        healthy: true,
        details: {
          statusCode: 200,
          endpoint,
          reason: 'Exa reachable and API key accepted.',
          resultCount: body?.results?.length ?? 0
        }
      };
    }

    if (response.status === 401 || response.status === 403) {
      return {
        healthy: false,
        details: {
          statusCode: response.status,
          endpoint,
          reason: 'Exa rejected the API key.',
          responseBody: responseJson ?? responseSnippet
        }
      };
    }

    return {
      healthy: false,
      details: {
        statusCode: response.status,
        endpoint,
        reason: `Exa health probe failed (HTTP ${response.status}).`,
        responseBody: responseJson ?? responseSnippet
      }
    };
  }

  if (input.providerType === 'ROCKETREACH') {
    const apiKey = credentialString(input.credentials, 'apiKey');
    const endpoint = 'https://api.rocketreach.co/api/v2/person/lookup?name=Test&current_employer=Example';

    const response = await fetch(endpoint, {
      method: 'GET',
      headers: { 'Api-Key': apiKey }
    });

    const responseText = await response.text().catch(() => '');
    let responseJson: unknown = null;
    try {
      responseJson = responseText ? JSON.parse(responseText) : null;
    } catch {
      responseJson = null;
    }
    const responseSnippet = responseText.slice(0, 500);

    logger.info(
      {
        provider: 'rocketreach',
        operation: 'health-check',
        correlationId: input.correlationId,
        statusCode: response.status,
        endpoint: 'https://api.rocketreach.co/api/v2/person/lookup',
        responseSnippet
      },
      'rocketreach-health-check-response'
    );

    if (response.status === 200) {
      return {
        healthy: true,
        details: { statusCode: 200, reason: 'RocketReach reachable and API key accepted.' }
      };
    }

    if (response.status === 401 || response.status === 403) {
      return {
        healthy: false,
        details: {
          statusCode: response.status,
          reason: 'RocketReach rejected the API key.',
          responseBody: responseJson ?? responseSnippet
        }
      };
    }

    // 400 with a valid response means the key works but the test query didn't match -- that's healthy
    if (response.status === 400) {
      return {
        healthy: true,
        details: {
          statusCode: 400,
          reason: 'RocketReach reachable and API key accepted (test lookup returned no match, which is expected).'
        }
      };
    }

    return {
      healthy: false,
      details: {
        statusCode: response.status,
        reason: `RocketReach health probe failed (HTTP ${response.status}).`,
        responseBody: responseJson ?? responseSnippet
      }
    };
  }

  if (input.providerType === 'PROSPEO') {
    const apiKey = credentialString(input.credentials, 'apiKey');
    const endpoint = 'https://api.prospeo.io/account-information';

    const response = await fetch(endpoint, {
      method: 'GET',
      headers: { 'X-KEY': apiKey }
    });

    const responseText = await response.text().catch(() => '');
    let responseJson: unknown = null;
    try {
      responseJson = responseText ? JSON.parse(responseText) : null;
    } catch {
      responseJson = null;
    }
    const responseSnippet = responseText.slice(0, 500);

    logger.info(
      {
        provider: 'prospeo',
        operation: 'health-check',
        correlationId: input.correlationId,
        statusCode: response.status,
        endpoint,
        responseSnippet
      },
      'prospeo-health-check-response'
    );

    if (response.status === 200) {
      const body = responseJson as { error?: boolean; response?: { remaining_credits?: number; current_plan?: string } } | null;
      return {
        healthy: true,
        details: {
          statusCode: 200,
          endpoint,
          reason: 'Prospeo reachable and API key accepted.',
          plan: body?.response?.current_plan,
          remainingCredits: body?.response?.remaining_credits
        }
      };
    }

    if (response.status === 401) {
      return {
        healthy: false,
        details: {
          statusCode: 401,
          endpoint,
          reason: 'Prospeo rejected the API key (INVALID_API_KEY).',
          responseBody: responseJson ?? responseSnippet
        }
      };
    }

    return {
      healthy: false,
      details: {
        statusCode: response.status,
        endpoint,
        reason: `Prospeo health probe failed (HTTP ${response.status}).`,
        responseBody: responseJson ?? responseSnippet
      }
    };
  }

  if (input.providerType === 'TWILIO') {
    const accountSid = credentialString(input.credentials, 'accountSid');
    const authToken = credentialString(input.credentials, 'authToken');
    const encoded = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const response = await requestJson<{ sid?: string; status?: string }>({
      method: 'GET',
      url: `https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`,
      headers: {
        authorization: `Basic ${encoded}`
      },
      provider: 'twilio',
      operation: 'health-check',
      correlationId: input.correlationId
    });
    return {
      healthy: Boolean(response.sid),
      details: response
    };
  }

  if (input.providerType === 'VOICEMAIL_DROP') {
    const accountSid = credentialString(input.credentials, 'accountSid');
    const authToken = credentialString(input.credentials, 'authToken');
    const encoded = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const response = await requestJson<{ sid?: string; status?: string }>({
      method: 'GET',
      url: `https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`,
      headers: {
        authorization: `Basic ${encoded}`
      },
      provider: 'voicemail-drop',
      operation: 'health-check',
      correlationId: input.correlationId
    });
    return {
      healthy: Boolean(response.sid),
      details: response
    };
  }

  if (input.providerType === 'GOOGLE_SHEETS') {
    const spreadsheetId = credentialString(input.credentials, 'spreadsheetId');
    const serviceAccountJson = credentialString(input.credentials, 'serviceAccountJson');
    const accessToken = await getGoogleAccessToken(serviceAccountJson, input.correlationId);
    const response = await requestJson<{ spreadsheetId?: string; properties?: Record<string, unknown> }>({
      method: 'GET',
      url: `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?includeGridData=false`,
      headers: buildBearerHeaders(accessToken),
      provider: 'google-sheets',
      operation: 'health-check',
      correlationId: input.correlationId
    });
    return {
      healthy: Boolean(response.spreadsheetId),
      details: response
    };
  }

  if (input.providerType === 'TELEGRAM') {
    const botToken = credentialString(input.credentials, 'botToken');
    const response = await requestJson<{ ok?: boolean; result?: Record<string, unknown> }>({
      method: 'GET',
      url: `https://api.telegram.org/bot${botToken}/getMe`,
      provider: 'telegram',
      operation: 'health-check',
      correlationId: input.correlationId
    });
    return {
      healthy: Boolean(response.ok),
      details: response.result
    };
  }

  if (input.providerType === 'YAY') {
    const apiKey = credentialString(input.credentials, 'apiKey');
    const response = await requestJson<{ status?: string; account_id?: string }>({
      method: 'GET',
      url: 'https://api.yay.com/v1/account',
      headers: buildBearerHeaders(apiKey),
      provider: 'yay',
      operation: 'health-check',
      correlationId: input.correlationId
    });
    return {
      healthy: Boolean(response.status ?? response.account_id),
      details: response
    };
  }

  if (input.providerType === 'SALES_NAV_WEBHOOK') {
    const oauthAccessToken = credentialString(input.credentials, 'oauthAccessToken');
    if (oauthAccessToken) {
      const oauthUserTokenResult = await runLinkedInUserTokenHealthCheck(
        oauthAccessToken,
        input.correlationId
      );
      if (oauthUserTokenResult.healthy) {
        return oauthUserTokenResult;
      }
    }

    const clientId = credentialString(input.credentials, 'clientId');
    const clientSecret = credentialString(input.credentials, 'clientSecret');
    const organizationId = credentialString(input.credentials, 'organizationId') || undefined;
    return runLinkedInSalesNavigatorHealthCheck(clientId, clientSecret, organizationId, input.correlationId);
  }

  if (input.providerType === 'WIZA') {
    const apiKey = credentialString(input.credentials, 'apiKey');
    const response = await fetch('https://wiza.co/api/meta/credits', {
      method: 'GET',
      headers: { authorization: `Bearer ${apiKey}` }
    });
    const text = await response.text().catch(() => '');
    logger.info({ provider: 'wiza', statusCode: response.status, responseSnippet: text.slice(0, 300) }, 'wiza-health-check-response');
    if (response.status === 200) return { healthy: true, details: { statusCode: 200, reason: 'Wiza reachable and API key accepted.' } };
    if (response.status === 401) return { healthy: false, details: { statusCode: 401, reason: 'Wiza rejected the API key.' } };
    return { healthy: false, details: { statusCode: response.status, reason: `Wiza health probe failed (HTTP ${response.status}).` } };
  }

  if (input.providerType === 'FORAGER') {
    const apiKey = credentialString(input.credentials, 'apiKey');
    const response = await fetch('https://api-v2.forager.ai/api/users/current/', {
      method: 'GET',
      headers: { 'X-API-KEY': apiKey }
    });
    const text = await response.text().catch(() => '');
    logger.info({ provider: 'forager', statusCode: response.status, responseSnippet: text.slice(0, 300) }, 'forager-health-check-response');
    if (response.status === 200) return { healthy: true, details: { statusCode: 200, reason: 'Forager reachable and API key accepted.' } };
    if (response.status === 401 || response.status === 403) return { healthy: false, details: { statusCode: response.status, reason: 'Forager rejected the API key.' } };
    return { healthy: false, details: { statusCode: response.status, reason: `Forager health probe failed (HTTP ${response.status}).` } };
  }

  if (input.providerType === 'ZELIQ') {
    const apiKey = credentialString(input.credentials, 'apiKey');
    const response = await fetch('https://api.zeliq.com/api/credits/balance', {
      method: 'GET',
      headers: { 'x-api-key': apiKey }
    });
    const text = await response.text().catch(() => '');
    logger.info({ provider: 'zeliq', statusCode: response.status, responseSnippet: text.slice(0, 300) }, 'zeliq-health-check-response');
    if (response.status === 200) return { healthy: true, details: { statusCode: 200, reason: 'Zeliq reachable and API key accepted.' } };
    if (response.status === 401) return { healthy: false, details: { statusCode: 401, reason: 'Zeliq rejected the API key.' } };
    return { healthy: false, details: { statusCode: response.status, reason: `Zeliq health probe failed (HTTP ${response.status}).` } };
  }

  if (input.providerType === 'CONTACTOUT') {
    const apiKey = credentialString(input.credentials, 'apiKey');
    const period = new Date().toISOString().slice(0, 7);
    const response = await fetch(`https://api.contactout.com/v1/stats?period=${period}`, {
      method: 'GET',
      headers: { token: apiKey, authorization: 'basic' }
    });
    const text = await response.text().catch(() => '');
    logger.info({ provider: 'contactout', statusCode: response.status, responseSnippet: text.slice(0, 300) }, 'contactout-health-check-response');
    if (response.status === 200) return { healthy: true, details: { statusCode: 200, reason: 'ContactOut reachable and API key accepted.' } };
    if (response.status === 401 || response.status === 403) return { healthy: false, details: { statusCode: response.status, reason: 'ContactOut rejected the API key.' } };
    return { healthy: false, details: { statusCode: response.status, reason: `ContactOut health probe failed (HTTP ${response.status}).` } };
  }

  if (input.providerType === 'DATAGM') {
    const apiKey = credentialString(input.credentials, 'apiKey');
    const response = await fetch(`https://gateway.datagma.net/api/ingress/v1/mine?apiId=${encodeURIComponent(apiKey)}`, {
      method: 'GET'
    });
    const text = await response.text().catch(() => '');
    logger.info({ provider: 'datagma', statusCode: response.status, responseSnippet: text.slice(0, 300) }, 'datagma-health-check-response');
    if (response.status === 200) return { healthy: true, details: { statusCode: 200, reason: 'Datagma reachable and API key accepted.' } };
    if (response.status === 401 || response.status === 403) return { healthy: false, details: { statusCode: response.status, reason: 'Datagma rejected the API key.' } };
    return { healthy: false, details: { statusCode: response.status, reason: `Datagma health probe failed (HTTP ${response.status}).` } };
  }

  if (input.providerType === 'PEOPLEDATALABS') {
    const apiKey = credentialString(input.credentials, 'apiKey');
    const response = await fetch('https://api.peopledatalabs.com/v5/person/enrich?profile=linkedin.com/in/seanthorne', {
      method: 'GET',
      headers: { 'X-Api-Key': apiKey }
    });
    const text = await response.text().catch(() => '');
    logger.info({ provider: 'peopledatalabs', statusCode: response.status, responseSnippet: text.slice(0, 300) }, 'pdl-health-check-response');
    if (response.status === 200) return { healthy: true, details: { statusCode: 200, reason: 'PeopleDataLabs reachable and API key accepted.' } };
    if (response.status === 404) return { healthy: true, details: { statusCode: 404, reason: 'PeopleDataLabs reachable and API key accepted (no match for test query, which is expected).' } };
    if (response.status === 401 || response.status === 403) return { healthy: false, details: { statusCode: response.status, reason: 'PeopleDataLabs rejected the API key.' } };
    return { healthy: false, details: { statusCode: response.status, reason: `PeopleDataLabs health probe failed (HTTP ${response.status}).` } };
  }

  if (input.providerType === 'ANYLEADS') {
    const apiKey = credentialString(input.credentials, 'apiKey');
    const endpoint = 'https://myapiconnect.com/api-product/incoming-webhook/find-emails-first-last';
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ api_key: apiKey, first_name: 'Test', last_name: 'User', domain: 'example.com' })
    });
    const text = await response.text().catch(() => '');
    logger.info({ provider: 'anyleads', statusCode: response.status, responseSnippet: text.slice(0, 300) }, 'anyleads-health-check-response');
    if (response.status >= 200 && response.status < 300) return { healthy: true, details: { statusCode: response.status, reason: 'Anyleads reachable and API key accepted.' } };
    if (response.status === 401 || response.status === 403) return { healthy: false, details: { statusCode: response.status, reason: 'Anyleads rejected the API key.' } };
    return { healthy: false, details: { statusCode: response.status, reason: `Anyleads health probe failed (HTTP ${response.status}).` } };
  }

  if (input.providerType === 'VIBER') {
    const apiKey = credentialString(input.credentials, 'apiKey');
    const endpoint = 'https://chatapi.viber.com/pa/get_account_info';
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'x-viber-auth-token': apiKey,
        'content-type': 'application/json'
      },
      body: JSON.stringify({})
    });

    const responseText = await response.text().catch(() => '');
    let responseJson: { status?: number; status_message?: string } | null = null;
    try {
      responseJson = responseText ? (JSON.parse(responseText) as { status?: number; status_message?: string }) : null;
    } catch {
      responseJson = null;
    }
    const responseSnippet = responseText.slice(0, 500);

    logger.info(
      {
        provider: 'viber',
        operation: 'health-check',
        correlationId: input.correlationId,
        statusCode: response.status,
        endpoint,
        responseSnippet
      },
      'viber-health-check-response'
    );

    if (response.status === 200 && responseJson?.status === 0) {
      return {
        healthy: true,
        details: {
          statusCode: 200,
          endpoint,
          reason: 'Viber reachable and API key accepted.'
        }
      };
    }

    if (response.status === 401 || response.status === 403 || responseJson?.status_message === 'invalidAuthToken') {
      return {
        healthy: false,
        details: {
          statusCode: response.status,
          endpoint,
          reason: 'Viber rejected the API key (invalid auth token).',
          responseBody: responseJson ?? responseSnippet
        }
      };
    }

    return {
      healthy: false,
      details: {
        statusCode: response.status,
        endpoint,
        reason: `Viber health probe failed (HTTP ${response.status}).`,
        responseBody: responseJson ?? responseSnippet
      }
    };
  }

  if (input.providerType === 'LINKEDIN') {
    const oauthAccessToken = credentialString(input.credentials, 'oauthAccessToken');
    if (oauthAccessToken) {
      const oauthUserTokenResult = await runLinkedInUserTokenHealthCheck(
        oauthAccessToken,
        input.correlationId
      );
      if (oauthUserTokenResult.healthy) {
        return oauthUserTokenResult;
      }
    }

    const clientId = credentialString(input.credentials, 'clientId');
    const clientSecret = credentialString(input.credentials, 'clientSecret');
    if (clientId && clientSecret) {
      return runLinkedInSalesNavigatorHealthCheck(clientId, clientSecret, undefined, input.correlationId);
    }

    const apiKey = credentialString(input.credentials, 'apiKey');
    const endpoint = 'https://api.linkedin.com/v2/userinfo';

    const response = await fetch(endpoint, {
      method: 'GET',
      headers: { authorization: `Bearer ${apiKey}` }
    });

    const responseText = await response.text().catch(() => '');
    let responseJson: unknown = null;
    try {
      responseJson = responseText ? JSON.parse(responseText) : null;
    } catch {
      responseJson = null;
    }
    const responseSnippet = responseText.slice(0, 500);

    logger.info(
      {
        provider: 'linkedin',
        operation: 'health-check',
        correlationId: input.correlationId,
        statusCode: response.status,
        endpoint,
        responseSnippet
      },
      'linkedin-health-check-response'
    );

    if (response.status === 200) {
      return {
        healthy: true,
        details: {
          statusCode: 200,
          endpoint,
          reason: 'LinkedIn OAuth2 access token valid.'
        }
      };
    }

    if (response.status === 401) {
      return {
        healthy: false,
        details: {
          statusCode: 401,
          endpoint,
          reason: 'LinkedIn access token invalid or expired.',
          responseBody: responseJson ?? responseSnippet
        }
      };
    }

    if (response.status === 403) {
      return {
        healthy: false,
        details: {
          statusCode: 403,
          endpoint,
          reason: 'LinkedIn access denied. Token may lack required scopes (e.g. openid, profile).',
          responseBody: responseJson ?? responseSnippet
        }
      };
    }

    return {
      healthy: false,
      details: {
        statusCode: response.status,
        endpoint,
        reason: `LinkedIn health probe failed (HTTP ${response.status}).`,
        responseBody: responseJson ?? responseSnippet
      }
    };
  }

  if (input.providerType === 'WHATSAPP_2CHAT') {
    const apiKey = credentialString(input.credentials, 'apiKey');
    const endpoint = 'https://api.p.2chat.io/open/info';
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: { 'X-User-API-Key': apiKey }
    });

    const responseText = await response.text().catch(() => '');
    let responseJson: unknown = null;
    try {
      responseJson = responseText ? JSON.parse(responseText) : null;
    } catch {
      responseJson = null;
    }
    const responseSnippet = responseText.slice(0, 500);

    logger.info(
      {
        provider: 'whatsapp-2chat',
        operation: 'health-check',
        correlationId: input.correlationId,
        statusCode: response.status,
        endpoint,
        responseSnippet
      },
      'whatsapp-2chat-health-check-response'
    );

    if (response.status >= 200 && response.status < 300) {
      return {
        healthy: true,
        details: {
          statusCode: response.status,
          endpoint,
          reason: '2Chat reachable and API key accepted.'
        }
      };
    }

    if (response.status === 401 || response.status === 403) {
      return {
        healthy: false,
        details: {
          statusCode: response.status,
          endpoint,
          reason: '2Chat rejected the API key (unauthorized/forbidden).',
          responseBody: responseJson ?? responseSnippet
        }
      };
    }

    return {
      healthy: false,
      details: {
        statusCode: response.status,
        endpoint,
        reason: `2Chat health probe failed (HTTP ${response.status}).`,
        responseBody: responseJson ?? responseSnippet
      }
    };
  }

  if (input.providerType === 'LINE') {
    const apiKey = credentialString(input.credentials, 'apiKey');
    const endpoint = 'https://api.line.me/v2/bot/info';

    const response = await fetch(endpoint, {
      method: 'GET',
      headers: { authorization: `Bearer ${apiKey}` }
    });

    const responseText = await response.text().catch(() => '');
    let responseJson: unknown = null;
    try {
      responseJson = responseText ? JSON.parse(responseText) : null;
    } catch {
      responseJson = null;
    }
    const responseSnippet = responseText.slice(0, 500);

    logger.info(
      {
        provider: 'line',
        operation: 'health-check',
        correlationId: input.correlationId,
        statusCode: response.status,
        endpoint,
        responseSnippet
      },
      'line-health-check-response'
    );

    if (response.status === 200) {
      const body = responseJson as { userId?: string; basicId?: string; displayName?: string } | null;
      return {
        healthy: true,
        details: {
          statusCode: 200,
          endpoint,
          reason: 'LINE reachable and channel access token accepted.',
          displayName: body?.displayName ?? undefined
        }
      };
    }

    if (response.status === 401 || response.status === 403) {
      return {
        healthy: false,
        details: {
          statusCode: response.status,
          endpoint,
          reason: 'LINE rejected the channel access token (unauthorized/forbidden).',
          responseBody: responseJson ?? responseSnippet
        }
      };
    }

    return {
      healthy: false,
      details: {
        statusCode: response.status,
        endpoint,
        reason: `LINE health probe failed (HTTP ${response.status}).`,
        responseBody: responseJson ?? responseSnippet
      }
    };
  }

  if (input.providerType === 'KAKAOTALK') {
    const apiKey = credentialString(input.credentials, 'apiKey');
    const endpoint = 'https://kapi.kakao.com/v1/api/talk/profile';

    const response = await fetch(endpoint, {
      method: 'GET',
      headers: { authorization: `Bearer ${apiKey}` }
    });

    const responseText = await response.text().catch(() => '');
    let responseJson: unknown = null;
    try {
      responseJson = responseText ? JSON.parse(responseText) : null;
    } catch {
      responseJson = null;
    }
    const responseSnippet = responseText.slice(0, 500);

    logger.info(
      {
        provider: 'kakaotalk',
        operation: 'health-check',
        correlationId: input.correlationId,
        statusCode: response.status,
        endpoint,
        responseSnippet
      },
      'kakaotalk-health-check-response'
    );

    if (response.status === 200) {
      const body = responseJson as { nickName?: string; profileImageUrl?: string } | null;
      return {
        healthy: true,
        details: {
          statusCode: 200,
          endpoint,
          reason: 'KakaoTalk reachable and access token accepted.',
          nickName: body?.nickName ?? undefined
        }
      };
    }

    if (response.status === 401 || response.status === 403) {
      return {
        healthy: false,
        details: {
          statusCode: response.status,
          endpoint,
          reason: 'KakaoTalk rejected the access token (unauthorized/forbidden).',
          responseBody: responseJson ?? responseSnippet
        }
      };
    }

    return {
      healthy: false,
      details: {
        statusCode: response.status,
        endpoint,
        reason: `KakaoTalk health probe failed (HTTP ${response.status}).`,
        responseBody: responseJson ?? responseSnippet
      }
    };
  }

  if (input.providerType === 'EMAIL_PROVIDER') {
    const host = credentialString(input.credentials, 'host');
    const portRaw = input.credentials.port;
    const port = typeof portRaw === 'number' ? portRaw : 587;
    const user = credentialString(input.credentials, 'user');
    const pass = credentialString(input.credentials, 'pass');

    if (!host || !user || !pass) {
      return {
        healthy: false,
        details: {
          reason: 'SMTP credentials incomplete. host, user, and pass are required.',
          hasHost: Boolean(host),
          hasUser: Boolean(user),
          hasPass: Boolean(pass)
        }
      };
    }

    const transporter = createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass }
    });

    try {
      await transporter.verify();
      logger.info(
        {
          provider: 'email-provider',
          operation: 'health-check',
          correlationId: input.correlationId,
          host,
          port
        },
        'email-provider-health-check-success'
      );
      return {
        healthy: true,
        details: {
          reason: 'SMTP server reachable and credentials accepted.',
          host,
          port
        }
      };
    } catch (error) {
      logger.info(
        {
          provider: 'email-provider',
          operation: 'health-check',
          correlationId: input.correlationId,
          host,
          port,
          error: errorMessage(error)
        },
        'email-provider-health-check-failed'
      );
      return {
        healthy: false,
        details: {
          reason: `SMTP connection failed: ${errorMessage(error)}`,
          host,
          port
        }
      };
    }
  }

  if (input.providerType === 'RESPONDIO') {
    const apiKey = credentialString(input.credentials, 'apiKey');
    const endpoint = 'https://api.respond.io/v2/channels';
    const url = `${endpoint}?limit=1`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json'
      }
    });

    const responseText = await response.text().catch(() => '');
    let responseJson: unknown = null;
    try {
      responseJson = responseText ? JSON.parse(responseText) : null;
    } catch {
      responseJson = null;
    }
    const responseSnippet = responseText.slice(0, 500);

    logger.info(
      {
        provider: 'respondio',
        operation: 'health-check',
        correlationId: input.correlationId,
        statusCode: response.status,
        endpoint,
        responseSnippet
      },
      'respondio-health-check-response'
    );

    if (response.status >= 200 && response.status < 300) {
      return {
        healthy: true,
        details: {
          statusCode: response.status,
          endpoint,
          reason: 'Respond.io reachable and API key accepted.'
        }
      };
    }

    if (response.status === 401 || response.status === 403) {
      return {
        healthy: false,
        details: {
          statusCode: response.status,
          endpoint,
          reason: 'Respond.io rejected the API key (unauthorized/forbidden).',
          responseBody: responseJson ?? responseSnippet
        }
      };
    }

    return {
      healthy: false,
      details: {
        statusCode: response.status,
        endpoint,
        reason: `Respond.io health probe failed (HTTP ${response.status}).`,
        responseBody: responseJson ?? responseSnippet
      }
    };
  }

  if (input.providerType === 'WECHAT') {
    const apiKey = credentialString(input.credentials, 'apiKey');
    const endpoint = `https://api.weixin.qq.com/cgi-bin/get_api_domain_ip?access_token=${encodeURIComponent(apiKey)}`;

    const response = await fetch(endpoint, {
      method: 'GET'
    });

    const responseText = await response.text().catch(() => '');
    let responseJson: unknown = null;
    try {
      responseJson = responseText ? JSON.parse(responseText) : null;
    } catch {
      responseJson = null;
    }
    const responseSnippet = responseText.slice(0, 500);

    logger.info(
      {
        provider: 'wechat',
        operation: 'health-check',
        correlationId: input.correlationId,
        statusCode: response.status,
        endpoint: 'https://api.weixin.qq.com/cgi-bin/get_api_domain_ip',
        responseSnippet
      },
      'wechat-health-check-response'
    );

    if (response.status === 200) {
      const body = responseJson as { ip_list?: string[]; errcode?: number; errmsg?: string } | null;
      if (body?.errcode && body.errcode !== 0) {
        return {
          healthy: false,
          details: {
            statusCode: 200,
            endpoint: 'https://api.weixin.qq.com/cgi-bin/get_api_domain_ip',
            reason: `WeChat API error: ${body.errmsg ?? 'unknown'} (errcode ${body.errcode}).`,
            responseBody: responseJson ?? responseSnippet
          }
        };
      }
      return {
        healthy: true,
        details: {
          statusCode: 200,
          endpoint: 'https://api.weixin.qq.com/cgi-bin/get_api_domain_ip',
          reason: 'WeChat reachable and access_token accepted.',
          ipList: body?.ip_list ?? undefined
        }
      };
    }

    if (response.status === 401 || response.status === 403) {
      return {
        healthy: false,
        details: {
          statusCode: response.status,
          endpoint: 'https://api.weixin.qq.com/cgi-bin/get_api_domain_ip',
          reason: 'WeChat rejected the access_token (unauthorized/forbidden).',
          responseBody: responseJson ?? responseSnippet
        }
      };
    }

    return {
      healthy: false,
      details: {
        statusCode: response.status,
        endpoint: 'https://api.weixin.qq.com/cgi-bin/get_api_domain_ip',
        reason: `WeChat health probe failed (HTTP ${response.status}).`,
        responseBody: responseJson ?? responseSnippet
      }
    };
  }

  const apiKey = credentialString(input.credentials, 'apiKey');
  const genericHealthUrls: Partial<Record<ProviderType, string>> = {};

  const endpoint = genericHealthUrls[input.providerType];
  if (!endpoint) {
    return {
      healthy: true
    };
  }

  await requestJson({
    method: 'GET',
    url: endpoint,
    headers: buildProviderApiHeaders(input.providerType, apiKey),
    provider: `provider:${input.providerType.toLowerCase()}`,
    operation: 'health-check',
    correlationId: input.correlationId
  });

  return {
    healthy: true
  };
}

