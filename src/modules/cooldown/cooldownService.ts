import type { PrismaClient } from '@prisma/client';

import { ENFORCEMENT } from '../../config/constants';
import { clock } from '../../core/time/clock';

function addDays(date: Date, days: number): Date {
  const clone = new Date(date.toISOString());
  clone.setUTCDate(clone.getUTCDate() + days);
  return clone;
}

export interface CooldownCheckInput {
  projectId: string;
  expertId: string;
  channel:
    | 'PHONE'
    | 'EMAIL'
    | 'LINKEDIN'
    | 'WHATSAPP'
    | 'RESPONDIO'
    | 'SMS'
    | 'IMESSAGE'
    | 'LINE'
    | 'WECHAT'
    | 'VIBER'
    | 'TELEGRAM'
    | 'KAKAOTALK'
    | 'VOICEMAIL';
  overrideCooldown: boolean;
  reason?: string;
}

export class CooldownService {
  public constructor(private readonly prismaClient: PrismaClient) {}

  public async checkAndLog(input: CooldownCheckInput): Promise<{ allowed: boolean; expiresAt: Date }> {
    const now = clock.now();
    const existing = await this.prismaClient.cooldownLog.findFirst({
      where: {
        projectId: input.projectId,
        expertId: input.expertId,
        expiresAt: {
          gt: now
        }
      },
      orderBy: {
        enforcedAt: 'desc'
      }
    });

    const blockedByCooldown = Boolean(existing);
    const allowed = input.overrideCooldown || !blockedByCooldown;
    const expiresAt = addDays(now, ENFORCEMENT.COOLDOWN_DAYS);

    await this.prismaClient.cooldownLog.create({
      data: {
        projectId: input.projectId,
        expertId: input.expertId,
        channel: input.channel,
        blocked: !allowed,
        overrideApplied: input.overrideCooldown,
        reason: input.reason,
        enforcedAt: now,
        expiresAt: blockedByCooldown ? (existing?.expiresAt ?? expiresAt) : expiresAt
      }
    });

    return {
      allowed,
      expiresAt: blockedByCooldown ? (existing?.expiresAt ?? expiresAt) : expiresAt
    };
  }
}
