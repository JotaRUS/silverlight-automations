import type { CallerAllocationStatus, PrismaClient } from '@prisma/client';

import { ENFORCEMENT } from '../../config/constants';
import { clock } from '../../core/time/clock';

export interface PerformanceStatusComputationInput {
  currentStatus: CallerAllocationStatus;
  rolling60MinuteDials: number;
  lowRateConsecutiveMinutes: number;
  warmupActive: boolean;
}

export function computeAllocationStatus(
  input: PerformanceStatusComputationInput
): CallerAllocationStatus {
  if (input.currentStatus === 'RESTRICTED_FRAUD' || input.currentStatus === 'SUSPENDED') {
    return input.currentStatus;
  }

  if (input.warmupActive) {
    return 'WARMUP_GRACE';
  }

  if (input.rolling60MinuteDials >= ENFORCEMENT.DIALS_PER_HOUR_TARGET) {
    return 'ACTIVE';
  }

  if (input.lowRateConsecutiveMinutes >= ENFORCEMENT.CALLER_PAUSE_THRESHOLD_MINUTES) {
    return 'PAUSED_LOW_DIAL_RATE';
  }
  if (input.lowRateConsecutiveMinutes >= ENFORCEMENT.CALLER_AT_RISK_THRESHOLD_MINUTES) {
    return 'AT_RISK';
  }

  return 'ACTIVE';
}

export class PerformanceService {
  public constructor(private readonly prismaClient: PrismaClient) {}

  public async recalculateForCaller(callerId: string): Promise<void> {
    const now = clock.now();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);

    const [caller, callLogs, recentMetrics] = await Promise.all([
      this.prismaClient.caller.findUnique({ where: { id: callerId } }),
      this.prismaClient.callLog.findMany({
        where: {
          callerId,
          startedAt: {
            gte: oneHourAgo
          }
        }
      }),
      this.prismaClient.callerPerformanceMetric.findMany({
        where: {
          callerId,
          snapshotAt: {
            gte: tenMinutesAgo
          }
        },
        orderBy: {
          snapshotAt: 'desc'
        }
      })
    ]);

    if (!caller) {
      return;
    }

    const dials = callLogs.length;
    const connections = callLogs.filter((log) => Boolean(log.answeredAt)).length;
    const validConnections = callLogs.filter((log) => log.validated).length;
    const shortCalls = callLogs.filter(
      (log) => log.durationSeconds < ENFORCEMENT.MIN_CALL_DURATION_SECONDS
    ).length;

    const lowRateConsecutiveMinutes = recentMetrics.filter(
      (metric) => metric.rolling60MinuteDials < ENFORCEMENT.DIALS_PER_HOUR_TARGET
    ).length;
    const warmupActive =
      caller.allocationStatus === 'WARMUP_GRACE' &&
      now.getTime() - caller.createdAt.getTime() < ENFORCEMENT.CALLER_WARMUP_GRACE_MINUTES * 60 * 1000;
    const status = computeAllocationStatus({
      currentStatus: caller.allocationStatus,
      rolling60MinuteDials: dials,
      lowRateConsecutiveMinutes,
      warmupActive
    });
    await this.prismaClient.$transaction(async (transaction) => {
      await transaction.callerPerformanceMetric.create({
        data: {
          callerId,
          snapshotAt: now,
          rolling60MinuteDials: dials,
          rolling60MinuteConnections: connections,
          rolling60MinuteValidConnections: validConnections,
          shortCallsLastHour: shortCalls,
          graceModeActive: caller.allocationStatus === 'WARMUP_GRACE',
          warmupStartedAt: warmupActive ? caller.createdAt : null,
          allocationStatus: status,
          performanceScore: validConnections
        }
      });

      await transaction.caller.update({
        where: { id: callerId },
        data: {
          allocationStatus: status
        }
      });
    });
  }
}
