import { AppError } from '../../core/errors/appError';
import { requestJson } from '../../core/http/httpJsonClient';
import type { ExtractedProviderData } from './providerClients';
import type { EnrichmentProviderClient, EnrichmentRequest, EnrichmentResult, ExtractedPersonData } from './types';

interface GenericEnrichmentClientInput {
  providerName: string;
  endpoint: string;
  apiKey?: string;
  apiKeyHeader?: string;
  method?: 'GET' | 'POST';
  apiKeyInUrl?: boolean;
  apiKeyUrlParam?: string;
  apiKeyInBody?: boolean;
  apiKeyBodyParam?: string;
  buildRequestUrl?: (baseEndpoint: string, request: EnrichmentRequest) => string;
  buildRequestBody?: (request: EnrichmentRequest) => unknown;
  extractResponse?: (response: unknown) => ExtractedProviderData;
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

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function extractPersonDataFromGenericPayload(payload: Record<string, unknown>): ExtractedPersonData {
  const data = (typeof payload.data === 'object' && payload.data !== null && !Array.isArray(payload.data))
    ? payload.data as Record<string, unknown>
    : payload;
  const personData: ExtractedPersonData = {};
  personData.firstName = str(data.first_name) ?? str(data.firstName);
  personData.lastName = str(data.last_name) ?? str(data.lastName);
  personData.fullName = str(data.full_name) ?? str(data.fullName) ?? str(data.name);
  personData.linkedinUrl = str(data.linkedin_url) ?? str(data.linkedinUrl) ?? str(data.linkedin);
  personData.jobTitle = str(data.job_title) ?? str(data.jobTitle) ?? str(data.title);
  personData.companyName = str(data.company) ?? str(data.companyName) ?? str(data.company_name);
  personData.city = str(data.city);
  personData.state = str(data.state);
  personData.country = str(data.country);
  return personData;
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
  private readonly apiKeyInUrl: boolean;
  private readonly apiKeyUrlParam: string;
  private readonly apiKeyInBody: boolean;
  private readonly apiKeyBodyParam: string;
  private readonly customBuildRequestUrl?: (baseEndpoint: string, request: EnrichmentRequest) => string;
  private readonly buildRequestBody?: (request: EnrichmentRequest) => unknown;
  private readonly customExtractResponse?: (response: unknown) => ExtractedProviderData;

  public constructor(input: GenericEnrichmentClientInput) {
    this.providerName = input.providerName;
    this.endpoint = input.endpoint;
    this.apiKey = input.apiKey;
    this.apiKeyHeader = input.apiKeyHeader ?? 'authorization';
    this.method = input.method ?? 'POST';
    this.apiKeyInUrl = input.apiKeyInUrl ?? false;
    this.apiKeyUrlParam = input.apiKeyUrlParam ?? 'apiId';
    this.apiKeyInBody = input.apiKeyInBody ?? false;
    this.apiKeyBodyParam = input.apiKeyBodyParam ?? 'api_key';
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
    if (!this.apiKeyInUrl && !this.apiKeyInBody) {
      if (this.apiKeyHeader === 'authorization') {
        headers.authorization = `Bearer ${this.apiKey}`;
      } else {
        headers[this.apiKeyHeader] = this.apiKey;
      }
    }

    let url = this.customBuildRequestUrl
      ? this.customBuildRequestUrl(this.endpoint, request)
      : this.endpoint;

    if (this.apiKeyInUrl && this.apiKey) {
      const separator = url.includes('?') ? '&' : '?';
      url = `${url}${separator}${encodeURIComponent(this.apiKeyUrlParam)}=${encodeURIComponent(this.apiKey)}`;
    }
    let body = this.method === 'GET'
      ? undefined
      : (this.buildRequestBody ? this.buildRequestBody(request) : request);

    if (this.apiKeyInBody && this.apiKey && body && typeof body === 'object') {
      body = { ...(body as Record<string, unknown>), [this.apiKeyBodyParam]: this.apiKey };
    }

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
      const extracted = this.customExtractResponse(response);
      const confidenceScore = extracted.emails.length > 0 || extracted.phones.length > 0 ? 0.8 : 0;
      return {
        provider: this.providerName,
        emails: extracted.emails,
        phones: extracted.phones,
        confidenceScore,
        rawPayload: response,
        personData: extracted.personData
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
    const personData = extractPersonDataFromGenericPayload(parsed);

    return {
      provider: this.providerName,
      emails,
      phones,
      confidenceScore,
      rawPayload: response,
      personData
    };
  }
}
