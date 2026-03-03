import { describe, expect, it } from 'vitest';

import {
  extractApolloFiltersFromSalesNavSearch,
  mergeApolloSearchFilters
} from '../../src/modules/sales-nav/salesNavSearchParamExtractor';

describe('salesNavSearchParamExtractor', () => {
  it('extracts Apollo-compatible filters from search URLs and metadata', () => {
    const filters = extractApolloFiltersFromSalesNavSearch({
      sourceUrl:
        'https://www.linkedin.com/sales/search/people?location=US,CA&title=VP%20Engineering&seniority=director&company_domain=stripe.com&keywords=payments',
      normalizedUrl:
        'https://www.linkedin.com/sales/search/people?location=US,CA&title=VP%20Engineering&seniority=director&company_domain=stripe.com&keywords=payments',
      metadata: {
        searchParameters: {
          personTitles: ['Head of Engineering'],
          organizationNames: ['Stripe']
        }
      }
    });

    expect(filters.personLocations).toEqual(['US', 'CA']);
    expect(filters.personTitles).toEqual(['Head of Engineering', 'VP Engineering']);
    expect(filters.personSeniorities).toEqual(['director']);
    expect(filters.organizationDomains).toEqual(['stripe.com']);
    expect(filters.organizationNames).toEqual(['Stripe']);
    expect(filters.keywords).toBe('payments');
  });

  it('merges and deduplicates filters across multiple Sales Nav searches', () => {
    const merged = mergeApolloSearchFilters([
      {
        personLocations: ['US', 'CA'],
        personTitles: ['VP Engineering'],
        keywords: 'payments'
      },
      {
        personLocations: ['ca', 'GB'],
        personTitles: ['CTO'],
        keywords: 'fintech'
      }
    ]);

    expect(merged.personLocations).toEqual(['US', 'CA', 'GB']);
    expect(merged.personTitles).toEqual(['VP Engineering', 'CTO']);
    expect(merged.keywords).toBe('payments fintech');
  });
});
