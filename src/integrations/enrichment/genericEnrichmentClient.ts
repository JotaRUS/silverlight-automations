import { AppError } from '../../core/errors/appError';
import { requestJson } from '../../core/http/httpJsonClient';
import type { EnrichmentProviderClient, EnrichmentRequest, EnrichmentResult } from './types';

interface GenericEnrichmentClientInput {
  providerName: string;
  endpoint: string;
  apiKey?: string;
  apiKeyHeader?: string;
  method?: 'GET' | 'POST';
  buildRequestUrl?: (baseEndpoint: string, request: EnrichmentRequest) => string;
  buildRequestBody?: (request: EnrichmentRequest) => unknown;
  extractResponse?: (response: unknown) => { emails: string[]; phones: string[] };
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  if (typeof value === 'string' && value.trim()) {
    return [value];
  }
  return [];
}

function extractArrayFromKnownPaths(payload: Record<string, unknown>, keys: string[]): string[] {
  for (const key of keys) {
    const direct = toStringArray(payload[key]);
    if (direct.length) {
      return direct;
    }
  }

  const data = payload.data;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const nested = data as Record<string, unknown>;
    for (const key of keys) {
      const nestedValues = toStringArray(nested[key]);
      if (nestedValues.length) {
        return nestedValues;
      }
    }
  }

  return [];
}

function extractConfidenceScore(payload: Record<string, unknown>): number {
  const candidateValues = [
    payload.confidenceScore,
    payload.confidence,
    payload.score,
    (payload.data as Record<string, unknown> | undefined)?.confidenceScore,
    (payload.data as Record<string, unknown> | undefined)?.confidence,
    (payload.data as Record<string, unknown> | undefined)?.score
  ];

  for (const value of candidateValues) {
    if (typeof value === 'number' && value >= 0 && value <= 1) {
      return value;
    }
  }

  return 0.5;
}

export class GenericEnrichmentClient implements EnrichmentProviderClient {
  public readonly providerName: string;
  private readonly endpoint: string;
  private readonly apiKey?: string;
  private readonly apiKeyHeader: string;
  private readonly method: 'GET' | 'POST';
  private readonly customBuildRequestUrl?: (baseEndpoint: string, request: EnrichmentRequest) => string;
  private readonly buildRequestBody?: (request: EnrichmentRequest) => unknown;
  private readonly customExtractResponse?: (response: unknown) => { emails: string[]; phones: string[] };

  public constructor(input: GenericEnrichmentClientInput) {
    this.providerName = input.providerName;
    this.endpoint = input.endpoint;
    this.apiKey = input.apiKey;
    this.apiKeyHeader = input.apiKeyHeader ?? 'authorization';
    this.method = input.method ?? 'POST';
    this.customBuildRequestUrl = input.buildRequestUrl;
    this.buildRequestBody = input.buildRequestBody;
    this.customExtractResponse = input.extractResponse;
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

    const url = this.customBuildRequestUrl
      ? this.customBuildRequestUrl(this.endpoint, request)
      : this.endpoint;
    const body = this.method === 'GET'
      ? undefined
      : (this.buildRequestBody ? this.buildRequestBody(request) : request);

    const response = await requestJson<unknown>({
      method: this.method,
      url,
      headers,
      body,
      provider: this.providerName,
      operation: 'enrich',
      correlationId
    });

    if (this.customExtractResponse) {
      const { emails, phones } = this.customExtractResponse(response);
      const confidenceScore = emails.length > 0 || phones.length > 0 ? 0.8 : 0;
      return {
        provider: this.providerName,
        emails,
        phones,
        confidenceScore,
        rawPayload: response
      };
    }

    const parsed = (response ?? {}) as Record<string, unknown>;
    const emails = extractArrayFromKnownPaths(parsed, [
      'emails',
      'email',
      'workEmails',
      'professionalEmails',
      'personalEmails'
    ]);
    const phones = extractArrayFromKnownPaths(parsed, ['phones', 'phone', 'mobilePhones']);
    const confidenceScore = extractConfidenceScore(parsed);

    return {
      provider: this.providerName,
      emails,
      phones,
      confidenceScore,
      rawPayload: response
    };
  }
}
