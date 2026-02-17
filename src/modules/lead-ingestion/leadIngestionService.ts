import { createHash } from 'node:crypto';

import type { Lead, Prisma, PrismaClient } from '@prisma/client';

import { clock } from '../../core/time/clock';
import { withIdentityAdvisoryLock } from '../../db/transactions/identityAdvisoryLock';
import type { LeadIngestionJob } from '../../queues/definitions/jobPayloadSchemas';

function normalizeValue(value?: string): string | undefined {
  return value?.trim().toLowerCase();
}

function buildLeadIdentity(job: LeadIngestionJob): string {
  return (
    normalizeValue(job.lead.linkedinUrl) ??
    normalizeValue(job.lead.emails[0]) ??
    normalizeValue(job.lead.phones[0]) ??
    `${normalizeValue(job.lead.fullName) ?? 'unknown'}:${normalizeValue(job.lead.companyName) ?? 'unknown'}`
  );
}

export class LeadIngestionService {
  public constructor(private readonly prismaClient: PrismaClient) {}

  private hashOptional(value?: string): string | undefined {
    if (!value) {
      return undefined;
    }
    return createHash('sha256').update(value).digest('hex');
  }

  private toLeadWhere(job: LeadIngestionJob): Prisma.LeadWhereInput {
    const conditions: Prisma.LeadWhereInput[] = [];
    if (job.lead.linkedinUrl) {
      conditions.push({ linkedinUrl: job.lead.linkedinUrl });
    }
    if (job.lead.fullName && job.lead.companyName) {
      conditions.push({ fullName: job.lead.fullName });
    }

    if (!conditions.length) {
      conditions.push({
        fullName: job.lead.fullName ?? 'Unknown'
      });
    }

    return {
      projectId: job.projectId,
      OR: conditions
    };
  }

  public async ingest(job: LeadIngestionJob): Promise<Lead> {
    const identity = buildLeadIdentity(job);
    return withIdentityAdvisoryLock(this.prismaClient, `lead:${job.projectId}:${identity}`, async (transaction) => {
      const existing = await transaction.lead.findFirst({
        where: this.toLeadWhere(job)
      });

      if (existing) {
        return existing;
      }

      const createdLead = await transaction.lead.create({
        data: {
          projectId: job.projectId,
          salesNavSearchId: job.salesNavSearchId,
          firstName: job.lead.firstName,
          lastName: job.lead.lastName,
          fullName: job.lead.fullName,
          jobTitle: job.lead.jobTitle,
          countryIso: job.lead.countryIso,
          regionIso: job.lead.regionIso,
          linkedinUrl: job.lead.linkedinUrl,
          status: 'NEW',
          metadata: {
            companyName: job.lead.companyName,
            emails: job.lead.emails,
            phones: job.lead.phones,
            importedAt: clock.now().toISOString(),
            ...job.lead.metadata
          }
        }
      });

      const emailHash = this.hashOptional(normalizeValue(job.lead.emails[0]));
      const phoneHash = this.hashOptional(normalizeValue(job.lead.phones[0]));
      const linkedinHash = this.hashOptional(normalizeValue(job.lead.linkedinUrl));
      const expertCriteria: Prisma.ExpertWhereInput[] = [];
      if (emailHash) {
        expertCriteria.push({ emailHash });
      }
      if (phoneHash) {
        expertCriteria.push({ phoneHash });
      }
      if (linkedinHash) {
        expertCriteria.push({ linkedinHash });
      }
      const existingExpert = await transaction.expert.findFirst({
        where: {
          OR: expertCriteria.length
            ? expertCriteria
            : [
                {
                  fullName: createdLead.fullName ?? 'Unknown Expert'
                }
              ]
        }
      });

      const expert =
        existingExpert ??
        (await transaction.expert.create({
          data: {
            fullName: createdLead.fullName ?? 'Unknown Expert',
            countryIso: createdLead.countryIso ?? undefined,
            regionIso: createdLead.regionIso ?? undefined,
            metadata: {
              companyName: job.lead.companyName,
              source: 'sales_nav'
            },
            emailHash,
            phoneHash,
            linkedinHash
          }
        }));

      await transaction.lead.update({
        where: { id: createdLead.id },
        data: {
          expertId: expert.id
        }
      });

      await transaction.systemEvent.create({
        data: {
          category: 'JOB',
          entityType: 'lead_ingestion',
          entityId: createdLead.id,
          message: 'lead_ingested_and_expert_checked',
          payload: {
            leadId: createdLead.id,
            expertId: expert.id,
            invitationType: existingExpert ? 'project_invitation' : 'signup_invitation'
          }
        }
      });

      return createdLead;
    });
  }
}
