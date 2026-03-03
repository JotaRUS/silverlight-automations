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

  /**
   * Read-only check: returns whether outreach is allowed without writing
   * any cooldown record. Use this before attempting a send so that a
   * transient provider failure does not burn the cooldown window.
   */
  public async check(input: CooldownCheckInput): Promise<{ allowed: boolean; expiresAt: Date }> {
    const now = clock.now();
    const existing = await this.prismaClient.cooldownLog.findFirst({
      where: {
        projectId: input.projectId,
        expertId: input.expertId,
        expiresAt: { gt: now }
      },
      orderBy: { enforcedAt: 'desc' }
    });

    const blockedByCooldown = Boolean(existing);
    const allowed = input.overrideCooldown || !blockedByCooldown;
    const expiresAt = existing?.expiresAt ?? addDays(now, ENFORCEMENT.COOLDOWN_DAYS);

    return { allowed, expiresAt };
  }

  /**
   * Writes a cooldown record. Call this only after the outreach message
   * has been successfully delivered so that retries are not blocked by a
   * prematurely created cooldown entry.
   */
  public async enforce(input: CooldownCheckInput): Promise<{ expiresAt: Date }> {
    const now = clock.now();
    const expiresAt = addDays(now, ENFORCEMENT.COOLDOWN_DAYS);

    await this.prismaClient.cooldownLog.create({
      data: {
        projectId: input.projectId,
        expertId: input.expertId,
        channel: input.channel,
        blocked: false,
        overrideApplied: input.overrideCooldown,
        reason: input.reason,
        enforcedAt: now,
        expiresAt
      }
    });

    return { expiresAt };
  }

  /**
   * @deprecated Use check() before send and enforce() after success instead.
   * Kept for backward compatibility — checks AND writes in one call.
   */
  public async checkAndLog(input: CooldownCheckInput): Promise<{ allowed: boolean; expiresAt: Date }> {
    const result = await this.check(input);

    await this.prismaClient.cooldownLog.create({
      data: {
        projectId: input.projectId,
        expertId: input.expertId,
        channel: input.channel,
        blocked: !result.allowed,
        overrideApplied: input.overrideCooldown,
        reason: input.reason,
        enforcedAt: clock.now(),
        expiresAt: result.expiresAt
      }
    });

    return result;
  }
}
