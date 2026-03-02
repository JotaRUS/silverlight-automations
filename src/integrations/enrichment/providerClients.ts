import type { ProviderType } from '../../core/providers/providerTypes';
import type { EnrichmentRequest } from './types';

export interface EnrichmentProviderDefinition {
  providerType: ProviderType;
  providerName: string;
  endpoint: string;
  apiKeyHeader: string;
  method?: 'GET' | 'POST';
  buildRequestUrl?: (baseEndpoint: string, request: EnrichmentRequest) => string;
  buildRequestBody?: (request: EnrichmentRequest) => unknown;
  extractResponse?: (response: unknown) => { emails: string[]; phones: string[] };
}

function splitFullName(fullName: string): { first_name: string; last_name: string } {
  const parts = fullName.trim().split(/\s+/);
  return {
    first_name: parts[0] ?? '',
    last_name: parts.slice(1).join(' ') || ''
  };
}

export const enrichmentProviderDefinitions: EnrichmentProviderDefinition[] = [
  {
    providerType: 'LEADMAGIC',
    providerName: 'LEADMAGIC',
    endpoint: 'https://api.leadmagic.io/v1/people/email-finder',
    apiKeyHeader: 'x-api-key',
    buildRequestBody: (request) => {
      const body: Record<string, unknown> = {};
      if (request.fullName) {
        const { first_name, last_name } = splitFullName(request.fullName);
        body.first_name = first_name;
        body.last_name = last_name;
      }
      if (request.companyName) {
        body.company_name = request.companyName;
      }
      return body;
    }
  },
  {
    providerType: 'PROSPEO',
    providerName: 'PROSPEO',
    endpoint: 'https://api.prospeo.io/enrich-person',
    apiKeyHeader: 'X-KEY',
    buildRequestBody: (request) => {
      const data: Record<string, unknown> = {};
      if (request.fullName) {
        data.full_name = request.fullName;
      }
      if (request.companyName) {
        data.company_name = request.companyName;
      }
      if (request.linkedinUrl) {
        data.linkedin_url = request.linkedinUrl;
      }
      if (request.emails?.length) {
        data.email = request.emails[0];
      }
      return { data, only_verified_email: true };
    },
    extractResponse: (response) => {
      const parsed = (response ?? {}) as Record<string, unknown>;
      const emails: string[] = [];
      const phones: string[] = [];
      if (parsed.error === true) {
        return { emails, phones };
      }
      const person = parsed.person as Record<string, unknown> | undefined;
      if (person) {
        const emailObj = person.email as Record<string, unknown> | undefined;
        if (emailObj && typeof emailObj.email === 'string' && emailObj.email) {
          emails.push(emailObj.email);
        }
        const mobileObj = person.mobile as Record<string, unknown> | undefined;
        if (mobileObj && typeof mobileObj.mobile === 'string' && mobileObj.mobile && mobileObj.revealed === true) {
          phones.push(mobileObj.mobile);
        }
      }
      return { emails, phones };
    }
  },
  {
    providerType: 'EXA',
    providerName: 'EXA',
    endpoint: 'https://api.exa.ai/search',
    apiKeyHeader: 'x-api-key',
    buildRequestBody: (request) => {
      const queryParts: string[] = [];
      if (request.fullName) {
        queryParts.push(request.fullName);
      }
      if (request.companyName) {
        queryParts.push(request.companyName);
      }
      if (request.linkedinUrl) {
        queryParts.push(request.linkedinUrl);
      }
      return {
        query: queryParts.join(' ') || 'unknown person',
        type: 'auto',
        num_results: 3,
        category: 'people',
        contents: {
          highlights: { max_characters: 4000 }
        }
      };
    },
    extractResponse: (response) => {
      const parsed = (response ?? {}) as Record<string, unknown>;
      const emails: string[] = [];
      const phones: string[] = [];
      const results = parsed.results as Array<Record<string, unknown>> | undefined;
      if (!results?.length) {
        return { emails, phones };
      }
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      const phoneRegex = /\+?1?\s*[-.(]?\d{3}[-.)]\s*\d{3}[-.]?\d{4}/g;
      for (const result of results) {
        const textSources = [
          result.text,
          result.highlights,
          result.title,
          result.author
        ];
        for (const src of textSources) {
          const text = typeof src === 'string' ? src : Array.isArray(src) ? src.join(' ') : '';
          if (!text) continue;
          const foundEmails = text.match(emailRegex);
          if (foundEmails) {
            for (const e of foundEmails) emails.push(e.toLowerCase());
          }
          const foundPhones = text.match(phoneRegex);
          if (foundPhones) {
            for (const p of foundPhones) phones.push(p.replace(/[^\d+]/g, ''));
          }
        }
        const url = typeof result.url === 'string' ? result.url : '';
        if (url.includes('linkedin.com/in/') && !emails.length) {
          // LinkedIn URL found but no email extracted - still valuable for downstream matching
        }
      }
      return {
        emails: [...new Set(emails)],
        phones: [...new Set(phones)]
      };
    }
  },
  {
    providerType: 'ROCKETREACH',
    providerName: 'ROCKETREACH',
    endpoint: 'https://api.rocketreach.co/api/v2/person/lookup',
    apiKeyHeader: 'Api-Key',
    method: 'GET',
    buildRequestUrl: (baseEndpoint, request) => {
      const params = new URLSearchParams();
      if (request.fullName) {
        params.set('name', request.fullName);
      }
      if (request.companyName) {
        params.set('current_employer', request.companyName);
      }
      if (request.linkedinUrl) {
        params.set('linkedin_url', request.linkedinUrl);
      }
      const qs = params.toString();
      return qs ? `${baseEndpoint}?${qs}` : baseEndpoint;
    },
    extractResponse: (response) => {
      const parsed = (response ?? {}) as Record<string, unknown>;
      const emails: string[] = [];
      const phones: string[] = [];
      const currentEmails = parsed.current_work_email ?? parsed.current_personal_email;
      if (typeof currentEmails === 'string' && currentEmails) {
        emails.push(currentEmails);
      }
      const emailList = parsed.emails as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(emailList)) {
        for (const entry of emailList) {
          const addr = typeof entry === 'string' ? entry : (entry as Record<string, unknown>)?.email;
          if (typeof addr === 'string' && addr) {
            emails.push(addr);
          }
        }
      }
      const phoneList = parsed.phones as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(phoneList)) {
        for (const entry of phoneList) {
          const num = typeof entry === 'string' ? entry : (entry as Record<string, unknown>)?.number;
          if (typeof num === 'string' && num) {
            phones.push(num);
          }
        }
      }
      return {
        emails: [...new Set(emails)],
        phones: [...new Set(phones)]
      };
    }
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
