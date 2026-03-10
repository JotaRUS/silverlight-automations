import { z } from 'zod';

import { AppError } from '../../core/errors/appError';
import { requestJson } from '../../core/http/httpJsonClient';
import { ProviderCredentialResolver } from '../../core/providers/providerCredentialResolver';
import { emitNotification } from '../../modules/notifications/emitNotification';
import { prisma } from '../../db/client';
import type { EnrichmentResult, ExtractedPersonData } from '../enrichment/types';

const SLUG_STOP_WORDS = new Set([
  'the', 'and', 'inc', 'llc', 'ltd', 'corp', 'group', 'global', 'digital',
  'tech', 'ai', 'io', 'co', 'hq', 'official', 'real', 'ceo', 'cfo', 'cto',
  'amazon', 'google', 'meta', 'apple', 'microsoft', 'netflix', 'tesla'
]);

function parseLinkedInSlugName(
  url: string,
  knownFirstName?: string
): { firstName: string; lastName: string; fullName: string } | undefined {
  const match = url.match(/linkedin\.com\/in\/([^/?#]+)/);
  const slug = match?.[1];
  if (!slug) return undefined;
  const cleaned = slug.replace(/-[a-f0-9]{6,}$/i, '').replace(/-\d{1,4}$/, '');
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

const apolloPersonSchema = z.object({
  title: z.string().nullable().optional()
});

const apolloPeopleSearchResponseSchema = z.object({
  people: z.array(apolloPersonSchema).default([]),
  pagination: z
    .object({
      total_pages: z.number().int().positive().optional()
    })
    .optional()
});

const apolloOrganizationSchema = z.object({
  name: z.string().optional()
}).optional();

const apolloPeopleSearchFullPersonSchema = z.object({
  id: z.string().optional(),
  first_name: z.string().nullable().optional(),
  last_name: z.string().nullable().optional(),
  last_name_obfuscated: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  linkedin_url: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  organization_name: z.string().nullable().optional(),
  organization: apolloOrganizationSchema,
  city: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  has_email: z.boolean().optional(),
  has_city: z.boolean().optional(),
  has_state: z.boolean().optional(),
  has_country: z.boolean().optional()
});

const apolloPeopleSearchFullResponseSchema = z.object({
  people: z.array(apolloPeopleSearchFullPersonSchema).default([]),
  total_entries: z.number().int().optional(),
  pagination: z.object({
    page: z.number().int().optional(),
    per_page: z.number().int().optional(),
    total_entries: z.number().int().optional(),
    total_pages: z.number().int().optional()
  }).optional()
});

const apolloBulkMatchSchema = z.object({
  matches: z.array(z.object({
    id: z.string().optional(),
    first_name: z.string().nullable().optional(),
    last_name: z.string().nullable().optional(),
    name: z.string().nullable().optional(),
    linkedin_url: z.string().nullable().optional(),
    title: z.string().nullable().optional(),
    city: z.string().nullable().optional(),
    state: z.string().nullable().optional(),
    country: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    personal_emails: z.array(z.string()).optional().default([]),
    organization: z.object({
      name: z.string().nullable().optional(),
      phone: z.string().nullable().optional(),
      primary_phone: z.object({
        number: z.string().nullable().optional()
      }).optional()
    }).optional()
  })).default([])
});

export interface ApolloPerson {
  apolloId: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  jobTitle: string | null;
  companyName: string | null;
  linkedinUrl: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
}

export interface ApolloJobTitleQueryInput {
  projectId: string;
  companyName: string;
  geographyIsoCode: string;
  correlationId: string;
  maxPages?: number;
}

export interface ApolloPeopleSearchInput {
  projectId: string;
  personLocations?: string[];
  personTitles?: string[];
  personSeniorities?: string[];
  personDepartments?: string[];
  personFunctions?: string[];
  personNotTitles?: string[];
  personSkills?: string[];
  organizationDomains?: string[];
  organizationNames?: string[];
  organizationLocations?: string[];
  organizationNumEmployeesRanges?: string[];
  keywords?: string;
  correlationId: string;
  maxPages?: number;
  perPage?: number;
}

export interface ApolloPeopleSearchResult {
  people: ApolloPerson[];
  totalEntries: number;
}

export interface ApolloPersonEnrichmentInput {
  projectId: string;
  correlationId: string;
  apolloId?: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  companyName?: string;
  linkedinUrl?: string;
}

export class ApolloClient {
  private readonly providerCredentialResolver: ProviderCredentialResolver;

  public constructor(providerCredentialResolver?: ProviderCredentialResolver) {
    this.providerCredentialResolver = providerCredentialResolver ?? new ProviderCredentialResolver(prisma);
  }

  private async resolveApiKey(projectId: string, correlationId: string) {
    const resolvedCredentials = await this.providerCredentialResolver.resolve({
      providerType: 'APOLLO',
      projectId,
      correlationId
    });
    const apiKey =
      typeof resolvedCredentials.credentials.apiKey === 'string'
        ? resolvedCredentials.credentials.apiKey
        : '';
    if (!apiKey) {
      throw new AppError('Apollo API key is missing', 500, 'apollo_api_key_missing');
    }
    return { apiKey, providerAccountId: resolvedCredentials.providerAccountId };
  }

  private async handleProviderError(providerAccountId: string, error: unknown): Promise<never> {
    const reason = error instanceof Error ? error.message : 'unknown provider error';
    const errorDetails = error instanceof AppError && typeof error.details === 'object' && error.details !== null
      ? error.details as { statusCode?: number; responseBody?: unknown }
      : {};
    const statusCode = typeof errorDetails.statusCode === 'number' ? errorDetails.statusCode : undefined;

    await this.providerCredentialResolver.markFailure({
      providerAccountId,
      providerType: 'APOLLO',
      reason,
      statusCode,
      responseBody: errorDetails.responseBody
    });

    emitNotification({
      type: 'provider.failure',
      severity: statusCode === 429 ? 'WARNING' : 'ERROR',
      title: 'Apollo API error',
      message: reason.slice(0, 300),
      metadata: { providerAccountId, statusCode }
    });

    throw error;
  }

  private buildSearchQueryString(params: Record<string, unknown>): string {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        for (const item of value) {
          parts.push(`${encodeURIComponent(`${key}[]`)}=${encodeURIComponent(String(item))}`);
        }
      } else {
        parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
      }
    }
    return parts.join('&');
  }

  public async searchPeople(input: ApolloPeopleSearchInput): Promise<ApolloPeopleSearchResult> {
    const { apiKey, providerAccountId } = await this.resolveApiKey(input.projectId, input.correlationId);

    const maxPages = input.maxPages ?? 3;
    const perPage = input.perPage ?? 25;
    const allPeople: ApolloPerson[] = [];
    let totalEntries = 0;

    for (let page = 1; page <= maxPages; page += 1) {
      const queryParams: Record<string, unknown> = {
        page,
        per_page: perPage
      };

      if (input.personLocations?.length) {
        queryParams.person_locations = input.personLocations;
      }
      if (input.personTitles?.length) {
        queryParams.person_titles = input.personTitles;
      }
      if (input.personSeniorities?.length) {
        queryParams.person_seniorities = input.personSeniorities;
      }
      if (input.personDepartments?.length) {
        queryParams.person_departments = input.personDepartments;
      }
      if (input.personFunctions?.length) {
        queryParams.person_functions = input.personFunctions;
      }
      if (input.personNotTitles?.length) {
        queryParams.person_not_titles = input.personNotTitles;
      }
      if (input.personSkills?.length) {
        queryParams.person_skills = input.personSkills;
      }
      if (input.organizationDomains?.length) {
        queryParams.q_organization_domains_list = input.organizationDomains;
      }
      if (input.organizationNames?.length) {
        queryParams.q_organization_keyword_tags = input.organizationNames;
      }
      if (input.organizationLocations?.length) {
        queryParams.organization_locations = input.organizationLocations;
      }
      if (input.organizationNumEmployeesRanges?.length) {
        queryParams.organization_num_employees_ranges = input.organizationNumEmployeesRanges;
      }
      if (input.keywords) {
        queryParams.q_keywords = input.keywords;
      }

      const qs = this.buildSearchQueryString(queryParams);
      let response: unknown;
      try {
        response = await requestJson<unknown>({
          method: 'POST',
          url: `https://api.apollo.io/api/v1/mixed_people/api_search?${qs}`,
          headers: { 'x-api-key': apiKey },
          provider: 'apollo',
          operation: 'people-search',
          correlationId: input.correlationId
        });
      } catch (error) {
        return this.handleProviderError(providerAccountId, error);
      }

      const parsed = apolloPeopleSearchFullResponseSchema.parse(response);
      totalEntries = parsed.total_entries ?? parsed.pagination?.total_entries ?? 0;

      for (const person of parsed.people) {
        let firstName = person.first_name ?? null;
        let lastName = person.last_name ?? null;
        const rawName = person.name;
        let fullName = (rawName && !rawName.includes('*') ? rawName : null)
          ?? (firstName && lastName ? `${firstName} ${lastName}` : null);

        if (!lastName && !person.last_name_obfuscated && person.linkedin_url) {
          const slugName = parseLinkedInSlugName(person.linkedin_url, firstName ?? undefined);
          if (slugName) {
            if (!firstName) firstName = slugName.firstName;
            lastName = slugName.lastName;
            fullName = slugName.fullName;
          }
        }

        allPeople.push({
          apolloId: person.id ?? `anon-${page}-${allPeople.length}`,
          firstName,
          lastName,
          fullName,
          jobTitle: person.title ?? null,
          companyName: person.organization?.name ?? person.organization_name ?? null,
          linkedinUrl: person.linkedin_url ?? null,
          email: person.email ?? null,
          city: person.city ?? null,
          state: person.state ?? null,
          country: person.country ?? null
        });
      }

      const totalPages = parsed.pagination?.total_pages;
      if (!totalPages || page >= totalPages || parsed.people.length < perPage) {
        break;
      }
    }

    return { people: allPeople, totalEntries };
  }

  public async enrichPerson(input: ApolloPersonEnrichmentInput): Promise<EnrichmentResult | null> {
    const { apiKey, providerAccountId } = await this.resolveApiKey(input.projectId, input.correlationId);
    const detail: Record<string, string> = {};
    if (input.apolloId) detail.id = input.apolloId;
    if (input.linkedinUrl) detail.linkedin_url = input.linkedinUrl;
    if (input.fullName) detail.name = input.fullName;
    if (input.firstName) detail.first_name = input.firstName;
    if (input.lastName) detail.last_name = input.lastName;
    if (input.companyName) detail.organization_name = input.companyName;

    if (Object.keys(detail).length === 0) {
      return null;
    }

    let response: unknown;
    try {
      response = await requestJson<unknown>({
        method: 'POST',
        url: 'https://api.apollo.io/api/v1/people/bulk_match?reveal_personal_emails=true&reveal_phone_number=false',
        headers: {
          'x-api-key': apiKey,
          accept: 'application/json',
          'content-type': 'application/json'
        },
        body: { details: [detail] },
        provider: 'apollo',
        operation: 'people-bulk-match',
        correlationId: input.correlationId
      });
    } catch (error) {
      return this.handleProviderError(providerAccountId, error);
    }

    const parsed = apolloBulkMatchSchema.parse(response);
    const match = parsed.matches[0];
    if (!match) {
      return null;
    }

    const emails = Array.from(new Set(
      [match.email, ...(match.personal_emails ?? [])]
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    ));
    const phones = Array.from(new Set(
      [match.organization?.primary_phone?.number, match.organization?.phone]
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    ));
    const personData: ExtractedPersonData = {
      firstName: match.first_name ?? undefined,
      lastName: match.last_name ?? undefined,
      fullName: match.name ?? undefined,
      linkedinUrl: match.linkedin_url ?? undefined,
      jobTitle: match.title ?? undefined,
      companyName: match.organization?.name ?? undefined,
      city: match.city ?? undefined,
      state: match.state ?? undefined,
      country: match.country ?? undefined
    };

    return {
      provider: 'APOLLO',
      emails,
      phones,
      confidenceScore: emails.length > 0 || phones.length > 0 ? 0.95 : 0.7,
      rawPayload: response,
      personData
    };
  }

  public async fetchJobTitles(input: ApolloJobTitleQueryInput): Promise<string[]> {
    const { apiKey, providerAccountId } = await this.resolveApiKey(input.projectId, input.correlationId);

    const maxPages = input.maxPages ?? 3;
    const titles = new Set<string>();

    for (let page = 1; page <= maxPages; page += 1) {
      const qs = this.buildSearchQueryString({
        page,
        q_organization_domains_list: [input.companyName],
        person_locations: [input.geographyIsoCode],
        per_page: 100
      });

      let response: unknown;
      try {
        response = await requestJson<unknown>({
          method: 'POST',
          url: `https://api.apollo.io/api/v1/mixed_people/api_search?${qs}`,
          headers: {
            'x-api-key': apiKey
          },
          provider: 'apollo',
          operation: 'people-search',
          correlationId: input.correlationId
        });
      } catch (error) {
        return this.handleProviderError(providerAccountId, error);
      }

      const parsed = apolloPeopleSearchResponseSchema.parse(response);
      parsed.people
        .map((person) => person.title?.trim())
        .filter((title): title is string => Boolean(title))
        .forEach((title) => {
          titles.add(title);
        });

      const totalPages = parsed.pagination?.total_pages;
      if (!totalPages || page >= totalPages) {
        break;
      }
    }

    return Array.from(titles);
  }
}
