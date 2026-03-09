import type { Prisma, PrismaClient } from '@prisma/client';

import { AppError } from '../../core/errors/appError';
import { ProviderCredentialResolver } from '../../core/providers/providerCredentialResolver';
import type { ProviderType } from '../../core/providers/providerTypes';
import { PROVIDER_TYPE_TO_PROJECT_BINDING_FIELD } from '../../core/providers/providerTypes';
import { providerLimiter } from '../../core/rate-limiter/providerLimiter';
import { clock } from '../../core/time/clock';
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
import { normalizeEmail, normalizePhone } from './enrichmentValidators';

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

    const client = new GenericEnrichmentClient({
      providerName: this.providerName,
      endpoint: this.definition.endpoint,
      apiKey,
      apiKeyHeader: this.definition.apiKeyHeader,
      method: this.definition.method,
      apiKeyInUrl: this.definition.apiKeyInUrl,
      apiKeyUrlParam: this.definition.apiKeyUrlParam,
      apiKeyInBody: this.definition.apiKeyInBody,
      apiKeyBodyParam: this.definition.apiKeyBodyParam,
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
      const errorMessage = error instanceof Error ? error.message : 'unknown provider error';
      const normalizedStatus =
        errorMessage.toLowerCase().includes('rate')
          ? 'RATE_LIMITED'
          : errorMessage.toLowerCase().includes('trial')
            ? 'TRIAL_EXHAUSTED'
            : 'FAILED';
      await this.logAttempt(leadId, providerClient.providerName, normalizedStatus, null, {}, errorMessage);
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
    const keys: (keyof ExtractedPersonData)[] = [
      'firstName', 'lastName', 'fullName', 'linkedinUrl',
      'jobTitle', 'companyName', 'city', 'state', 'country'
    ];
    for (const key of keys) {
      if (!accumulated[key] && incoming[key]) {
        accumulated[key] = incoming[key];
      }
    }
    if (accumulated.firstName && accumulated.lastName && !accumulated.fullName) {
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
                jobTitle: true, linkedinUrl: true, countryIso: true }
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
        where: { expertId: lead.expertId },
        select: { type: true }
      });
      hasEmail = existingContacts.some((c) => c.type === 'EMAIL');
      hasPhone = existingContacts.some((c) => c.type === 'PHONE');
      hasLinkedin = existingContacts.some((c) => c.type === 'LINKEDIN');
    }

    if (hasEmail && hasPhone) {
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
    const collectedEmails: string[] = [...(job.emails ?? [])];
    const collectedPhones: string[] = [...(job.phones ?? [])];

    for (const providerClient of eligibleProviders) {
      const enrichedRequest = this.feedForward(baseRequest, accumulatedPerson, collectedEmails, collectedPhones);
      const result = await this.runProvider(providerClient, enrichedRequest, correlationId, job.leadId);
      if (result) {
        allResults.push(result);
        this.mergePersonData(accumulatedPerson, result.personData);

        const resultEmails = result.emails
          .map((e) => normalizeEmail(e))
          .filter((e): e is string => Boolean(e));
        const resultPhones = result.phones
          .map((p) => normalizePhone(p))
          .filter((p): p is string => Boolean(p));

        for (const e of resultEmails) {
          if (!collectedEmails.includes(e)) collectedEmails.push(e);
        }
        for (const p of resultPhones) {
          if (!collectedPhones.includes(p)) collectedPhones.push(p);
        }

        if (!hasEmail && resultEmails.length > 0) hasEmail = true;
        if (!hasPhone && resultPhones.length > 0) hasPhone = true;

        if (hasEmail && hasPhone) break;
      }
    }

    const bestResult = this.pickBestResult(allResults);

    if (!bestResult) {
      await this.prismaClient.lead.update({
        where: { id: job.leadId },
        data: { status: 'ENRICHED', enrichmentConfidence: 0 }
      });
      await completionService.recalculate(job.projectId);
      return;
    }

    const normalizedEmails = Array.from(new Set(
      collectedEmails.map((e) => normalizeEmail(e)).filter((e): e is string => Boolean(e))
    ));
    const normalizedPhones = Array.from(new Set(
      collectedPhones.map((p) => normalizePhone(p)).filter((p): p is string => Boolean(p))
    ));

    const leadUpdateData: Record<string, unknown> = {
      status: 'ENRICHED',
      enrichmentConfidence: bestResult.confidenceScore
    };
    if (accumulatedPerson.fullName && !lead.fullName) leadUpdateData.fullName = accumulatedPerson.fullName;
    if (accumulatedPerson.firstName && !lead.firstName) leadUpdateData.firstName = accumulatedPerson.firstName;
    if (accumulatedPerson.lastName && !lead.lastName) leadUpdateData.lastName = accumulatedPerson.lastName;
    if (accumulatedPerson.jobTitle && !lead.jobTitle) leadUpdateData.jobTitle = accumulatedPerson.jobTitle;
    if (accumulatedPerson.linkedinUrl && !lead.linkedinUrl) leadUpdateData.linkedinUrl = accumulatedPerson.linkedinUrl;
    if (accumulatedPerson.country && !lead.countryIso) leadUpdateData.countryIso = accumulatedPerson.country;

    const existingMeta = (await this.prismaClient.lead.findUnique({
      where: { id: job.leadId }, select: { metadata: true }
    }))?.metadata as Record<string, unknown> | null;
    const metaUpdate: Record<string, unknown> = { ...(existingMeta ?? {}) };
    if (accumulatedPerson.city && !metaUpdate.city) metaUpdate.city = accumulatedPerson.city;
    if (accumulatedPerson.state && !metaUpdate.state) metaUpdate.state = accumulatedPerson.state;
    if (accumulatedPerson.country && !metaUpdate.country) metaUpdate.country = accumulatedPerson.country;
    if (accumulatedPerson.companyName && !metaUpdate.companyName) metaUpdate.companyName = accumulatedPerson.companyName;
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
      if (accumulatedPerson.fullName && (!expert.fullName || expert.fullName.includes('*'))) {
        expertUpdateData.fullName = accumulatedPerson.fullName;
      }
      if (accumulatedPerson.firstName && !expert.firstName) expertUpdateData.firstName = accumulatedPerson.firstName;
      if (accumulatedPerson.lastName && !expert.lastName) expertUpdateData.lastName = accumulatedPerson.lastName;
      if (accumulatedPerson.jobTitle && !expert.currentRole) expertUpdateData.currentRole = accumulatedPerson.jobTitle;
      if (accumulatedPerson.companyName && !expert.currentCompany) expertUpdateData.currentCompany = accumulatedPerson.companyName;
      if (accumulatedPerson.country && !expert.countryIso) expertUpdateData.countryIso = accumulatedPerson.country;
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

    await this.queuePhoneExports(updatedLead.expertId, normalizedPhones, job.projectId, correlationId);
  }

  private async queuePhoneExports(
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
  }
}
