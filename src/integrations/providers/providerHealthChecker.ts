import { createSign } from 'node:crypto';

import { AppError } from '../../core/errors/appError';
import { requestJson } from '../../core/http/httpJsonClient';
import { logger } from '../../core/logging/logger';
import type { ProviderType } from '../../core/providers/providerTypes';

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
    const clientId = credentialString(input.credentials, 'clientId');
    const clientSecret = credentialString(input.credentials, 'clientSecret');
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
        provider: 'sales-nav',
        operation: 'health-token',
        correlationId: input.correlationId
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

    // Probe a Lead Sync REST endpoint to verify actual API reachability.
    // 400/403 still indicates endpoint reached (for example, product review pending or missing owner filters).
    const leadSyncResponse = await fetch('https://api.linkedin.com/rest/leadForms?q=owner', {
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

  const apiKey = credentialString(input.credentials, 'apiKey');
  const genericHealthUrls: Partial<Record<ProviderType, string>> = {
    APOLLO: 'https://api.apollo.io/v1/auth/health',
    ROCKETREACH: 'https://api.rocketreach.co/api/v2/person/lookup',
    WIZA: 'https://api.wiza.co/v1/enrich',
    FORAGER: 'https://api-v2.forager.ai/api/{account_id}/datastorage/person_detail_lookup/',
    ZELIQ: 'https://api.zeliq.com/api/contact/enrich/email',
    CONTACTOUT: 'https://api.contactout.com/v1/linkedin/enrich',
    DATAGM: 'https://gateway.datagma.net/api/ingress/v2/full',
    PEOPLEDATALABS: 'https://api.peopledatalabs.com/v5/person/enrich',
    LINKEDIN: 'https://api.linkedin.com/v2/me',
    EMAIL_PROVIDER: 'https://api.email-provider.example/v1/health',
    WHATSAPP_2CHAT: 'https://api.2chat.co/v1/messages',
    RESPONDIO: 'https://api.respond.io/v2/message',
    LINE: 'https://api.line.me/v2/bot/info',
    WECHAT: 'https://api.wechat.com/v1/account',
    VIBER: 'https://chatapi.viber.com/pa/get_account_info',
    KAKAOTALK: 'https://kapi.kakao.com/v1/api/talk/profile',
    VOICEMAIL_DROP: 'https://api.voicemail-drop.example/v1/health'
  };

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

