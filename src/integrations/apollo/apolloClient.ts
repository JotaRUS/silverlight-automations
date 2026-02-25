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

export interface ApolloJobTitleQueryInput {
  projectId: string;
  companyName: string;
  geographyIsoCode: string;
  correlationId: string;
  maxPages?: number;
}

export class ApolloClient {
  private readonly providerCredentialResolver: ProviderCredentialResolver;

  public constructor(providerCredentialResolver?: ProviderCredentialResolver) {
    this.providerCredentialResolver = providerCredentialResolver ?? new ProviderCredentialResolver(prisma);
  }

  public async fetchJobTitles(input: ApolloJobTitleQueryInput): Promise<string[]> {
    const resolvedCredentials = await this.providerCredentialResolver.resolve({
      providerType: 'APOLLO',
      projectId: input.projectId,
      correlationId: input.correlationId
    });
    const apiKey =
      typeof resolvedCredentials.credentials.apiKey === 'string'
        ? resolvedCredentials.credentials.apiKey
        : '';
    if (!apiKey) {
      throw new AppError('Apollo API key is missing', 500, 'apollo_api_key_missing');
    }

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
        await this.providerCredentialResolver.markFailure({
          providerAccountId: resolvedCredentials.providerAccountId,
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
