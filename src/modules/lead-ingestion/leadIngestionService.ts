import { createHash } from 'node:crypto';

import type { Lead, Prisma, PrismaClient } from '@prisma/client';

import { clock } from '../../core/time/clock';
import { withIdentityAdvisoryLock } from '../../db/transactions/identityAdvisoryLock';
import { getQueues } from '../../queues';
import { buildJobId } from '../../queues/jobId';
import { enqueueWithContext } from '../../queues/producers/enqueueWithContext';
import type { LeadIngestionJob } from '../../queues/definitions/jobPayloadSchemas';
import { normalizeEmail, normalizePhone, isFakeEmail, isFakePhone } from '../enrichment/enrichmentValidators';
import { ProjectCompletionService } from '../projects/projectCompletionService';

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
      conditions.push({
        fullName: job.lead.fullName,
        metadata: {
          path: ['companyName'],
          equals: job.lead.companyName
        }
      });
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
    const lead = await withIdentityAdvisoryLock(this.prismaClient, `lead:${job.projectId}:${identity}`, async (transaction) => {
      const nameFromParts = [job.lead.firstName, job.lead.lastName].filter(Boolean).join(' ');
      const resolvedFullName = job.lead.fullName || nameFromParts || job.lead.firstName || 'Unknown';
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
          fullName: resolvedFullName,
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

      const firstEmail = job.lead.emails[0];
      const emailHash = firstEmail && !isFakeEmail(firstEmail)
        ? this.hashOptional(normalizeValue(firstEmail))
        : undefined;
      const firstPhone = job.lead.phones[0];
      const phoneHash = firstPhone && !isFakePhone(firstPhone)
        ? this.hashOptional(normalizeValue(firstPhone))
        : undefined;
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
                  fullName: createdLead.fullName ?? resolvedFullName
                }
              ]
        }
      });

      const expert =
        existingExpert ??
        (await transaction.expert.create({
          data: {
            fullName: createdLead.fullName ?? resolvedFullName,
            countryIso: createdLead.countryIso ?? undefined,
            regionIso: createdLead.regionIso ?? undefined,
            metadata: {
              companyName: job.lead.companyName,
              source: job.source ?? 'sales_nav'
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

      for (const rawEmail of job.lead.emails) {
        const normalized = normalizeEmail(rawEmail);
        if (normalized) {
          await transaction.expertContact.upsert({
            where: {
              expertId_type_valueNormalized: {
                expertId: expert.id,
                type: 'EMAIL',
                valueNormalized: normalized
              }
            },
            create: {
              expertId: expert.id,
              type: 'EMAIL',
              label: 'PROFESSIONAL',
              value: normalized,
              valueNormalized: normalized,
              verificationStatus: 'UNVERIFIED',
              confidenceScore: 0.5
            },
            update: {}
          });
        }
      }

      for (const rawPhone of job.lead.phones) {
        const normalized = normalizePhone(rawPhone);
        if (normalized) {
          await transaction.expertContact.upsert({
            where: {
              expertId_type_valueNormalized: {
                expertId: expert.id,
                type: 'PHONE',
                valueNormalized: normalized
              }
            },
            create: {
              expertId: expert.id,
              type: 'PHONE',
              label: 'MOBILE',
              value: normalized,
              valueNormalized: normalized,
              verificationStatus: 'UNVERIFIED',
              confidenceScore: 0.5
            },
            update: {}
          });
        }
      }

      if (job.lead.linkedinUrl) {
        const normalizedLinkedin = job.lead.linkedinUrl.trim().toLowerCase();
        await transaction.expertContact.upsert({
          where: {
            expertId_type_valueNormalized: {
              expertId: expert.id,
              type: 'LINKEDIN',
              valueNormalized: normalizedLinkedin
            }
          },
          create: {
            expertId: expert.id,
            type: 'LINKEDIN',
            label: 'PROFESSIONAL',
            value: job.lead.linkedinUrl,
            valueNormalized: normalizedLinkedin,
            verificationStatus: 'UNVERIFIED',
            confidenceScore: 0.5
          },
          update: {}
        });
      }

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

      await enqueueWithContext(getQueues().enrichmentQueue, 'enrichment.run', {
        leadId: createdLead.id,
        projectId: job.projectId,
        firstName: createdLead.firstName ?? undefined,
        lastName: createdLead.lastName ?? undefined,
        fullName: createdLead.fullName ?? undefined,
        companyName: job.lead.companyName,
        jobTitle: createdLead.jobTitle ?? undefined,
        linkedinUrl: createdLead.linkedinUrl ?? undefined,
        countryIso: createdLead.countryIso ?? undefined,
        emails: job.lead.emails.filter((e) => !isFakeEmail(e)),
        phones: job.lead.phones.filter((p) => !isFakePhone(p))
      }, {
        jobId: buildJobId('enrichment', createdLead.id)
      });

      return createdLead;
    });

    const completionService = new ProjectCompletionService(this.prismaClient);
    await completionService.recalculate(job.projectId);

    return lead;
  }
}
