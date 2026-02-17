import { AppError } from '../../core/errors/appError';
import { requestJson } from '../../core/http/httpJsonClient';
import type { EnrichmentProviderClient, EnrichmentRequest, EnrichmentResult } from './types';

interface GenericEnrichmentClientInput {
  providerName: string;
  endpoint: string;
  apiKey?: string;
  apiKeyHeader?: string;
}

export class GenericEnrichmentClient implements EnrichmentProviderClient {
  public readonly providerName: string;
  private readonly endpoint: string;
  private readonly apiKey?: string;
  private readonly apiKeyHeader: string;

  public constructor(input: GenericEnrichmentClientInput) {
    this.providerName = input.providerName;
    this.endpoint = input.endpoint;
    this.apiKey = input.apiKey;
    this.apiKeyHeader = input.apiKeyHeader ?? 'authorization';
  }

  public async enrich(request: EnrichmentRequest, correlationId: string): Promise<EnrichmentResult> {
    if (!this.apiKey) {
      throw new AppError(`${this.providerName} API key is missing`, 500, 'provider_api_key_missing', {
        provider: this.providerName
      });
    }

    const headers: Record<string, string> = {};
    if (this.apiKeyHeader === 'authorization') {
      headers.authorization = `Bearer ${this.apiKey}`;
    } else {
      headers[this.apiKeyHeader] = this.apiKey;
    }

    const response = await requestJson<unknown>({
      method: 'POST',
      url: this.endpoint,
      headers,
      body: request,
      provider: this.providerName,
      operation: 'enrich',
      correlationId
    });

    const parsed = response as {
      emails?: string[];
      phones?: string[];
      confidenceScore?: number;
    };

    return {
      provider: this.providerName,
      emails: parsed.emails ?? [],
      phones: parsed.phones ?? [],
      confidenceScore: parsed.confidenceScore ?? 0.5,
      rawPayload: response
    };
  }
}
