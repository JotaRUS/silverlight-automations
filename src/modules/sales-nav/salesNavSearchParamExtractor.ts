export interface ApolloSearchFilterInput {
  personLocations?: string[];
  personTitles?: string[];
  personSeniorities?: string[];
  keywords?: string;
  personDepartments?: string[];
  personFunctions?: string[];
  personNotTitles?: string[];
  personSkills?: string[];
  organizationDomains?: string[];
  organizationNames?: string[];
  organizationLocations?: string[];
  organizationNumEmployeesRanges?: string[];
}

interface SalesNavSearchInput {
  sourceUrl: string;
  normalizedUrl: string;
  metadata?: Record<string, unknown>;
}

const PARAMETER_KEY_MAP: Record<Exclude<keyof ApolloSearchFilterInput, 'keywords'>, string[]> = {
  personLocations: [
    'personlocations',
    'person_locations',
    'location',
    'locations',
    'geo',
    'geography',
    'region',
    'regions',
    'country',
    'countries'
  ],
  personTitles: [
    'persontitles',
    'person_titles',
    'title',
    'titles',
    'jobtitle',
    'jobtitles',
    'job_title',
    'job_titles',
    'currenttitle',
    'current_title'
  ],
  personSeniorities: [
    'personseniorities',
    'person_seniorities',
    'seniority',
    'seniorities',
    'joblevel',
    'joblevels',
    'job_level',
    'job_levels'
  ],
  personDepartments: [
    'persondepartments',
    'person_departments',
    'department',
    'departments'
  ],
  personFunctions: [
    'personfunctions',
    'person_functions',
    'function',
    'functions'
  ],
  personNotTitles: [
    'personnottitles',
    'person_not_titles',
    'exclude_title',
    'exclude_titles'
  ],
  personSkills: [
    'personskills',
    'person_skills',
    'skill',
    'skills'
  ],
  organizationDomains: [
    'organizationdomains',
    'organization_domains',
    'organization_domain',
    'organization_domains',
    'q_organization_domains_list',
    'companydomain',
    'companydomains',
    'company_domain',
    'company_domains',
    'domain',
    'domains'
  ],
  organizationNames: [
    'organizationnames',
    'organization_names',
    'q_organization_keyword_tags',
    'organization',
    'organizations',
    'organizationname',
    'organization_name',
    'company',
    'companies',
    'companyname',
    'company_name'
  ],
  organizationLocations: [
    'organizationlocations',
    'organization_locations',
    'companylocation',
    'companylocations',
    'company_location',
    'company_locations'
  ],
  organizationNumEmployeesRanges: [
    'organizationnumemployeesranges',
    'organization_num_employees_ranges',
    'companysize',
    'companysizes',
    'company_size',
    'company_sizes',
    'employees',
    'employee_range'
  ]
};

const KEYWORD_KEYS = ['keywords', 'keyword', 'q_keywords', 'search', 'query', 'text'];
const SPLIT_PATTERN = /[,;|]+/;

function sanitizeToken(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function uniqueCaseInsensitive(values: string[]): string[] {
  const deduped = new Map<string, string>();
  for (const value of values) {
    const sanitized = sanitizeToken(value);
    if (!sanitized) {
      continue;
    }
    const key = sanitized.toLowerCase();
    if (!deduped.has(key)) {
      deduped.set(key, sanitized);
    }
  }
  return Array.from(deduped.values());
}

function toTokenList(value: unknown): string[] {
  if (typeof value === 'string') {
    return value
      .split(SPLIT_PATTERN)
      .map((token) => sanitizeToken(token))
      .filter((token) => token.length > 0);
  }

  if (Array.isArray(value)) {
    const expanded: string[] = [];
    for (const item of value) {
      expanded.push(...toTokenList(item));
    }
    return expanded;
  }

  return [];
}

function collectCandidateRecords(metadata?: Record<string, unknown>): Record<string, unknown>[] {
  if (!metadata) {
    return [];
  }

  const records: Record<string, unknown>[] = [metadata];
  const nestedKeys = ['searchParameters', 'searchParams', 'apolloFilters', 'filters'];
  for (const key of nestedKeys) {
    const candidate = metadata[key];
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
      records.push(candidate as Record<string, unknown>);
    }
  }

  return records;
}

