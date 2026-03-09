import type { ProviderType } from '../../core/providers/providerTypes';
import type { EnrichmentRequest, ExtractedPersonData } from './types';

export interface ExtractedProviderData {
  emails: string[];
  phones: string[];
  personData?: ExtractedPersonData;
}

export interface EnrichmentProviderDefinition {
  providerType: ProviderType;
  providerName: string;
  endpoint: string;
  apiKeyHeader: string;
  method?: 'GET' | 'POST';
  apiKeyInUrl?: boolean;
  apiKeyUrlParam?: string;
  apiKeyInBody?: boolean;
  apiKeyBodyParam?: string;
  buildRequestUrl?: (baseEndpoint: string, request: EnrichmentRequest) => string;
  buildRequestBody?: (request: EnrichmentRequest) => unknown;
  extractResponse?: (response: unknown) => ExtractedProviderData;
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

/**
 * Heuristic: LinkedIn profile titles follow "FirstName LastName | Title | Company".
 * Returns {firstName, lastName, fullName} or undefined if unparseable.
 */
function parseLinkedInProfileTitle(title: string): { firstName: string; lastName: string; fullName: string } | undefined {
  const namePart = title.split('|')[0]?.trim();
  if (!namePart) return undefined;
  const words = namePart.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 5) return undefined;
  const hasNumber = words.some(w => /\d/.test(w));
  const allCapsOrTitle = words.every(w => /^[A-Z][a-z'-]+$/.test(w) || /^[A-Z]{1,3}$/.test(w));
  if (hasNumber || !allCapsOrTitle) return undefined;
  return {
    firstName: words[0]!,
    lastName: words.slice(1).join(' '),
    fullName: namePart
  };
}

const SLUG_STOP_WORDS = new Set([
  'the', 'and', 'inc', 'llc', 'ltd', 'corp', 'group', 'global', 'digital',
  'tech', 'ai', 'io', 'co', 'hq', 'official', 'real', 'ceo', 'cfo', 'cto',
  'amazon', 'google', 'meta', 'apple', 'microsoft', 'netflix', 'tesla'
]);

/**
 * Extracts a plausible first/last name from a LinkedIn slug.
 * Handles hyphenated slugs ("john-doe-a1b2c3") and concatenated slugs ("johndoe")
 * when knownFirstName can anchor the split.
 */
function parseLinkedInSlugName(
  url: string,
  knownFirstName?: string
): { firstName: string; lastName: string; fullName: string } | undefined {
  const slug = extractLinkedinSlug(url);
  if (!slug) return undefined;
  const cleaned = slug.replace(/-[a-f0-9]{6,}$/i, '').replace(/-\d{1,4}$/,'');
  const parts = cleaned.split('-').filter(Boolean);
  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

  if (parts.length >= 2 && parts.length <= 4) {
    if (parts.every(p => /^[a-z']+$/i.test(p) && p.length >= 2)
        && !parts.some(p => SLUG_STOP_WORDS.has(p.toLowerCase()))) {
      const firstName = capitalize(parts[0]!);
      const lastName = parts.slice(1).map(capitalize).join(' ');
      if (!knownFirstName || firstName.toLowerCase() === knownFirstName.toLowerCase()) {
        return { firstName, lastName, fullName: `${firstName} ${lastName}` };
      }
    }
  }

  if (knownFirstName && parts.length === 1) {
    let lower = cleaned.toLowerCase().replace(/\d+$/, '');
    for (const prefix of ['official', 'real', 'its', 'the']) {
      if (lower.startsWith(prefix)) lower = lower.slice(prefix.length);
    }
    const knownLower = knownFirstName.toLowerCase();
    if (lower.startsWith(knownLower) && lower.length > knownLower.length + 1) {
      const rest = lower.slice(knownLower.length);
      if (rest.length >= 2 && /^[a-z]+$/.test(rest) && !SLUG_STOP_WORDS.has(rest)) {
        return {
          firstName: capitalize(knownLower),
          lastName: capitalize(rest),
          fullName: `${capitalize(knownLower)} ${capitalize(rest)}`
        };
      }
    }
  }

  return undefined;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
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
      const personData: ExtractedPersonData = {};
      if (parsed.error === true) {
        return { emails, phones, personData };
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
        personData.firstName = str(person.first_name);
        personData.lastName = str(person.last_name);
        personData.fullName = str(person.full_name);
        personData.linkedinUrl = str(person.linkedin) ?? str(person.linkedin_url);
        personData.jobTitle = str(person.title);
        const company = person.company as Record<string, unknown> | undefined;
        personData.companyName = str(company?.name) ?? str(person.company_name);
        personData.country = str(person.country);
        personData.city = str(person.city);
      }
      return { emails, phones, personData };
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
      const personData: ExtractedPersonData = {};
      const results = parsed.results as Array<Record<string, unknown>> | undefined;
      if (!results?.length) {
        return { emails, phones, personData };
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
        if (url.includes('linkedin.com/in/') && !personData.linkedinUrl) {
          personData.linkedinUrl = url;
        }
        if (!personData.fullName && str(result.author)) {
          personData.fullName = str(result.author);
        }
        if ((!personData.firstName || !personData.lastName) && typeof result.title === 'string') {
          const parsed = parseLinkedInProfileTitle(result.title);
          if (parsed) {
            if (!personData.firstName) personData.firstName = parsed.firstName;
            if (!personData.lastName) personData.lastName = parsed.lastName;
            if (!personData.fullName) personData.fullName = parsed.fullName;
          }
        }
      }
      if (!personData.firstName || !personData.lastName) {
        for (const result of results) {
          const url = typeof result.url === 'string' ? result.url : '';
          if (url.includes('linkedin.com/in/')) {
            const slugParsed = parseLinkedInSlugName(url);
            if (slugParsed) {
              if (!personData.firstName) personData.firstName = slugParsed.firstName;
              if (!personData.lastName) personData.lastName = slugParsed.lastName;
              if (!personData.fullName) personData.fullName = slugParsed.fullName;
              break;
            }
          }
        }
      }
      return {
        emails: [...new Set(emails)],
        phones: [...new Set(phones)],
        personData
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
      const personData: ExtractedPersonData = {};
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
      personData.firstName = str(parsed.first_name);
      personData.lastName = str(parsed.last_name);
      personData.fullName = str(parsed.name);
      personData.linkedinUrl = str(parsed.linkedin_url);
      personData.jobTitle = str(parsed.current_title);
      personData.companyName = str(parsed.current_employer);
      personData.city = str(parsed.city);
      personData.state = str(parsed.state);
      personData.country = str(parsed.country);
      return {
        emails: [...new Set(emails)],
        phones: [...new Set(phones)],
        personData
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
      const personData: ExtractedPersonData = {};
      const data = (parsed.data ?? parsed) as Record<string, unknown>;
      if (typeof data.email === 'string' && data.email) emails.push(data.email);
      if (typeof data.phone_number === 'string' && data.phone_number) phones.push(data.phone_number);
      if (typeof data.mobile_phone === 'string' && data.mobile_phone) phones.push(data.mobile_phone);
      personData.firstName = str(data.first_name);
      personData.lastName = str(data.last_name);
      personData.fullName = str(data.full_name) ?? str(data.name);
      personData.linkedinUrl = str(data.linkedin_url) ?? str(data.profile_url);
      personData.jobTitle = str(data.title) ?? str(data.job_title);
      personData.companyName = str(data.company) ?? str(data.company_name);
      personData.city = str(data.city);
      personData.state = str(data.state);
      personData.country = str(data.country);
      return { emails: [...new Set(emails)], phones: [...new Set(phones)], personData };
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
      const personData: ExtractedPersonData = {};
      const items = Array.isArray(response) ? response : [];
      for (const item of items) {
        const entry = item as Record<string, unknown>;
        if (typeof entry.email === 'string' && entry.email) emails.push(entry.email);
        if (!personData.fullName) personData.fullName = str(entry.full_name) ?? str(entry.name);
        if (!personData.linkedinUrl) personData.linkedinUrl = str(entry.linkedin_url);
        if (!personData.jobTitle) personData.jobTitle = str(entry.title) ?? str(entry.job_title);
        if (!personData.companyName) personData.companyName = str(entry.company) ?? str(entry.company_name);
      }
      return { emails, phones: [], personData };
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
      const personData: ExtractedPersonData = {};
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
      personData.firstName = str(contact.first_name);
      personData.lastName = str(contact.last_name);
      personData.fullName = str(contact.full_name);
      personData.linkedinUrl = str(contact.linkedin_url) ?? str(contact.linkedin);
      personData.jobTitle = str(contact.title) ?? str(contact.job_title);
      personData.companyName = str(contact.company_name) ?? str(contact.company);
      personData.country = str(contact.country);
      personData.city = str(contact.city);
      return { emails: [...new Set(emails)], phones: [...new Set(phones)], personData };
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
      const personData: ExtractedPersonData = {};
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
      personData.firstName = str(profile.first_name);
      personData.lastName = str(profile.last_name);
      personData.fullName = str(profile.full_name) ?? str(profile.name);
      personData.linkedinUrl = str(profile.linkedin_url) ?? str(profile.linkedin);
      personData.jobTitle = str(profile.title) ?? str(profile.job_title);
      personData.companyName = str(profile.company) ?? str(profile.company_name);
      personData.city = str(profile.city);
      personData.state = str(profile.state);
      personData.country = str(profile.country);
      return { emails: [...new Set(emails)], phones: [...new Set(phones)], personData };
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
      const personData: ExtractedPersonData = {};
      if (typeof data.legacyEmail === 'string' && data.legacyEmail) emails.push(data.legacyEmail);
      if (typeof data.email === 'string' && data.email) emails.push(data.email);
      if (typeof data.phone === 'string' && data.phone) phones.push(data.phone);
      if (typeof data.mobilePhone === 'string' && data.mobilePhone) phones.push(data.mobilePhone);
      personData.firstName = str(data.firstName) ?? str(data.first_name);
      personData.lastName = str(data.lastName) ?? str(data.last_name);
      personData.fullName = str(data.fullName) ?? str(data.full_name);
      personData.linkedinUrl = str(data.linkedInUrl) ?? str(data.linkedin_url) ?? str(data.linkedinUrl);
      personData.jobTitle = str(data.jobTitle) ?? str(data.job_title) ?? str(data.title);
      personData.companyName = str(data.company) ?? str(data.companyName) ?? str(data.company_name);
      personData.city = str(data.city);
      personData.state = str(data.state);
      personData.country = str(data.country);
      return { emails: [...new Set(emails)], phones: [...new Set(phones)], personData };
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
      const personData: ExtractedPersonData = {};
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
      personData.firstName = str(data.first_name);
      personData.lastName = str(data.last_name);
      personData.fullName = str(data.full_name);
      personData.linkedinUrl = str(data.linkedin_url);
      personData.jobTitle = str(data.job_title);
      personData.companyName = str(data.job_company_name);
      personData.city = str(data.location_locality);
      personData.state = str(data.location_region);
      personData.country = str(data.location_country);
      return { emails: [...new Set(emails)], phones: [...new Set(phones)], personData };
    }
  },
  {
    providerType: 'ANYLEADS',
    providerName: 'ANYLEADS',
    endpoint: 'https://myapiconnect.com/api-product/incoming-webhook/find-emails-first-last',
    apiKeyHeader: 'api_key',
    apiKeyInBody: true,
    apiKeyBodyParam: 'api_key',
    buildRequestBody: (request) => {
      const body: Record<string, unknown> = {};
      if (request.fullName) {
        const { first_name, last_name } = splitFullName(request.fullName);
        body.first_name = first_name;
        body.last_name = last_name;
      }
      if (request.firstName) body.first_name = request.firstName;
      if (request.lastName) body.last_name = request.lastName;
      if (request.companyName) body.domain = request.companyName;
      return body;
    },
    extractResponse: (response) => {
      const parsed = (response ?? {}) as Record<string, unknown>;
      const emails: string[] = [];
      const phones: string[] = [];
      const personData: ExtractedPersonData = {};
      const data = (parsed.data ?? parsed) as Record<string, unknown>;
      if (typeof data.email === 'string' && data.email) emails.push(data.email);
      const emailList = data.emails;
      if (Array.isArray(emailList)) {
        for (const e of emailList) {
          if (typeof e === 'string' && e) emails.push(e);
          if (typeof e === 'object' && e !== null) {
            const obj = e as Record<string, unknown>;
            if (typeof obj.email === 'string' && obj.email) emails.push(obj.email);
          }
        }
      }
      if (typeof data.phone === 'string' && data.phone) phones.push(data.phone);
      const phoneList = data.phones;
      if (Array.isArray(phoneList)) {
        for (const p of phoneList) {
          if (typeof p === 'string' && p) phones.push(p);
        }
      }
      personData.firstName = str(data.first_name);
      personData.lastName = str(data.last_name);
      personData.fullName = str(data.full_name) ?? str(data.name);
      personData.linkedinUrl = str(data.linkedin_url) ?? str(data.linkedin);
      personData.jobTitle = str(data.title) ?? str(data.job_title);
      personData.companyName = str(data.company) ?? str(data.company_name) ?? str(data.domain);
      personData.city = str(data.city);
      personData.state = str(data.state);
      personData.country = str(data.country);
      return { emails: [...new Set(emails)], phones: [...new Set(phones)], personData };
    }
  }
];
