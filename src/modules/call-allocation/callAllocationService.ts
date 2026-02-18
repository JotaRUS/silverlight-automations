import type { CallTask, Caller, PrismaClient } from '@prisma/client';

import { AppError } from '../../core/errors/appError';
import { assertValidTransition, type TransitionMap } from '../../core/state-machine/assertValidTransition';
import { clock } from '../../core/time/clock';
import { withSerializableTransaction } from '../../db/transactions/withSerializableTransaction';

const callTaskTransitions: TransitionMap<
  'PENDING' | 'ASSIGNED' | 'DIALING' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED' | 'RESTRICTED'
> = {
  PENDING: ['ASSIGNED', 'CANCELLED', 'EXPIRED'],
  ASSIGNED: ['DIALING', 'CANCELLED', 'EXPIRED'],
  DIALING: ['COMPLETED', 'CANCELLED', 'RESTRICTED'],
  COMPLETED: [],
  CANCELLED: [],
  EXPIRED: [],
  RESTRICTED: []
};

export class CallAllocationService {
  public constructor(private readonly prismaClient: PrismaClient) {}

  private async getCallerOrThrow(callerId: string): Promise<Caller> {
    const caller = await this.prismaClient.caller.findUnique({
      where: { id: callerId }
    });
    if (!caller) {
      throw new AppError('Caller not found', 404, 'caller_not_found');
    }
    return caller;
  }

  public async fetchOrAssignCurrentTask(callerId: string): Promise<CallTask | null> {
    const caller = await this.getCallerOrThrow(callerId);
    if (!['ACTIVE', 'WARMUP_GRACE', 'AT_RISK'].includes(caller.allocationStatus)) {
      return null;
    }

    return withSerializableTransaction(this.prismaClient, async (tx) => {
      const existingAssignedTask = await tx.callTask.findFirst({
        where: {
          callerId,
          status: {
            in: ['ASSIGNED', 'DIALING']
          }
        },
        orderBy: {
          updatedAt: 'desc'
        }
      });
      if (existingAssignedTask) {
        return existingAssignedTask;
      }

      const task = await tx.callTask.findFirst({
        where: {
          status: 'PENDING',
          expert: {
            countryIso: {
              in: caller.regionIsoCodes
            },
            languageCodes: {
              hasSome: caller.languageCodes
            },
            OR: [
              {
                timezone: caller.timezone
              },
              {
                timezone: null
              }
            ]
          },
          AND: [
            {
              OR: [
                {
                  executionWindowEndsAt: null
                },
                {
                  executionWindowEndsAt: {
                    gte: clock.now()
                  }
                }
              ]
            }
          ],
          OR: [
            {
              executionWindowStartsAt: null
            },
            {
              executionWindowStartsAt: {
                lte: clock.now()
              }
            }
          ]
        },
        orderBy: [{ priorityScore: 'desc' }, { createdAt: 'asc' }]
      });
      if (!task) {
        await tx.caller.update({
          where: { id: callerId },
          data: {
            allocationStatus: 'IDLE_NO_AVAILABLE_TASKS'
          }
        });
        return null;
      }

      assertValidTransition(callTaskTransitions, task.status, 'ASSIGNED');
      return tx.callTask.update({
        where: { id: task.id },
        data: {
          status: 'ASSIGNED',
          callerId,
          assignedAt: clock.now(),
          executionWindowStartsAt: clock.now(),
          executionWindowEndsAt: new Date(clock.now().getTime() + 15 * 60 * 1000)
        }
      });
    });
  }

  public async listOperatorTasks(input?: {
    status?: 'PENDING' | 'ASSIGNED' | 'DIALING' | 'COMPLETED';
    projectId?: string;
    limit?: number;
  }): Promise<CallTask[]> {
    const limit = Math.min(input?.limit ?? 50, 100);
    return this.prismaClient.callTask.findMany({
      where: {
        status: input?.status,
        projectId: input?.projectId
      },
      orderBy: [{ priorityScore: 'desc' }, { createdAt: 'asc' }],
      take: limit
    });
  }

  public async requeueTaskByOperator(
    taskId: string,
    operatorUserId: string,
    reason?: string
  ): Promise<void> {
    const task = await this.prismaClient.callTask.findUnique({
      where: { id: taskId }
    });
    if (!task) {
      throw new AppError('Task not found', 404, 'call_task_not_found');
    }
    if (task.status === 'COMPLETED' || task.status === 'CANCELLED' || task.status === 'EXPIRED') {
      throw new AppError('Task cannot be requeued in current status', 400, 'call_task_requeue_invalid_status');
    }

    await this.prismaClient.$transaction(async (transaction) => {
      if (task.status === 'ASSIGNED' || task.status === 'DIALING') {
        assertValidTransition(callTaskTransitions, task.status, 'CANCELLED');
        await transaction.callTask.update({
          where: { id: task.id },
          data: {
            status: 'CANCELLED',
            metadata: {
              ...(task.metadata as Record<string, unknown> | undefined),
              operatorRequeue: {
                operatorUserId,
                reason: reason ?? null,
                timestamp: clock.now().toISOString()
              }
            }
          }
        });

        await transaction.callTask.create({
          data: {
            projectId: task.projectId,
            expertId: task.expertId,
            status: 'PENDING',
            priorityScore: task.priorityScore,
            attemptedDialCount: task.attemptedDialCount,
            metadata: {
              requeuedFromTaskId: task.id,
              operatorUserId,
              reason: reason ?? null
            }
          }
        });
        return;
      }

      await transaction.callTask.update({
        where: { id: task.id },
        data: {
          status: 'PENDING',
          callerId: null,
          assignedAt: null,
          executionWindowStartsAt: null,
          executionWindowEndsAt: null,
          metadata: {
            ...(task.metadata as Record<string, unknown> | undefined),
            operatorRequeue: {
              operatorUserId,
              reason: reason ?? null,
              timestamp: clock.now().toISOString()
            }
          }
        }
      });
    });
  }

  public async submitCallOutcome(
    callerId: string,
    taskId: string,
    outcome: 'INTERESTED_SIGNUP_LINK_SENT' | 'RETRYABLE_REJECTION' | 'NEVER_CONTACT_AGAIN'
  ): Promise<void> {
    const task = await this.prismaClient.callTask.findUnique({
      where: { id: taskId }
    });
    if (task?.callerId !== callerId) {
      throw new AppError('Task not found for caller', 404, 'call_task_not_found');
    }

    assertValidTransition(callTaskTransitions, task.status, 'COMPLETED');

    await this.prismaClient.$transaction(async (transaction) => {
      await transaction.callTask.update({
        where: { id: task.id },
        data: {
          status: 'COMPLETED',
          callOutcome: outcome
        }
      });

      if (outcome === 'NEVER_CONTACT_AGAIN') {
        await transaction.expert.update({
          where: { id: task.expertId },
          data: {
            status: 'SUPPRESSED'
          }
        });
      } else if (outcome === 'RETRYABLE_REJECTION') {
        await transaction.callTask.create({
          data: {
            projectId: task.projectId,
            expertId: task.expertId,
            status: 'PENDING',
            priorityScore: task.priorityScore
          }
        });
      }
    });
  }
}
