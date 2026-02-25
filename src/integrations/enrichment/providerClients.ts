import type { ProviderType } from '../../core/providers/providerTypes';

export interface EnrichmentProviderDefinition {
  providerType: ProviderType;
  providerName: string;
  endpoint: string;
  apiKeyHeader: string;
}

export const enrichmentProviderDefinitions: EnrichmentProviderDefinition[] = [
  {
    providerType: 'LEADMAGIC',
    providerName: 'LEADMAGIC',
    endpoint: 'https://api.leadmagic.io/v1/enrich',
    apiKeyHeader: 'x-api-key'
  },
  {
    providerType: 'PROSPEO',
    providerName: 'PROSPEO',
    endpoint: 'https://api.prospeo.io/v1/enrichment',
    apiKeyHeader: 'x-api-key'
  },
  {
    providerType: 'EXA',
    providerName: 'EXA',
    endpoint: 'https://api.exa.ai/enrich',
    apiKeyHeader: 'x-api-key'
  },
  {
    providerType: 'ROCKETREACH',
    providerName: 'ROCKETREACH',
    endpoint: 'https://api.rocketreach.co/v2/person/lookup',
    apiKeyHeader: 'x-api-key'
  },
  {
    providerType: 'WIZA',
    providerName: 'WIZA',
    endpoint: 'https://wiza.co/api/v1/enrichment',
    apiKeyHeader: 'x-api-key'
  },
  {
    providerType: 'FORAGER',
    providerName: 'FORAGER',
    endpoint: 'https://api.forager.ai/v1/enrichment',
    apiKeyHeader: 'x-api-key'
  },
  {
    providerType: 'ZELIQ',
    providerName: 'ZELIQ',
    endpoint: 'https://api.zeliq.com/v1/enrich',
    apiKeyHeader: 'x-api-key'
  },
  {
    providerType: 'CONTACTOUT',
    providerName: 'CONTACTOUT',
    endpoint: 'https://api.contactout.com/v1/enrich',
    apiKeyHeader: 'x-api-key'
  },
  {
    providerType: 'DATAGM',
    providerName: 'DATAGM',
    endpoint: 'https://api.datagm.com/v1/enrich',
    apiKeyHeader: 'x-api-key'
  },
  {
    providerType: 'PEOPLEDATALABS',
    providerName: 'PEOPLEDATALABS',
    endpoint: 'https://api.peopledatalabs.com/v5/person/enrich',
    apiKeyHeader: 'x-api-key'
  }
];
