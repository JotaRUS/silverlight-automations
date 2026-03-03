export interface EnrichmentRequest {
  projectId?: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  companyName?: string;
  jobTitle?: string;
  linkedinUrl?: string;
  countryIso?: string;
  emails?: string[];
  phones?: string[];
}

export interface ExtractedPersonData {
  firstName?: string;
  lastName?: string;
  fullName?: string;
  linkedinUrl?: string;
  jobTitle?: string;
  companyName?: string;
  city?: string;
  state?: string;
  country?: string;
}

export interface EnrichmentResult {
  provider: string;
  emails: string[];
  phones: string[];
  confidenceScore: number;
  rawPayload: unknown;
  personData?: ExtractedPersonData;
}

export interface EnrichmentProviderClient {
  providerName: string;
  enrich(request: EnrichmentRequest, correlationId: string): Promise<EnrichmentResult>;
}
