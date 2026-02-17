import { createSign } from 'node:crypto';

import { env } from '../../config/env';
import { AppError } from '../../core/errors/appError';
import { requestJson } from '../../core/http/httpJsonClient';
import { clock } from '../../core/time/clock';

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
}

export interface GoogleSheetRowInput {
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
  private accessToken: string | null = null;
  private expiresAtEpochMs = 0;

  private parseServiceAccount(): {
    client_email: string;
    private_key: string;
    token_uri: string;
  } {
    if (!env.GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON) {
      throw new AppError('Google service account not configured', 500, 'google_service_account_missing');
    }

    const parsed = JSON.parse(env.GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON) as {
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

  private async getAccessToken(correlationId: string): Promise<string> {
    if (this.accessToken && this.expiresAtEpochMs > clock.now().getTime() + 30_000) {
      return this.accessToken;
    }

    const serviceAccount = this.parseServiceAccount();
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
    this.expiresAtEpochMs = clock.now().getTime() + tokenResponse.expires_in * 1000;
    return tokenResponse.access_token;
  }

  public async appendRow(input: GoogleSheetRowInput, correlationId: string): Promise<number | null> {
    if (!env.GOOGLE_SHEETS_SPREADSHEET_ID) {
      throw new AppError('Google spreadsheet id missing', 500, 'google_spreadsheet_id_missing');
    }
    const token = await this.getAccessToken(correlationId);
    const response = await requestJson<GoogleSheetsAppendResponse>({
      method: 'POST',
      url: `https://sheets.googleapis.com/v4/spreadsheets/${env.GOOGLE_SHEETS_SPREADSHEET_ID}/values/${encodeURIComponent(input.tabName)}:append?valueInputOption=RAW`,
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
    if (!env.GOOGLE_SHEETS_SPREADSHEET_ID) {
      throw new AppError('Google spreadsheet id missing', 500, 'google_spreadsheet_id_missing');
    }
    const token = await this.getAccessToken(correlationId);
    const rowStart = `${input.tabName}!A${String(input.rowNumber)}`;
    await requestJson({
      method: 'PUT',
      url: `https://sheets.googleapis.com/v4/spreadsheets/${env.GOOGLE_SHEETS_SPREADSHEET_ID}/values/${encodeURIComponent(rowStart)}?valueInputOption=RAW`,
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