function valueFromRecord(record: Record<string, unknown>, candidateKeys: string[]): unknown {
  const lowerCaseMap = new Map(
    Object.entries(record).map(([key, value]) => [key.toLowerCase(), value] as const)
  );
  for (const key of candidateKeys) {
    const value = lowerCaseMap.get(key);
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

function mergeKeywordValues(values: string[]): string | undefined {
  const deduped = uniqueCaseInsensitive(values);
  if (deduped.length === 0) {
    return undefined;
  }
  return deduped.join(' ');
}

function parseUrlSearchParams(url: string): Record<string, unknown> {
  try {
    const parsedUrl = new URL(url);
    const result: Record<string, unknown> = {};
    for (const [key, value] of parsedUrl.searchParams.entries()) {
      const existing = result[key];
      if (existing === undefined) {
        result[key] = value;
      } else if (Array.isArray(existing)) {
        existing.push(value);
        result[key] = existing;
      } else {
        result[key] = [existing, value];
      }
    }
    return result;
  } catch {
    return {};
  }
}

function compactApolloFilterInput(filters: ApolloSearchFilterInput): ApolloSearchFilterInput {
  const compacted: ApolloSearchFilterInput = {};
  const mutableCompacted = compacted as Record<string, unknown>;
  for (const [key, value] of Object.entries(filters)) {
    if (Array.isArray(value) && value.length > 0) {
      mutableCompacted[key] = value;
      continue;
    }
    if (typeof value === 'string' && value.length > 0) {
      mutableCompacted[key] = value;
    }
  }
  return compacted;
}

export function extractApolloFiltersFromSalesNavSearch(
  input: SalesNavSearchInput
): ApolloSearchFilterInput {
  const metadataRecords = collectCandidateRecords(input.metadata);
  const urlRecords = [
    parseUrlSearchParams(input.sourceUrl),
    parseUrlSearchParams(input.normalizedUrl)
  ].filter((record) => Object.keys(record).length > 0);
  const candidateRecords = [...metadataRecords, ...urlRecords];

  const result: ApolloSearchFilterInput = {};
  const mutableResult = result as Record<string, unknown>;
  for (const [fieldKey, aliases] of Object.entries(PARAMETER_KEY_MAP)) {
    const values: string[] = [];
    for (const record of candidateRecords) {
      const rawValue = valueFromRecord(record, aliases);
      if (rawValue !== undefined) {
        values.push(...toTokenList(rawValue));
      }
    }
    const normalized = uniqueCaseInsensitive(values);
    if (normalized.length > 0) {
      mutableResult[fieldKey] = normalized;
    }
  }

  const keywordValues: string[] = [];
  for (const record of candidateRecords) {
    const rawValue = valueFromRecord(record, KEYWORD_KEYS);
    if (rawValue !== undefined) {
      keywordValues.push(...toTokenList(rawValue));
    }
  }
  const keywords = mergeKeywordValues(keywordValues);
  if (keywords) {
    result.keywords = keywords;
  }

  return compactApolloFilterInput(result);
}

export function mergeApolloSearchFilters(
  filters: ApolloSearchFilterInput[]
): ApolloSearchFilterInput {
  const merged: ApolloSearchFilterInput = {};
  const mutableMerged = merged as Record<string, unknown>;
  const arrayKeys = Object.keys(PARAMETER_KEY_MAP) as Exclude<keyof ApolloSearchFilterInput, 'keywords'>[];

  for (const key of arrayKeys) {
    const values: string[] = [];
    for (const filter of filters) {
      const items = filter[key];
      if (Array.isArray(items)) {
        values.push(...items);
      }
    }
    const normalized = uniqueCaseInsensitive(values);
    if (normalized.length > 0) {
      mutableMerged[key] = normalized;
    }
  }

  const keywordParts = filters
    .map((filter) => filter.keywords)
    .filter((value): value is string => typeof value === 'string' && value.length > 0);
  const mergedKeywords = mergeKeywordValues(keywordParts);
  if (mergedKeywords) {
    merged.keywords = mergedKeywords;
  }

  return compactApolloFilterInput(merged);
}
