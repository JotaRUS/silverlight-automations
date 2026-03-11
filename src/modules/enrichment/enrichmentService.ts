import type { Prisma, PrismaClient } from '@prisma/client';

import { AppError } from '../../core/errors/appError';
import { ProviderCredentialResolver } from '../../core/providers/providerCredentialResolver';
import type { ProviderType } from '../../core/providers/providerTypes';
import { PROVIDER_TYPE_TO_PROJECT_BINDING_FIELD } from '../../core/providers/providerTypes';
import { providerLimiter } from '../../core/rate-limiter/providerLimiter';
import { clock } from '../../core/time/clock';
import { isoCodeToLocationName } from '../../config/constants';
import { ApolloClient } from '../../integrations/apollo/apolloClient';
import { GenericEnrichmentClient } from '../../integrations/enrichment/genericEnrichmentClient';
import {
  enrichmentProviderDefinitions,
  type EnrichmentProviderDefinition
} from '../../integrations/enrichment/providerClients';
import type {
  EnrichmentProviderClient,
  EnrichmentRequest,
  EnrichmentResult,
  ExtractedPersonData
} from '../../integrations/enrichment/types';
import { getQueues } from '../../queues';
import { buildJobId } from '../../queues/jobId';
import { GOOGLE_SHEETS_TABS } from '../google-sheets-sync/googleSheetsTabMapping';
import { ProjectCompletionService } from '../projects/projectCompletionService';
import { normalizeEmail, normalizePhone, isFakeEmail, isFakePhone } from './enrichmentValidators';

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
  let decoded = slug;
  try {
    decoded = decodeURIComponent(slug);
  } catch {
    decoded = slug;
  }
  if (decoded.includes('%')) {
    return undefined;
  }
  const cleaned = decoded.replace(/-[a-f0-9]{6,}$/i, '').replace(/-\d{1,4}$/, '');
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

function isWeakFullName(value: string | null | undefined, firstName?: string | null): boolean {
  if (!value) return true;
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes('*')) return true;
  if (firstName && trimmed.toLowerCase() === firstName.trim().toLowerCase()) return true;
  return trimmed.split(/\s+/).length < 2;
}

function isWeakLastName(value: string | null | undefined): boolean {
  if (!value) return true;
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes('*')) return true;
  const parts = trimmed.toLowerCase().split(/\s+/);
  return parts.some((part) => SLUG_STOP_WORDS.has(part));
}

