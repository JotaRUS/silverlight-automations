import type { Prisma, PrismaClient } from '@prisma/client';

import { providerLimiter } from '../../core/rate-limiter/providerLimiter';
import { clock } from '../../core/time/clock';
import { enrichmentProviderClients } from '../../integrations/enrichment/providerClients';
import type { EnrichmentProviderClient, EnrichmentRequest, EnrichmentResult } from '../../integrations/enrichment/types';
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

export class EnrichmentService {
  public constructor(
    private readonly prismaClient: PrismaClient,
    private readonly providerClients: EnrichmentProviderClient[] = enrichmentProviderClients
  ) {}

  private buildRequest(job: EnrichmentJobInput): EnrichmentRequest {
    return {
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
  }

  private async runProvider(
    providerClient: EnrichmentProviderClient,
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
    const request = this.buildRequest(job);

    const parallelProviders = this.providerClients.slice(0, 5);
    const fallbackProviders = this.providerClients.slice(5);

    const parallelResults = await Promise.all(
      parallelProviders.map((providerClient) =>
        this.runProvider(providerClient, request, correlationId, job.leadId)
      )
    );
    const successfulParallelResults = parallelResults.filter(
      (result): result is EnrichmentResult => Boolean(result)
    );

    let bestResult = this.pickBestResult(successfulParallelResults);
    if (!bestResult || bestResult.confidenceScore < 0.7) {
      for (const providerClient of fallbackProviders) {
        const result = await this.runProvider(providerClient, request, correlationId, job.leadId);
        if (result && (!bestResult || result.confidenceScore > bestResult.confidenceScore)) {
          bestResult = result;
        }
        if (bestResult && bestResult.confidenceScore >= 0.7) {
          break;
        }
      }
    }

    if (!bestResult) {
      await this.prismaClient.lead.update({
        where: { id: job.leadId },
        data: {
          status: 'ENRICHING'
        }
      });
      return;
    }

    const normalizedEmails = Array.from(
      new Set(bestResult.emails.map((email) => normalizeEmail(email)).filter((email): email is string => Boolean(email)))
    );
    const normalizedPhones = Array.from(
      new Set(bestResult.phones.map((phone) => normalizePhone(phone)).filter((phone): phone is string => Boolean(phone)))
    );

    await this.prismaClient.lead.update({
      where: { id: job.leadId },
      data: {
        status: 'ENRICHED',
        enrichmentConfidence: bestResult.confidenceScore
      }
    });

    const lead = await this.prismaClient.lead.findUnique({
      where: { id: job.leadId }
    });
    if (!lead?.expertId) {
      return;
    }

    for (const email of normalizedEmails) {
      await this.prismaClient.expertContact.upsert({
        where: {
          expertId_type_valueNormalized: {
            expertId: lead.expertId,
            type: 'EMAIL',
            valueNormalized: email
          }
        },
        create: {
          expertId: lead.expertId,
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
            expertId: lead.expertId,
            type: 'PHONE',
            valueNormalized: phone
          }
        },
        create: {
          expertId: lead.expertId,
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
  }
}
