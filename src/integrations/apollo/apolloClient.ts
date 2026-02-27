import { z } from 'zod';

import { AppError } from '../../core/errors/appError';
import { requestJson } from '../../core/http/httpJsonClient';
import { ProviderCredentialResolver } from '../../core/providers/providerCredentialResolver';
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
  country: z.string().nullable().optional()
});

const apolloPeopleSearchFullResponseSchema = z.object({
  people: z.array(apolloPeopleSearchFullPersonSchema).default([]),
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
    await this.providerCredentialResolver.markFailure({
      providerAccountId,
      providerType: 'APOLLO',
      reason: error instanceof Error ? error.message : 'unknown provider error',
      statusCode:
        error instanceof AppError &&
        typeof error.details === 'object' &&
        error.details !== null &&
        'statusCode' in error.details &&
        typeof (error.details as { statusCode?: unknown }).statusCode === 'number'
          ? ((error.details as { statusCode: number }).statusCode)
          : undefined
    });
    throw error;
  }

  public async searchPeople(input: ApolloPeopleSearchInput): Promise<ApolloPeopleSearchResult> {
    const { apiKey, providerAccountId } = await this.resolveApiKey(input.projectId, input.correlationId);

    const maxPages = input.maxPages ?? 3;
    const perPage = input.perPage ?? 25;
    const allPeople: ApolloPerson[] = [];
    let totalEntries = 0;

    for (let page = 1; page <= maxPages; page += 1) {
      const body: Record<string, unknown> = {
        page,
        per_page: perPage
      };

      if (input.personLocations?.length) {
        body.person_locations = input.personLocations;
      }
      if (input.personTitles?.length) {
        body.person_titles = input.personTitles;
      }
      if (input.personSeniorities?.length) {
        body.person_seniorities = input.personSeniorities;
      }
      if (input.keywords) {
        body.q_keywords = input.keywords;
      }

      let response: unknown;
      try {
        response = await requestJson<unknown>({
          method: 'POST',
          url: 'https://api.apollo.io/api/v1/people/search',
          headers: { 'x-api-key': apiKey },
          body,
          provider: 'apollo',
          operation: 'people-search',
          correlationId: input.correlationId
        });
      } catch (error) {
        return this.handleProviderError(providerAccountId, error);
      }

      const parsed = apolloPeopleSearchFullResponseSchema.parse(response);
      totalEntries = parsed.pagination?.total_entries ?? 0;

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
      let response: unknown;
      try {
        response = await requestJson<unknown>({
          method: 'POST',
          url: 'https://api.apollo.io/api/v1/people/search',
          headers: {
            'x-api-key': apiKey
          },
          body: {
            page,
            q_organization_names: [input.companyName],
            person_locations: [input.geographyIsoCode],
            per_page: 100
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
