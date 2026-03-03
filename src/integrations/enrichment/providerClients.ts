import type { ProviderType } from '../../core/providers/providerTypes';
import type { EnrichmentRequest } from './types';

export interface EnrichmentProviderDefinition {
  providerType: ProviderType;
  providerName: string;
  endpoint: string;
  apiKeyHeader: string;
  method?: 'GET' | 'POST';
  /** If true, the API key is passed as a query param instead of a header (e.g. Datagma uses ?apiId=KEY) */
  apiKeyInUrl?: boolean;
  apiKeyUrlParam?: string;
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

function extractLinkedinSlug(url: string): string | undefined {
  const match = url.match(/linkedin\.com\/in\/([^/?#]+)/);
  return match?.[1];
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
      const emailRegex = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,15}\b/g;
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
    endpoint: 'https://wiza.co/api/individual_reveals',
    apiKeyHeader: 'authorization',
    buildRequestBody: (request) => {
      const reveal: Record<string, unknown> = {};
      if (request.fullName) reveal.full_name = request.fullName;
      if (request.companyName) reveal.company = request.companyName;
      if (request.linkedinUrl) reveal.profile_url = request.linkedinUrl;
      if (request.emails?.length) reveal.email = request.emails[0];
      return { individual_reveal: reveal, enrichment_level: 'partial', email_type: 'work' };
    },
    extractResponse: (response) => {
      const parsed = (response ?? {}) as Record<string, unknown>;
      const emails: string[] = [];
      const phones: string[] = [];
      const data = (parsed.data ?? parsed) as Record<string, unknown>;
      if (typeof data.email === 'string' && data.email) emails.push(data.email);
      if (typeof data.phone_number === 'string' && data.phone_number) phones.push(data.phone_number);
      if (typeof data.mobile_phone === 'string' && data.mobile_phone) phones.push(data.mobile_phone);
      return { emails: [...new Set(emails)], phones: [...new Set(phones)] };
    }
  },
  {
    providerType: 'FORAGER',
    providerName: 'FORAGER',
    endpoint: 'https://api-v2.forager.ai/api/datastorage/person_contacts_lookup/work_emails/',
    apiKeyHeader: 'X-API-KEY',
    buildRequestBody: (request) => {
      const slug = request.linkedinUrl ? extractLinkedinSlug(request.linkedinUrl) : undefined;
      return {
        linkedin_public_identifier: slug ?? request.linkedinUrl ?? '',
        do_contacts_enrichment: true
      };
    },
    extractResponse: (response) => {
      const emails: string[] = [];
      const items = Array.isArray(response) ? response : [];
      for (const item of items) {
        const entry = item as Record<string, unknown>;
        if (typeof entry.email === 'string' && entry.email) emails.push(entry.email);
      }
      return { emails, phones: [] };
    }
  },
  {
    providerType: 'ZELIQ',
    providerName: 'ZELIQ',
    endpoint: 'https://api.zeliq.com/api/contact/enrich/email',
    apiKeyHeader: 'x-api-key',
    buildRequestBody: (request) => {
      const body: Record<string, unknown> = {};
      if (request.fullName) {
        const { first_name, last_name } = splitFullName(request.fullName);
        body.first_name = first_name;
        body.last_name = last_name;
      }
      if (request.companyName) body.company = request.companyName;
      if (request.linkedinUrl) body.linkedin_url = request.linkedinUrl;
      body.callback_url = 'https://httpbin.org/post';
      return body;
    },
    extractResponse: (response) => {
      const parsed = (response ?? {}) as Record<string, unknown>;
      const emails: string[] = [];
      const phones: string[] = [];
      const contact = (parsed.contact ?? parsed) as Record<string, unknown>;
      if (typeof contact.most_probable_email === 'string' && contact.most_probable_email) {
        emails.push(contact.most_probable_email);
      }
      const emailList = contact.emails as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(emailList)) {
        for (const e of emailList) {
          if (typeof e.email === 'string' && e.email) emails.push(e.email);
        }
      }
      if (typeof contact.most_probable_phone === 'string' && contact.most_probable_phone) {
        phones.push(contact.most_probable_phone);
      }
      const phoneList = contact.phones as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(phoneList)) {
        for (const p of phoneList) {
          if (typeof p.phone === 'string' && p.phone) phones.push(p.phone);
        }
      }
      return { emails: [...new Set(emails)], phones: [...new Set(phones)] };
    }
  },
  {
    providerType: 'CONTACTOUT',
    providerName: 'CONTACTOUT',
    endpoint: 'https://api.contactout.com/v1/people/enrich',
    apiKeyHeader: 'token',
    buildRequestBody: (request) => {
      const body: Record<string, unknown> = {};
      if (request.fullName) body.full_name = request.fullName;
      if (request.companyName) body.company = [request.companyName];
      if (request.linkedinUrl) body.linkedin_url = request.linkedinUrl;
      body.include = ['work_email', 'personal_email', 'phone'];
      return body;
    },
    extractResponse: (response) => {
      const parsed = (response ?? {}) as Record<string, unknown>;
      const emails: string[] = [];
      const phones: string[] = [];
      const profile = (parsed.profile ?? parsed) as Record<string, unknown>;
      for (const key of ['email', 'work_email', 'personal_email']) {
        const val = profile[key];
        if (Array.isArray(val)) {
          for (const e of val) { if (typeof e === 'string' && e) emails.push(e); }
        } else if (typeof val === 'string' && val) {
          emails.push(val);
        }
      }
      const phoneVal = profile.phone;
      if (Array.isArray(phoneVal)) {
        for (const p of phoneVal) { if (typeof p === 'string' && p) phones.push(p); }
      } else if (typeof phoneVal === 'string' && phoneVal) {
        phones.push(phoneVal);
      }
      return { emails: [...new Set(emails)], phones: [...new Set(phones)] };
    }
  },
  {
    providerType: 'DATAGM',
    providerName: 'DATAGM',
    endpoint: 'https://gateway.datagma.net/api/ingress/v2/full',
    apiKeyHeader: 'x-api-key',
    method: 'GET',
    apiKeyInUrl: true,
    apiKeyUrlParam: 'apiId',
    buildRequestUrl: (baseEndpoint, request) => {
      const params = new URLSearchParams();
      if (request.fullName) params.set('fullName', request.fullName);
      if (request.companyName) params.set('data', request.companyName);
      if (request.linkedinUrl) params.set('username', request.linkedinUrl);
      if (request.emails?.length) params.set('email', request.emails[0]!);
      params.set('phoneFull', 'true');
      params.set('personFull', 'true');
      const qs = params.toString();
      return qs ? `${baseEndpoint}?${qs}` : baseEndpoint;
    },
    extractResponse: (response) => {
      const parsed = (response ?? {}) as Record<string, unknown>;
      const data = (parsed.data ?? parsed) as Record<string, unknown>;
      const emails: string[] = [];
      const phones: string[] = [];
      if (typeof data.legacyEmail === 'string' && data.legacyEmail) emails.push(data.legacyEmail);
      if (typeof data.email === 'string' && data.email) emails.push(data.email);
      if (typeof data.phone === 'string' && data.phone) phones.push(data.phone);
      if (typeof data.mobilePhone === 'string' && data.mobilePhone) phones.push(data.mobilePhone);
      return { emails: [...new Set(emails)], phones: [...new Set(phones)] };
    }
  },
  {
    providerType: 'PEOPLEDATALABS',
    providerName: 'PEOPLEDATALABS',
    endpoint: 'https://api.peopledatalabs.com/v5/person/enrich',
    apiKeyHeader: 'X-Api-Key',
    method: 'GET',
    buildRequestUrl: (baseEndpoint, request) => {
      const params = new URLSearchParams();
      if (request.fullName) params.set('name', request.fullName);
      if (request.companyName) params.set('company', request.companyName);
      if (request.linkedinUrl) params.set('profile', request.linkedinUrl);
      if (request.emails?.length) params.set('email', request.emails[0]!);
      params.set('min_likelihood', '5');
      params.set('required', 'emails');
      const qs = params.toString();
      return qs ? `${baseEndpoint}?${qs}` : baseEndpoint;
    },
    extractResponse: (response) => {
      const parsed = (response ?? {}) as Record<string, unknown>;
      const data = (parsed.data ?? parsed) as Record<string, unknown>;
      const emails: string[] = [];
      const phones: string[] = [];
      if (typeof data.work_email === 'string' && data.work_email) emails.push(data.work_email);
      if (typeof data.recommended_personal_email === 'string' && data.recommended_personal_email) {
        emails.push(data.recommended_personal_email);
      }
      const personalEmails = data.personal_emails;
      if (Array.isArray(personalEmails)) {
        for (const e of personalEmails) { if (typeof e === 'string' && e) emails.push(e); }
      }
      const emailObjs = data.emails as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(emailObjs)) {
        for (const e of emailObjs) {
          if (typeof e.address === 'string' && e.address) emails.push(e.address);
        }
      }
      if (typeof data.mobile_phone === 'string' && data.mobile_phone) phones.push(data.mobile_phone);
      const phoneNumbers = data.phone_numbers;
      if (Array.isArray(phoneNumbers)) {
        for (const p of phoneNumbers) { if (typeof p === 'string' && p) phones.push(p); }
      }
      return { emails: [...new Set(emails)], phones: [...new Set(phones)] };
    }
  }
];
