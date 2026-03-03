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
  EnrichmentResult
} from '../../integrations/enrichment/types';
import { getQueues } from '../../queues';
import { buildJobId } from '../../queues/jobId';
import { GOOGLE_SHEETS_TABS } from '../google-sheets-sync/googleSheetsTabMapping';
import { ProjectCompletionService } from '../projects/projectCompletionService';
import { normalizeEmail, normalizePhone } from './enrichmentValidators';

export interface EnrichmentJobInput {
  leadId: string;
  projectId: string;
  fullName?: string;
  companyName?: string;
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
      fullName: job.fullName,
      companyName: job.companyName,
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
        error instanceof Error &&
        error.message.includes('Foreign key constraint violated');
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

  public async enrich(job: EnrichmentJobInput, correlationId: string): Promise<void> {
    const lead = await this.prismaClient.lead.findUnique({
      where: { id: job.leadId },
      select: { id: true, expertId: true }
    });
    if (!lead) {
      return;
    }

    const completionService = new ProjectCompletionService(this.prismaClient);

    let hasEmail = false;
    let hasPhone = false;

    if (lead.expertId) {
      const existingContacts = await this.prismaClient.expertContact.findMany({
        where: { expertId: lead.expertId },
        select: { type: true }
      });
      hasEmail = existingContacts.some((c) => c.type === 'EMAIL');
      hasPhone = existingContacts.some((c) => c.type === 'PHONE');
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

    const request = this.buildRequest(job);
    const allResults: EnrichmentResult[] = [];

    for (const providerClient of eligibleProviders) {
      const result = await this.runProvider(providerClient, request, correlationId, job.leadId);
      if (result) {
        allResults.push(result);

        const resultEmails = result.emails
          .map((e) => normalizeEmail(e))
          .filter((e): e is string => Boolean(e));
        const resultPhones = result.phones
          .map((p) => normalizePhone(p))
          .filter((p): p is string => Boolean(p));

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

    const allEmails = allResults.flatMap((r) => r.emails);
    const allPhones = allResults.flatMap((r) => r.phones);

    const normalizedEmails = Array.from(
      new Set(allEmails.map((email) => normalizeEmail(email)).filter((email): email is string => Boolean(email)))
    );
    const normalizedPhones = Array.from(
      new Set(allPhones.map((phone) => normalizePhone(phone)).filter((phone): phone is string => Boolean(phone)))
    );

    await this.prismaClient.lead.update({
      where: { id: job.leadId },
      data: {
        status: 'ENRICHED',
        enrichmentConfidence: bestResult.confidenceScore
      }
    });
    await completionService.recalculate(job.projectId);

    const updatedLead = await this.prismaClient.lead.findUnique({
      where: { id: job.leadId }
    });
    if (!updatedLead?.expertId) {
      return;
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
