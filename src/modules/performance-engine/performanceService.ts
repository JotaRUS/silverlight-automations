import type { CallerAllocationStatus, PrismaClient } from '@prisma/client';

import { ENFORCEMENT } from '../../config/constants';
import { clock } from '../../core/time/clock';

export class PerformanceService {
  public constructor(private readonly prismaClient: PrismaClient) {}

  private determineStatus(
    dialsPerHour: number,
    currentStatus: CallerAllocationStatus
  ): CallerAllocationStatus {
    if (currentStatus === 'RESTRICTED_FRAUD' || currentStatus === 'SUSPENDED') {
      return currentStatus;
    }
    if (dialsPerHour >= ENFORCEMENT.DIALS_PER_HOUR_TARGET) {
      return 'ACTIVE';
    }
    return 'PAUSED_LOW_DIAL_RATE';
  }

  public async recalculateForCaller(callerId: string): Promise<void> {
    const now = clock.now();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const [caller, callLogs] = await Promise.all([
      this.prismaClient.caller.findUnique({ where: { id: callerId } }),
      this.prismaClient.callLog.findMany({
        where: {
          callerId,
          startedAt: {
            gte: oneHourAgo
          }
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

    const status = this.determineStatus(dials, caller.allocationStatus);
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
