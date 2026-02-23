import { createSign } from 'node:crypto';

import { requestJson } from '../../core/http/httpJsonClient';
import type { ProviderType } from '../../core/providers/providerTypes';

function buildBearerHeaders(token: string): Record<string, string> {
  return {
    authorization: `Bearer ${token}`
  };
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

  const apiKey = credentialString(input.credentials, 'apiKey');
  const genericHealthUrls: Partial<Record<ProviderType, string>> = {
    APOLLO: 'https://api.apollo.io/v1/auth/health',
    SALES_NAV_WEBHOOK: 'https://www.linkedin.com',
    LEADMAGIC: 'https://api.leadmagic.io/v1/enrich',
    PROSPEO: 'https://api.prospeo.io/v1/enrichment',
    EXA: 'https://api.exa.ai/enrich',
    ROCKETREACH: 'https://api.rocketreach.co/v2/person/lookup',
    WIZA: 'https://wiza.co/api/v1/enrichment',
    FORAGER: 'https://api.forager.ai/v1/enrichment',
    ZELIQ: 'https://api.zeliq.com/v1/enrich',
    CONTACTOUT: 'https://api.contactout.com/v1/enrich',
    DATAGM: 'https://api.datagm.com/v1/enrich',
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
    headers: buildBearerHeaders(apiKey),
    provider: `provider:${input.providerType.toLowerCase()}`,
    operation: 'health-check',
    correlationId: input.correlationId
  });

  return {
    healthy: true
  };
}

