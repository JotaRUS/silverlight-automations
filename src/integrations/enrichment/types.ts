export interface EnrichmentRequest {
  fullName?: string;
  companyName?: string;
  linkedinUrl?: string;
  countryIso?: string;
  emails?: string[];
  phones?: string[];
}

export interface EnrichmentResult {
  provider: string;
  emails: string[];
  phones: string[];
  confidenceScore: number;
  rawPayload: unknown;
}

export interface EnrichmentProviderClient {
  providerName: string;
  enrich(request: EnrichmentRequest, correlationId: string): Promise<EnrichmentResult>;
}
