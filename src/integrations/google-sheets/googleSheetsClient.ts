import { createSign } from 'node:crypto';

import { AppError } from '../../core/errors/appError';
import { requestJson } from '../../core/http/httpJsonClient';
import { ProviderCredentialResolver } from '../../core/providers/providerCredentialResolver';
import { clock } from '../../core/time/clock';
import { prisma } from '../../db/client';

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
}

export interface GoogleSheetRowInput {
  projectId: string;
  tabName: string;
  rowValues: string[];
}

export interface GoogleSheetUpdateInput extends GoogleSheetRowInput {
  rowNumber: number;
}

interface GoogleSheetsAppendResponse {
  updates?: {
    updatedRange?: string;
  };
}

export class GoogleSheetsClient {
  private readonly credentialResolver: ProviderCredentialResolver;
  private accessToken: string | null = null;
  private activeProviderAccountId: string | null = null;
  private expiresAtEpochMs = 0;

  public constructor(credentialResolver?: ProviderCredentialResolver) {
    this.credentialResolver = credentialResolver ?? new ProviderCredentialResolver(prisma);
  }

  private parseServiceAccount(serviceAccountJson: string): {
    client_email: string;
    private_key: string;
    token_uri: string;
  } {
    const parsed = JSON.parse(serviceAccountJson) as {
      client_email: string;
      private_key: string;
      token_uri: string;
    };

    if (!parsed.client_email || !parsed.private_key || !parsed.token_uri) {
      throw new AppError('Invalid Google service account JSON', 500, 'google_service_account_invalid');
    }

    return parsed;
  }

  private base64Url(value: string): string {
    return Buffer.from(value).toString('base64url');
  }

  private extractRowNumberFromRange(updatedRange: string | undefined): number | null {
    if (!updatedRange) {
      return null;
    }
    const match = /![A-Z]+(\d+):/.exec(updatedRange);
    if (!match) {
      return null;
    }
    return Number.parseInt(match[1], 10);
  }

  private async getAccessToken(
    serviceAccountJson: string,
    correlationId: string,
    providerAccountId: string
  ): Promise<string> {
    if (
      this.accessToken &&
      this.activeProviderAccountId === providerAccountId &&
      this.expiresAtEpochMs > clock.now().getTime() + 30_000
    ) {
      return this.accessToken;
    }

    const serviceAccount = this.parseServiceAccount(serviceAccountJson);
    const now = Math.floor(clock.now().getTime() / 1000);
    const claims = {
      iss: serviceAccount.client_email,
      scope: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file',
      aud: serviceAccount.token_uri,
      exp: now + 3600,
      iat: now
    };
    const header = {
      alg: 'RS256',
      typ: 'JWT'
    };
    const unsignedToken = `${this.base64Url(JSON.stringify(header))}.${this.base64Url(
      JSON.stringify(claims)
    )}`;

    const signer = createSign('RSA-SHA256');
    signer.update(unsignedToken);
    signer.end();
    const signature = signer.sign(serviceAccount.private_key, 'base64url');
    const assertion = `${unsignedToken}.${signature}`;

    const tokenResponse = await requestJson<GoogleTokenResponse>({
      method: 'POST',
      url: serviceAccount.token_uri,
      headers: {
        'content-type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion
      }).toString(),
      provider: 'google-sheets',
      operation: 'oauth-token',
      correlationId
    });

    this.accessToken = tokenResponse.access_token;
    this.activeProviderAccountId = providerAccountId;
    this.expiresAtEpochMs = clock.now().getTime() + tokenResponse.expires_in * 1000;
    return tokenResponse.access_token;
  }

  public async appendRow(input: GoogleSheetRowInput, correlationId: string): Promise<number | null> {
    const resolvedCredentials = await this.credentialResolver.resolve({
      providerType: 'GOOGLE_SHEETS',
      projectId: input.projectId,
      correlationId,
      fallbackStrategy: 'single'
    });
    const spreadsheetId =
      typeof resolvedCredentials.credentials.spreadsheetId === 'string'
        ? resolvedCredentials.credentials.spreadsheetId
        : '';
    const serviceAccountJson =
      typeof resolvedCredentials.credentials.serviceAccountJson === 'string'
        ? resolvedCredentials.credentials.serviceAccountJson
        : '';
    if (!spreadsheetId) {
      throw new AppError('Google spreadsheet id missing', 500, 'google_spreadsheet_id_missing');
    }
    if (!serviceAccountJson) {
      throw new AppError('Google service account missing', 500, 'google_service_account_missing');
    }
    const token = await this.getAccessToken(serviceAccountJson, correlationId, resolvedCredentials.providerAccountId);
    const response = await requestJson<GoogleSheetsAppendResponse>({
      method: 'POST',
      url: `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(input.tabName)}:append?valueInputOption=RAW`,
      headers: {
        authorization: `Bearer ${token}`
      },
      body: {
        values: [input.rowValues]
      },
      provider: 'google-sheets',
      operation: 'append-row',
      correlationId
    });

    return this.extractRowNumberFromRange(response.updates?.updatedRange);
  }

  public async updateRow(input: GoogleSheetUpdateInput, correlationId: string): Promise<void> {
    const resolvedCredentials = await this.credentialResolver.resolve({
      providerType: 'GOOGLE_SHEETS',
      projectId: input.projectId,
      correlationId,
      fallbackStrategy: 'single'
    });
    const spreadsheetId =
      typeof resolvedCredentials.credentials.spreadsheetId === 'string'
        ? resolvedCredentials.credentials.spreadsheetId
        : '';
    const serviceAccountJson =
      typeof resolvedCredentials.credentials.serviceAccountJson === 'string'
        ? resolvedCredentials.credentials.serviceAccountJson
        : '';
    if (!spreadsheetId) {
      throw new AppError('Google spreadsheet id missing', 500, 'google_spreadsheet_id_missing');
    }
    if (!serviceAccountJson) {
      throw new AppError('Google service account missing', 500, 'google_service_account_missing');
    }
    const token = await this.getAccessToken(serviceAccountJson, correlationId, resolvedCredentials.providerAccountId);
    const rowStart = `${input.tabName}!A${String(input.rowNumber)}`;
    await requestJson({
      method: 'PUT',
      url: `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(rowStart)}?valueInputOption=RAW`,
      headers: {
        authorization: `Bearer ${token}`
      },
      body: {
        values: [input.rowValues]
      },
      provider: 'google-sheets',
      operation: 'update-row',
      correlationId
    });
  }
}
