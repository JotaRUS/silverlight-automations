import { env } from '../../config/env';
import { GenericEnrichmentClient } from './genericEnrichmentClient';
import type { EnrichmentProviderClient } from './types';

export const enrichmentProviderClients: EnrichmentProviderClient[] = [
  new GenericEnrichmentClient({
    providerName: 'LEADMAGIC',
    endpoint: 'https://api.leadmagic.io/v1/enrich',
    apiKey: env.LEADMAGIC_API_KEY,
    apiKeyHeader: 'x-api-key'
  }),
  new GenericEnrichmentClient({
    providerName: 'PROSPEO',
    endpoint: 'https://api.prospeo.io/v1/enrichment',
    apiKey: env.PROSPEO_API_KEY,
    apiKeyHeader: 'x-api-key'
  }),
  new GenericEnrichmentClient({
    providerName: 'EXA',
    endpoint: 'https://api.exa.ai/enrich',
    apiKey: env.EXA_API_KEY,
    apiKeyHeader: 'x-api-key'
  }),
  new GenericEnrichmentClient({
    providerName: 'ROCKETREACH',
    endpoint: 'https://api.rocketreach.co/v2/person/lookup',
    apiKey: env.ROCKETREACH_API_KEY,
    apiKeyHeader: 'x-api-key'
  }),
  new GenericEnrichmentClient({
    providerName: 'WIZA',
    endpoint: 'https://wiza.co/api/v1/enrichment',
    apiKey: env.WIZA_API_KEY,
    apiKeyHeader: 'x-api-key'
  }),
  new GenericEnrichmentClient({
    providerName: 'FORAGER',
    endpoint: 'https://api.forager.ai/v1/enrichment',
    apiKey: env.FORAGER_API_KEY,
    apiKeyHeader: 'x-api-key'
  }),
  new GenericEnrichmentClient({
    providerName: 'ZELIQ',
    endpoint: 'https://api.zeliq.com/v1/enrich',
    apiKey: env.ZELIQ_API_KEY,
    apiKeyHeader: 'x-api-key'
  }),
  new GenericEnrichmentClient({
    providerName: 'CONTACTOUT',
    endpoint: 'https://api.contactout.com/v1/enrich',
    apiKey: env.CONTACTOUT_API_KEY,
    apiKeyHeader: 'x-api-key'
  }),
  new GenericEnrichmentClient({
    providerName: 'DATAGM',
    endpoint: 'https://api.datagm.com/v1/enrich',
    apiKey: env.DATAGM_API_KEY,
    apiKeyHeader: 'x-api-key'
  }),
  new GenericEnrichmentClient({
    providerName: 'PEOPLEDATALABS',
    endpoint: 'https://api.peopledatalabs.com/v5/person/enrich',
    apiKey: env.PEOPLEDATALABS_API_KEY,
    apiKeyHeader: 'x-api-key'
  })
];
