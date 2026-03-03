import { z } from 'zod';

import { AppError } from '../../core/errors/appError';
import { requestJson } from '../../core/http/httpJsonClient';
import { ProviderCredentialResolver } from '../../core/providers/providerCredentialResolver';
import { emitNotification } from '../../modules/notifications/emitNotification';
import { prisma } from '../../db/client';

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

export interface ApolloPerson {
  apolloId: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  jobTitle: string | null;
  companyName: string | null;
  linkedinUrl: string | null;
  email: string | null;
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
    const statusCode =
      error instanceof AppError &&
      typeof error.details === 'object' &&
      error.details !== null &&
      'statusCode' in error.details &&
      typeof (error.details as { statusCode?: unknown }).statusCode === 'number'
        ? ((error.details as { statusCode: number }).statusCode)
        : undefined;

    await this.providerCredentialResolver.markFailure({
      providerAccountId,
      providerType: 'APOLLO',
      reason,
      statusCode
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
        const firstName = person.first_name ?? null;
        const lastName = person.last_name ?? person.last_name_obfuscated ?? null;
        const fullName = person.name ?? (firstName && lastName ? `${firstName} ${lastName}` : firstName);

        allPeople.push({
          apolloId: person.id ?? `anon-${page}-${allPeople.length}`,
          firstName,
          lastName,
          fullName,
          jobTitle: person.title ?? null,
          companyName: person.organization?.name ?? person.organization_name ?? null,
          linkedinUrl: person.linkedin_url ?? null,
          email: person.email ?? null,
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
