import { z } from 'zod';

import { env } from '../../config/env';
import { AppError } from '../../core/errors/appError';
import { requestJson } from '../../core/http/httpJsonClient';

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
  companyName: string;
  geographyIsoCode: string;
  correlationId: string;
  maxPages?: number;
}

export class ApolloClient {
  public async fetchJobTitles(input: ApolloJobTitleQueryInput): Promise<string[]> {
    if (!env.APOLLO_API_KEY) {
      throw new AppError('Apollo API key is missing', 500, 'apollo_api_key_missing');
    }

    const maxPages = input.maxPages ?? 3;
    const titles = new Set<string>();

    for (let page = 1; page <= maxPages; page += 1) {
      const response = await requestJson<unknown>({
        method: 'POST',
        url: 'https://api.apollo.io/api/v1/people/search',
        headers: {
          'x-api-key': env.APOLLO_API_KEY
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
