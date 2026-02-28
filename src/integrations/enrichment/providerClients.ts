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
    endpoint: 'https://api.leadmagic.io/v1/people/email-finder',
    apiKeyHeader: 'x-api-key'
  },
  {
    providerType: 'PROSPEO',
    providerName: 'PROSPEO',
    endpoint: 'https://api.prospeo.io/enrich-person',
    apiKeyHeader: 'X-KEY'
  },
  {
    providerType: 'EXA',
    providerName: 'EXA',
    endpoint: 'https://api.exa.ai/websets/v0/websets/{webset}/enrichments',
    apiKeyHeader: 'x-api-key'
  },
  {
    providerType: 'ROCKETREACH',
    providerName: 'ROCKETREACH',
    endpoint: 'https://api.rocketreach.co/api/v2/person/lookup',
    apiKeyHeader: 'Api-Key'
  },
  {
    providerType: 'WIZA',
    providerName: 'WIZA',
    endpoint: 'https://api.wiza.co/v1/enrich',
    apiKeyHeader: 'authorization'
  },
  {
    providerType: 'FORAGER',
    providerName: 'FORAGER',
    endpoint: 'https://api-v2.forager.ai/api/{account_id}/datastorage/person_detail_lookup/',
    apiKeyHeader: 'x-api-key'
  },
  {
    providerType: 'ZELIQ',
    providerName: 'ZELIQ',
    endpoint: 'https://api.zeliq.com/api/contact/enrich/email',
    apiKeyHeader: 'x-api-key'
  },
  {
    providerType: 'CONTACTOUT',
    providerName: 'CONTACTOUT',
    endpoint: 'https://api.contactout.com/v1/linkedin/enrich',
    apiKeyHeader: 'token'
  },
  {
    providerType: 'DATAGM',
    providerName: 'DATAGM',
    endpoint: 'https://gateway.datagma.net/api/ingress/v2/full',
    apiKeyHeader: 'x-api-key'
  },
  {
    providerType: 'PEOPLEDATALABS',
    providerName: 'PEOPLEDATALABS',
    endpoint: 'https://api.peopledatalabs.com/v5/person/enrich',
    apiKeyHeader: 'x-api-key'
  }
];
