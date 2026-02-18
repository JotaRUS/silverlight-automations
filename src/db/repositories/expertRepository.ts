import { createHash } from 'node:crypto';

import type { Expert, Prisma, PrismaClient } from '@prisma/client';

import { withIdentityAdvisoryLock } from '../transactions/identityAdvisoryLock';

export interface ExpertIdentity {
  fullName: string;
  email?: string;
  phone?: string;
  linkedinUrl?: string;
}

export interface FindOrCreateExpertInput extends ExpertIdentity {
  countryIso?: string;
  regionIso?: string;
  timezone?: string;
  languageCodes?: string[];
  metadata?: Prisma.InputJsonValue;
}

function normalizeOptional(value?: string): string | undefined {
  return value ? value.trim().toLowerCase() : undefined;
}

function hashOptional(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }
  return createHash('sha256').update(value).digest('hex');
}

function buildIdentityLockKey(identity: ExpertIdentity): string {
  const parts = [identity.email, identity.phone, identity.linkedinUrl]
    .map(normalizeOptional)
    .filter((value): value is string => Boolean(value))
    .sort();
  return parts.join('|');
}

export class ExpertRepository {
  public constructor(private readonly prismaClient: PrismaClient) {}

  public async findOrCreateByIdentity(input: FindOrCreateExpertInput): Promise<Expert> {
    const normalizedEmail = normalizeOptional(input.email);
    const normalizedPhone = normalizeOptional(input.phone);
    const normalizedLinkedin = normalizeOptional(input.linkedinUrl);
    const lockKey = buildIdentityLockKey(input) || `name:${input.fullName.toLowerCase()}`;

    return withIdentityAdvisoryLock(this.prismaClient, lockKey, async (transaction) => {
      const identityCriteria: Prisma.ExpertWhereInput[] = [];
      if (normalizedEmail) {
        identityCriteria.push({ emailHash: hashOptional(normalizedEmail) });
      }
      if (normalizedPhone) {
        identityCriteria.push({ phoneHash: hashOptional(normalizedPhone) });
      }
      if (normalizedLinkedin) {
        identityCriteria.push({ linkedinHash: hashOptional(normalizedLinkedin) });
      }

      const existingExpert = identityCriteria.length
        ? await transaction.expert.findFirst({
            where: {
              OR: identityCriteria
            }
          })
        : await transaction.expert.findFirst({
            where: {
              fullName: input.fullName
            }
          });

      if (existingExpert) {
        return existingExpert;
      }

      const createdExpert = await transaction.expert.create({
        data: {
          fullName: input.fullName,
          countryIso: input.countryIso,
          regionIso: input.regionIso,
          timezone: input.timezone,
          languageCodes: input.languageCodes ?? [],
          metadata: input.metadata,
          emailHash: hashOptional(normalizedEmail),
          phoneHash: hashOptional(normalizedPhone),
          linkedinHash: hashOptional(normalizedLinkedin)
        }
      });

      if (normalizedEmail) {
        await transaction.expertContact.upsert({
          where: {
            expertId_type_valueNormalized: {
              expertId: createdExpert.id,
              type: 'EMAIL',
              valueNormalized: normalizedEmail
            }
          },
          create: {
            expertId: createdExpert.id,
            type: 'EMAIL',
            label: 'PROFESSIONAL',
            value: input.email ?? normalizedEmail,
            valueNormalized: normalizedEmail,
            verificationStatus: 'UNVERIFIED',
            isPrimary: true
          },
          update: {}
        });
      }

      if (normalizedPhone) {
        await transaction.expertContact.upsert({
          where: {
            expertId_type_valueNormalized: {
              expertId: createdExpert.id,
              type: 'PHONE',
              valueNormalized: normalizedPhone
            }
          },
          create: {
            expertId: createdExpert.id,
            type: 'PHONE',
            label: 'MOBILE',
            value: input.phone ?? normalizedPhone,
            valueNormalized: normalizedPhone,
            verificationStatus: 'UNVERIFIED',
            isPrimary: true
          },
          update: {}
        });
      }

      if (normalizedLinkedin) {
        await transaction.expertContact.upsert({
          where: {
            expertId_type_valueNormalized: {
              expertId: createdExpert.id,
              type: 'LINKEDIN',
              valueNormalized: normalizedLinkedin
            }
          },
          create: {
            expertId: createdExpert.id,
            type: 'LINKEDIN',
            label: 'OTHER',
            value: input.linkedinUrl ?? normalizedLinkedin,
            valueNormalized: normalizedLinkedin,
            verificationStatus: 'VERIFIED',
            isPrimary: true
          },
          update: {}
        });
      }

      return createdExpert;
    });
  }
}