function isPlausiblePersonName(value: string | null | undefined, firstName?: string | null): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes('*') || /[@\d]/.test(trimmed)) return false;
  const words = trimmed.split(/\s+/);
  if (words.length < 2 || words.length > 4) return false;
  const companySuffixes = new Set(['inc', 'llc', 'ltd', 'limited', 'corp', 'corporation', 'pte', 'company', 'group']);
  if (words.some((word) => companySuffixes.has(word.toLowerCase().replace(/[.,]/g, '')))) return false;
  if (firstName && words[0]?.toLowerCase() !== firstName.trim().toLowerCase()) return false;
  return words.every((word) => /^[A-Za-z'’-]+$/.test(word));
}

export interface EnrichmentJobInput {
  leadId: string;
  projectId: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  companyName?: string;
  jobTitle?: string;
  linkedinUrl?: string;
  countryIso?: string;
  emails?: string[];
  phones?: string[];
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

interface ResolvedAwareProviderClient extends EnrichmentProviderClient {
  providerType?: ProviderType;
}

class DynamicResolvedEnrichmentProviderClient implements ResolvedAwareProviderClient {
  public readonly providerName: string;
  public readonly providerType: ProviderType;
  private readonly definition: EnrichmentProviderDefinition;
  private readonly providerCredentialResolver: ProviderCredentialResolver;

  public constructor(
    definition: EnrichmentProviderDefinition,
    providerCredentialResolver: ProviderCredentialResolver
  ) {
    this.providerName = definition.providerName;
    this.providerType = definition.providerType;
    this.definition = definition;
    this.providerCredentialResolver = providerCredentialResolver;
  }

  public async enrich(request: EnrichmentRequest, correlationId: string): Promise<EnrichmentResult> {
    const projectId = request.projectId;
    if (!projectId) {
      throw new AppError('Project id is required for enrichment provider resolution', 400, 'project_id_required');
    }
    const resolvedCredentials = await this.providerCredentialResolver.resolve({
      providerType: this.providerType,
      projectId,
      correlationId,
      fallbackStrategy: 'round_robin'
    });
    const apiKey =
      typeof resolvedCredentials.credentials.apiKey === 'string'
        ? resolvedCredentials.credentials.apiKey
        : '';
    if (!apiKey) {
      throw new AppError('Provider API key missing', 500, 'provider_api_key_missing', {
        providerType: this.providerType,
        providerAccountId: resolvedCredentials.providerAccountId
      });
    }

    let resolvedEndpoint = this.definition.endpoint;
    const accountId =
      typeof resolvedCredentials.credentials.accountId === 'string'
        ? resolvedCredentials.credentials.accountId
        : '';
    if (accountId && resolvedEndpoint.includes('{accountId}')) {
      resolvedEndpoint = resolvedEndpoint.replace('{accountId}', encodeURIComponent(accountId));
    }

    const client = new GenericEnrichmentClient({
      providerName: this.providerName,
      endpoint: resolvedEndpoint,
      apiKey,
      apiKeyHeader: this.definition.apiKeyHeader,
      method: this.definition.method,
      apiKeyInUrl: this.definition.apiKeyInUrl,
      apiKeyUrlParam: this.definition.apiKeyUrlParam,
      apiKeyInBody: this.definition.apiKeyInBody,
      apiKeyBodyParam: this.definition.apiKeyBodyParam,
      emptyResultStatusCodes: this.definition.emptyResultStatusCodes,
      buildRequestUrl: this.definition.buildRequestUrl,
      buildRequestBody: this.definition.buildRequestBody,
      extractResponse: this.definition.extractResponse
    });
    try {
      return await client.enrich(request, correlationId);
    } catch (error) {
      const errorDetails = error instanceof AppError && typeof error.details === 'object' && error.details !== null
        ? error.details as { statusCode?: number; responseBody?: unknown }
        : {};
      await this.providerCredentialResolver.markFailure({
        providerAccountId: resolvedCredentials.providerAccountId,
        providerType: this.providerType,
        reason: error instanceof Error ? error.message : 'unknown provider error',
        statusCode: typeof errorDetails.statusCode === 'number' ? errorDetails.statusCode : undefined,
        responseBody: errorDetails.responseBody
      });
      throw error;
    }
  }
}

export class EnrichmentService {
  public constructor(
    private readonly prismaClient: PrismaClient,
    private readonly providerClients: ResolvedAwareProviderClient[] = enrichmentProviderDefinitions.map(
      (definition) =>
        new DynamicResolvedEnrichmentProviderClient(
          definition,
          new ProviderCredentialResolver(prismaClient)
        )
    ),
    private readonly apolloClient: ApolloClient = new ApolloClient(
      new ProviderCredentialResolver(prismaClient)
    )
  ) {
  }

  private buildRequest(job: EnrichmentJobInput): EnrichmentRequest {
    return {
      projectId: job.projectId,
      firstName: job.firstName,
      lastName: job.lastName,
      fullName: job.fullName,
      companyName: job.companyName,
      jobTitle: job.jobTitle,
      linkedinUrl: job.linkedinUrl,
      countryIso: job.countryIso,
      emails: job.emails ?? [],
      phones: job.phones ?? []
    };
  }

  private async logAttempt(
    leadId: string,
    provider: string,
    status: 'SUCCESS' | 'FAILED' | 'RATE_LIMITED' | 'TRIAL_EXHAUSTED',
    confidenceScore: number | null,
    responsePayload: unknown,
    errorMessage?: string
  ): Promise<void> {
    try {
      await this.prismaClient.enrichmentAttempt.create({
        data: {
          leadId,
          provider: provider as never,
          status,
          confidenceScore: confidenceScore ?? undefined,
          responsePayload: toJsonValue(responsePayload),
          errorMessage,
          rateLimited: status === 'RATE_LIMITED',
          trialExhausted: status === 'TRIAL_EXHAUSTED',
          attemptedAt: clock.now()
        }
      });
    } catch (error) {
      const isFkViolation =
        error instanceof Object && (error as { code?: string }).code === 'P2003';
      if (!isFkViolation) {
        throw error;
      }
      await this.prismaClient.enrichmentAttempt.create({
        data: {
          leadId: null,
          provider: provider as never,
          status,
          confidenceScore: confidenceScore ?? undefined,
          responsePayload: toJsonValue(responsePayload),
          errorMessage: errorMessage
            ? `${errorMessage} [lead ${leadId} deleted]`
            : `[lead ${leadId} deleted]`,
          rateLimited: status === 'RATE_LIMITED',
          trialExhausted: status === 'TRIAL_EXHAUSTED',
          attemptedAt: clock.now()
        }
      });
    }
  }

  private async runProvider(
    providerClient: ResolvedAwareProviderClient,
    request: EnrichmentRequest,
    correlationId: string,
    leadId: string
  ): Promise<EnrichmentResult | null> {
    try {
      const result = await providerLimiter.run(providerClient.providerName, async () =>
        providerClient.enrich(request, correlationId)
      );
      await this.logAttempt(
        leadId,
        providerClient.providerName,
        'SUCCESS',
        result.confidenceScore,
        result.rawPayload
      );
      return result;
    } catch (error) {
      const baseName = error instanceof Error ? error.message : 'unknown provider error';
      const details =
        error instanceof AppError && typeof error.details === 'object' && error.details !== null
          ? (error.details as { statusCode?: number; responseBody?: unknown })
          : {};
      const statusSuffix = details.statusCode ? ` (HTTP ${String(details.statusCode)})` : '';
      let bodySuffix = '';
      if (details.responseBody) {
        try {
          const raw = typeof details.responseBody === 'string'
            ? details.responseBody
            : JSON.stringify(details.responseBody);
          bodySuffix = ` — ${raw.slice(0, 200)}`;
        } catch { /* ignore serialisation errors */ }
      }
      const errorMessage = `${baseName}${statusSuffix}${bodySuffix}`;
      const lower = errorMessage.toLowerCase();
      const normalizedStatus =
        lower.includes('rate') || lower.includes('429')
          ? 'RATE_LIMITED'
          : lower.includes('trial') || lower.includes('402') || lower.includes('out of credits')
            ? 'TRIAL_EXHAUSTED'
            : 'FAILED';
      await this.logAttempt(leadId, providerClient.providerName, normalizedStatus, null, {}, errorMessage);
      return null;
    }
  }

  private async runApolloProvider(
    input: {
      leadId: string;
      projectId: string;
      correlationId: string;
      apolloId?: string;
      firstName?: string;
      lastName?: string;
      fullName?: string;
      companyName?: string;
      linkedinUrl?: string;
    }
  ): Promise<EnrichmentResult | null> {
    try {
      const result = await providerLimiter.run('APOLLO', async () => this.apolloClient.enrichPerson({
        projectId: input.projectId,
        correlationId: input.correlationId,
        apolloId: input.apolloId,
        firstName: input.firstName,
        lastName: input.lastName,
        fullName: input.fullName,
        companyName: input.companyName,
        linkedinUrl: input.linkedinUrl
      }));
      if (!result) {
        return null;
      }
      return result;
    } catch (error) {
      return null;
    }
  }

  private pickBestResult(results: EnrichmentResult[]): EnrichmentResult | null {
    if (!results.length) {
      return null;
    }

    const sorted = [...results].sort((left, right) => right.confidenceScore - left.confidenceScore);
    return sorted[0] ?? null;
  }

  /**
   * Merges person data from a provider result into the accumulated data.
   * Existing fields are never overwritten — first non-empty value wins.
   */
  private mergePersonData(
    accumulated: ExtractedPersonData,
    incoming: ExtractedPersonData | undefined
  ): void {
    if (!incoming) return;
    if (incoming.firstName && !accumulated.firstName) {
      accumulated.firstName = incoming.firstName;
    }
    if (incoming.lastName && isWeakLastName(accumulated.lastName)) {
      accumulated.lastName = incoming.lastName;
    }
    if (
      incoming.fullName &&
      isPlausiblePersonName(incoming.fullName, incoming.firstName ?? accumulated.firstName) &&
      (isWeakFullName(accumulated.fullName, accumulated.firstName) ||
        incoming.fullName.split(/\s+/).length > (accumulated.fullName?.split(/\s+/).length ?? 0))
    ) {
      accumulated.fullName = incoming.fullName;
    }
    if (incoming.linkedinUrl && !accumulated.linkedinUrl) {
      accumulated.linkedinUrl = incoming.linkedinUrl;
    }
    if (incoming.jobTitle && !accumulated.jobTitle) {
      accumulated.jobTitle = incoming.jobTitle;
    }
    if (incoming.companyName && !accumulated.companyName) {
      accumulated.companyName = incoming.companyName;
    }
    if (incoming.city && !accumulated.city) {
      accumulated.city = incoming.city;
    }
    if (incoming.state && !accumulated.state) {
      accumulated.state = incoming.state;
    }
    if (incoming.country && !accumulated.country) {
      accumulated.country = incoming.country;
    }
    if (
      accumulated.firstName &&
      accumulated.lastName &&
      (!accumulated.fullName || isWeakFullName(accumulated.fullName, accumulated.firstName))
    ) {
      accumulated.fullName = `${accumulated.firstName} ${accumulated.lastName}`;
    }
  }

  /**
   * Enriches the request with any data discovered by previous providers so
   * subsequent providers get the richest possible input.
   */
  private feedForward(
    request: EnrichmentRequest,
    accumulated: ExtractedPersonData,
    emails: string[],
    phones: string[]
  ): EnrichmentRequest {
    return {
      ...request,
      firstName: request.firstName || accumulated.firstName,
      lastName: request.lastName || accumulated.lastName,
      fullName: request.fullName || accumulated.fullName,
      companyName: request.companyName || accumulated.companyName,
      jobTitle: request.jobTitle || accumulated.jobTitle,
      linkedinUrl: request.linkedinUrl || accumulated.linkedinUrl,
      emails: emails.length > 0 ? emails : request.emails,
      phones: phones.length > 0 ? phones : request.phones
    };
  }

  public async enrich(job: EnrichmentJobInput, correlationId: string): Promise<void> {
    const lead = await this.prismaClient.lead.findUnique({
      where: { id: job.leadId },
      select: { id: true, expertId: true, firstName: true, lastName: true, fullName: true,
                jobTitle: true, linkedinUrl: true, countryIso: true, metadata: true }
    });
    if (!lead) {
      return;
    }

    const completionService = new ProjectCompletionService(this.prismaClient);

    let hasEmail = false;
    let hasPhone = false;
    let hasLinkedin = false;

    if (lead.expertId) {
      const existingContacts = await this.prismaClient.expertContact.findMany({
        where: { expertId: lead.expertId, deletedAt: null },
        select: { id: true, type: true, value: true }
      });
      const fakeContactIds = existingContacts
        .filter((contact) =>
          (contact.type === 'EMAIL' && isFakeEmail(contact.value)) ||
          (contact.type === 'PHONE' && isFakePhone(contact.value))
        )
        .map((contact) => contact.id);
      if (fakeContactIds.length > 0) {
        await this.prismaClient.expertContact.updateMany({
          where: { id: { in: fakeContactIds } },
          data: { deletedAt: clock.now() }
        });
      }
      const validContacts = existingContacts.filter((contact) => !fakeContactIds.includes(contact.id));
      hasEmail = validContacts.some((c) => c.type === 'EMAIL' && !isFakeEmail(c.value));
      hasPhone = validContacts.some((c) => c.type === 'PHONE' && !isFakePhone(c.value));
      hasLinkedin = validContacts.some((c) => c.type === 'LINKEDIN');
    }

    const allPersonFieldsAlreadyFilled =
      Boolean(lead.firstName) && Boolean(lead.lastName) &&
      !isWeakFullName(lead.fullName, lead.firstName) && Boolean(lead.linkedinUrl) &&
      Boolean(lead.jobTitle);

    if (hasEmail && hasPhone && allPersonFieldsAlreadyFilled) {
      await this.prismaClient.lead.update({
        where: { id: job.leadId },
        data: { status: 'ENRICHED', enrichmentConfidence: 1.0 }
      });
      await completionService.recalculate(job.projectId);
      return;
    }

    const project = await this.prismaClient.project.findUnique({
      where: { id: job.projectId }
    });
    const projectRecord = project as unknown as Record<string, unknown> | null;
    const eligibleProviders = this.providerClients.filter((client) => {
      if (!client.providerType) return true;
      const bindingField = PROVIDER_TYPE_TO_PROJECT_BINDING_FIELD[client.providerType];
      if (!bindingField || !projectRecord) return true;
      return Boolean(projectRecord[bindingField]);
    });

    const baseRequest = this.buildRequest(job);
    const allResults: EnrichmentResult[] = [];
    const accumulatedPerson: ExtractedPersonData = {
      firstName: job.firstName ?? lead.firstName ?? undefined,
      lastName: job.lastName ?? lead.lastName ?? undefined,
      fullName: job.fullName ?? lead.fullName ?? undefined,
      linkedinUrl: job.linkedinUrl ?? lead.linkedinUrl ?? undefined,
      jobTitle: job.jobTitle ?? lead.jobTitle ?? undefined
    };
    if (!accumulatedPerson.lastName && accumulatedPerson.linkedinUrl) {
      const slugName = parseLinkedInSlugName(accumulatedPerson.linkedinUrl, accumulatedPerson.firstName);
      if (slugName) {
        if (!accumulatedPerson.firstName) accumulatedPerson.firstName = slugName.firstName;
        accumulatedPerson.lastName = slugName.lastName;
        accumulatedPerson.fullName = slugName.fullName;
      }
    }
    const collectedEmails: string[] = (job.emails ?? []).filter((e) => !isFakeEmail(e));
    const collectedPhones: string[] = (job.phones ?? []).filter((p) => !isFakePhone(p));
    const leadMetadata = (lead.metadata as Record<string, unknown> | null) ?? {};

    if (projectRecord?.apolloProviderAccountId) {
      const apolloResult = await this.runApolloProvider({
        leadId: job.leadId,
        projectId: job.projectId,
        correlationId,
        apolloId: typeof leadMetadata.apolloId === 'string' ? leadMetadata.apolloId : undefined,
        firstName: accumulatedPerson.firstName,
        lastName: accumulatedPerson.lastName,
        fullName: accumulatedPerson.fullName,
        companyName: job.companyName,
        linkedinUrl: accumulatedPerson.linkedinUrl
      });
      if (apolloResult) {
        allResults.push(apolloResult);
        if (apolloResult.personData?.firstName) {
          accumulatedPerson.firstName = apolloResult.personData.firstName;
        }
        if (apolloResult.personData?.lastName) {
          accumulatedPerson.lastName = apolloResult.personData.lastName;
        }
        if (
          apolloResult.personData?.fullName &&
          isPlausiblePersonName(apolloResult.personData.fullName, apolloResult.personData.firstName)
        ) {
          accumulatedPerson.fullName = apolloResult.personData.fullName;
        } else if (accumulatedPerson.firstName && accumulatedPerson.lastName) {
          accumulatedPerson.fullName = `${accumulatedPerson.firstName} ${accumulatedPerson.lastName}`;
        }
        this.mergePersonData(accumulatedPerson, apolloResult.personData);
        collectedEmails.push(...apolloResult.emails);
        collectedPhones.push(...apolloResult.phones);
        if (apolloResult.emails.some((email) => !isFakeEmail(email))) hasEmail = true;
        if (apolloResult.phones.some((phone) => !isFakePhone(phone))) hasPhone = true;
      }
    }

    for (const providerClient of eligibleProviders) {
      const enrichedRequest = this.feedForward(baseRequest, accumulatedPerson, collectedEmails, collectedPhones);
      const result = await this.runProvider(providerClient, enrichedRequest, correlationId, job.leadId);
      if (result) {
        allResults.push(result);
        this.mergePersonData(accumulatedPerson, result.personData);

        const resultEmails = result.emails
          .map((e) => normalizeEmail(e))
          .filter((e): e is string => Boolean(e))
          .filter((e) => !isFakeEmail(e));
        const resultPhones = result.phones
          .map((p) => normalizePhone(p))
          .filter((p): p is string => Boolean(p))
          .filter((p) => !isFakePhone(p));

        for (const e of resultEmails) {
          if (!collectedEmails.includes(e)) collectedEmails.push(e);
        }
        for (const p of resultPhones) {
          if (!collectedPhones.includes(p)) collectedPhones.push(p);
        }

        if (!hasEmail && resultEmails.length > 0) hasEmail = true;
        if (!hasPhone && resultPhones.length > 0) hasPhone = true;

        const allContactsFilled = hasEmail && hasPhone;
        const allPersonFilled =
          Boolean(accumulatedPerson.firstName) &&
          Boolean(accumulatedPerson.lastName) &&
          Boolean(accumulatedPerson.fullName) &&
          Boolean(accumulatedPerson.linkedinUrl) &&
          Boolean(accumulatedPerson.jobTitle) &&
          Boolean(accumulatedPerson.companyName);

        if (allContactsFilled && allPersonFilled) break;
      }
    }

    const bestResult = this.pickBestResult(allResults);

    if (!bestResult) {
      if (hasEmail || hasPhone) {
        await this.prismaClient.lead.update({
          where: { id: job.leadId },
          data: { status: 'ENRICHED', enrichmentConfidence: 0 }
        });
        await completionService.recalculate(job.projectId);
      }
      return;
    }

    const normalizedEmails = Array.from(new Set(
      collectedEmails.map((e) => normalizeEmail(e)).filter((e): e is string => Boolean(e))
    ));
    const normalizedPhones = Array.from(new Set(
      collectedPhones.map((p) => normalizePhone(p)).filter((p): p is string => Boolean(p))
    ));
    const allowedCountries = (project?.geographyIsoCodes ?? []).map((code) => isoCodeToLocationName(code).toLowerCase());
    const leadCountry = accumulatedPerson.country?.trim().toLowerCase();
    const isOutOfGeo =
      leadMetadata.source === 'apollo_people_search' &&
      allowedCountries.length > 0 &&
      Boolean(leadCountry) &&
      !allowedCountries.includes(leadCountry!);

    const hasAnyContact = hasEmail || hasPhone || normalizedEmails.length > 0 || normalizedPhones.length > 0;
    const leadUpdateData: Record<string, unknown> = {
      status: isOutOfGeo ? 'DISQUALIFIED' : (hasAnyContact ? 'ENRICHED' : 'NEW'),
      enrichmentConfidence: bestResult.confidenceScore
    };
    if (accumulatedPerson.fullName && (isWeakFullName(lead.fullName, lead.firstName) || lead.fullName !== accumulatedPerson.fullName)) {
      leadUpdateData.fullName = accumulatedPerson.fullName;
    }
    if (accumulatedPerson.firstName && !lead.firstName) leadUpdateData.firstName = accumulatedPerson.firstName;
    if (
      accumulatedPerson.lastName &&
      (isWeakLastName(lead.lastName) ||
        lead.fullName === lead.firstName ||
        leadMetadata.source === 'apollo_people_search')
    ) {
      leadUpdateData.lastName = accumulatedPerson.lastName;
    }
    if (accumulatedPerson.jobTitle && !lead.jobTitle) leadUpdateData.jobTitle = accumulatedPerson.jobTitle;
    if (accumulatedPerson.linkedinUrl && !lead.linkedinUrl) leadUpdateData.linkedinUrl = accumulatedPerson.linkedinUrl;
    if (
      accumulatedPerson.country &&
      (!lead.countryIso ||
        leadMetadata.source === 'apollo_people_search' ||
        lead.countryIso !== accumulatedPerson.country)
    ) {
      leadUpdateData.countryIso = accumulatedPerson.country;
    }

    const existingMeta = (await this.prismaClient.lead.findUnique({
      where: { id: job.leadId }, select: { metadata: true }
    }))?.metadata as Record<string, unknown> | null;
    const metaUpdate: Record<string, unknown> = { ...(existingMeta ?? {}) };
    if (accumulatedPerson.city && !metaUpdate.city) metaUpdate.city = accumulatedPerson.city;
    if (accumulatedPerson.state && !metaUpdate.state) metaUpdate.state = accumulatedPerson.state;
    if (accumulatedPerson.country && !metaUpdate.country) metaUpdate.country = accumulatedPerson.country;
    if (accumulatedPerson.companyName && !metaUpdate.companyName) metaUpdate.companyName = accumulatedPerson.companyName;
    if (isOutOfGeo) {
      metaUpdate.geoMismatch = true;
      metaUpdate.allowedCountries = allowedCountries;
    }
    leadUpdateData.metadata = toJsonValue(metaUpdate);

    await this.prismaClient.lead.update({
      where: { id: job.leadId },
      data: leadUpdateData as Prisma.LeadUpdateInput
    });
    await completionService.recalculate(job.projectId);

    const updatedLead = await this.prismaClient.lead.findUnique({
      where: { id: job.leadId }
    });
    if (!updatedLead?.expertId) {
      return;
    }

    const expertUpdateData: Record<string, unknown> = {};
    const expert = await this.prismaClient.expert.findUnique({
      where: { id: updatedLead.expertId },
      select: { fullName: true, firstName: true, lastName: true, currentRole: true,
                currentCompany: true, countryIso: true, regionIso: true }
    });
    if (expert) {
      if (accumulatedPerson.fullName && isWeakFullName(expert.fullName, expert.firstName)) {
        expertUpdateData.fullName = accumulatedPerson.fullName;
      }
      if (accumulatedPerson.firstName && !expert.firstName) expertUpdateData.firstName = accumulatedPerson.firstName;
      if (
        accumulatedPerson.lastName &&
        (isWeakLastName(expert.lastName) || leadMetadata.source === 'apollo_people_search')
      ) {
        expertUpdateData.lastName = accumulatedPerson.lastName;
      }
      if (accumulatedPerson.jobTitle && !expert.currentRole) expertUpdateData.currentRole = accumulatedPerson.jobTitle;
      if (accumulatedPerson.companyName && !expert.currentCompany) expertUpdateData.currentCompany = accumulatedPerson.companyName;
      if (accumulatedPerson.country && (!expert.countryIso || expert.countryIso !== accumulatedPerson.country)) {
        expertUpdateData.countryIso = accumulatedPerson.country;
      }
      if (accumulatedPerson.state && !expert.regionIso) expertUpdateData.regionIso = accumulatedPerson.state;
      if (Object.keys(expertUpdateData).length > 0) {
        await this.prismaClient.expert.update({
          where: { id: updatedLead.expertId },
          data: expertUpdateData as Prisma.ExpertUpdateInput
        });
      }
    }

    for (const email of normalizedEmails) {
      await this.prismaClient.expertContact.upsert({
        where: {
          expertId_type_valueNormalized: {
            expertId: updatedLead.expertId,
            type: 'EMAIL',
            valueNormalized: email
          }
        },
        create: {
          expertId: updatedLead.expertId,
          type: 'EMAIL',
          label: 'PROFESSIONAL',
          value: email,
          valueNormalized: email,
          verificationStatus: 'VERIFIED',
          confidenceScore: bestResult.confidenceScore
        },
        update: {
          verificationStatus: 'VERIFIED',
          confidenceScore: bestResult.confidenceScore
        }
      });
    }

    for (const phone of normalizedPhones) {
      await this.prismaClient.expertContact.upsert({
        where: {
          expertId_type_valueNormalized: {
            expertId: updatedLead.expertId,
            type: 'PHONE',
            valueNormalized: phone
          }
        },
        create: {
          expertId: updatedLead.expertId,
          type: 'PHONE',
          label: 'MOBILE',
          value: phone,
          valueNormalized: phone,
          verificationStatus: 'VERIFIED',
          confidenceScore: bestResult.confidenceScore
        },
        update: {
          verificationStatus: 'VERIFIED',
          confidenceScore: bestResult.confidenceScore
        }
      });
    }

    if (accumulatedPerson.linkedinUrl && !hasLinkedin) {
      const normalizedLinkedin = accumulatedPerson.linkedinUrl.trim().toLowerCase();
      await this.prismaClient.expertContact.upsert({
        where: {
          expertId_type_valueNormalized: {
            expertId: updatedLead.expertId,
            type: 'LINKEDIN',
            valueNormalized: normalizedLinkedin
          }
        },
        create: {
          expertId: updatedLead.expertId,
          type: 'LINKEDIN',
          label: 'PROFESSIONAL',
          value: accumulatedPerson.linkedinUrl,
          valueNormalized: normalizedLinkedin,
          verificationStatus: 'UNVERIFIED',
          confidenceScore: 0.8
        },
        update: {}
      });
    }

    await this.queuePhoneExports(updatedLead.id, updatedLead.expertId, normalizedPhones, job.projectId, correlationId);
    if (updatedLead.status === 'ENRICHED') {
      await this.queueSupabaseSync(updatedLead.id, job.projectId, correlationId);
    }
  }

  private async queuePhoneExports(
    leadId: string,
    expertId: string,
    phones: string[],
    projectId: string,
    correlationId: string
  ): Promise<void> {
    if (phones.length === 0) {
      return;
    }

    const expert = await this.prismaClient.expert.findUnique({
      where: { id: expertId }
    });
    if (!expert) {
      return;
    }

    const hasGoogleSheets = await this.prismaClient.project.findUnique({
      where: { id: projectId },
      select: { googleSheetsProviderAccountId: true }
    });
    if (!hasGoogleSheets?.googleSheetsProviderAccountId) {
      return;
    }

    for (const phone of phones) {
      await getQueues().googleSheetsSyncQueue.add(
        'google-sheets-sync.phone-export',
        {
          correlationId,
          data: {
            projectId,
            tabName: GOOGLE_SHEETS_TABS.PHONE_EXPORT,
            entityType: 'expert_contact_phone',
            entityId: `${expert.id}::${phone}`,
            entityPayload: {
              expertId: expert.id,
              fullName: expert.fullName,
              countryIso: expert.countryIso ?? '',
              phone,
              phoneLabel: 'MOBILE',
              verificationStatus: 'VERIFIED',
              projectId
            }
          }
        },
        {
          jobId: buildJobId('gsheets-phone-export', expert.id, phone)
        }
      );
    }

    await this.prismaClient.lead.update({
      where: { id: leadId },
      data: { googleSheetsExportedAt: new Date() }
    });
  }

  private async queueSupabaseSync(
    leadId: string,
    projectId: string,
    correlationId: string
  ): Promise<void> {
    const project = await this.prismaClient.project.findUnique({
      where: { id: projectId },
      select: { supabaseProviderAccountId: true }
    });
    if (!project?.supabaseProviderAccountId) {
      return;
    }

    await getQueues().supabaseSyncQueue.add(
      'supabase-sync.enriched-lead',
      {
        correlationId,
        data: {
          projectId,
          leadId
        }
      },
      {
        jobId: buildJobId('supabase-sync', projectId, leadId)
      }
    );
  }
}
