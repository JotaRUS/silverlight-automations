import type { Prisma, PrismaClient } from '@prisma/client';

import { ENFORCEMENT } from '../../config/constants';
import { EVENT_CATEGORIES } from '../../core/logging/observability';
import { clock } from '../../core/time/clock';
import type { YayWebhookEvent } from '../../integrations/yay/types';

function parseOptionalDate(value?: string): Date | undefined {
  if (!value) {
    return undefined;
  }
  return new Date(value);
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export class YayEventProcessor {
  public constructor(private readonly prismaClient: PrismaClient) {}

  public async process(event: YayWebhookEvent, correlationId?: string): Promise<void> {
    await this.prismaClient.$transaction(async (transaction) => {
      const metadata = event.data.call_metadata;
      if (!metadata) {
        await transaction.systemEvent.create({
          data: {
            category: 'WEBHOOK',
            entityType: 'call',
            entityId: event.data.call_id,
            correlationId,
            message: 'orphan_yay_event_missing_metadata',
            payload: toJsonValue(event)
          }
        });
        return;
      }

      const commonCallLogData = {
        callTaskId: metadata.call_task_id,
        projectId: metadata.project_id,
        expertId: metadata.expert_id,
        callerId: metadata.caller_id,
        dialedNumber: event.data.to.number,
        metadata: toJsonValue(event),
        terminationReason: event.data.termination.reason,
        sipCode: event.data.termination.sip_code,
        ringDurationSeconds: event.data.timing.ring_duration_seconds,
        billableSeconds: event.data.timing.billable_seconds
      };

      await transaction.callLog.upsert({
        where: { callId: event.data.call_id },
        create: {
          callId: event.data.call_id,
          ...commonCallLogData,
          startedAt: parseOptionalDate(event.data.timing.initiated_at),
          answeredAt: parseOptionalDate(event.data.timing.answered_at),
          endedAt: parseOptionalDate(event.data.timing.ended_at),
          durationSeconds: event.data.timing.duration_seconds,
          recordingUrl: event.data.recording?.recording_url
        },
        update: {
          ...commonCallLogData,
          startedAt: parseOptionalDate(event.data.timing.initiated_at),
          answeredAt: parseOptionalDate(event.data.timing.answered_at),
          endedAt: parseOptionalDate(event.data.timing.ended_at),
          durationSeconds: event.data.timing.duration_seconds,
          recordingUrl: event.data.recording?.recording_url
        }
      });

      await transaction.callLogRaw.update({
        where: { eventId: event.event_id },
        data: { processed: true }
      });

      const [caller, expert] = await Promise.all([
        transaction.caller.findUnique({
          where: { id: metadata.caller_id }
        }),
        transaction.expert.findUnique({
          where: { id: metadata.expert_id }
        })
      ]);

      switch (event.event_type) {
        case 'call.started':
          await transaction.callTask.update({
            where: { id: metadata.call_task_id },
            data: {
              status: 'DIALING',
              assignedAt: clock.now(),
              attemptedDialCount: {
                increment: 1
              }
            }
          });
          break;
        case 'call.answered':
          await transaction.callTask.update({
            where: { id: metadata.call_task_id },
            data: {
              status: 'DIALING'
            }
          });
          break;
        case 'call.ended': {
          const isValidDuration =
            event.data.timing.duration_seconds >= ENFORCEMENT.MIN_CALL_DURATION_SECONDS;
          const timezoneMismatch = Boolean(
            caller?.timezone && expert?.timezone && caller.timezone !== expert.timezone
          );
          const isFraud = !isValidDuration || timezoneMismatch;

          await transaction.callLog.update({
            where: { callId: event.data.call_id },
            data: {
              validated: isValidDuration,
              fraudFlag: isFraud
            }
          });

          if (isFraud) {
            const tenMinutesAgo = new Date(clock.now().getTime() - 10 * 60 * 1000);
            const recentShortCalls = await transaction.callLog.count({
              where: {
                callerId: metadata.caller_id,
                createdAt: {
                  gte: tenMinutesAgo
                },
                OR: [
                  {
                    durationSeconds: {
                      lt: ENFORCEMENT.MIN_CALL_DURATION_SECONDS
                    }
                  },
                  {
                    fraudFlag: true
                  }
                ]
              }
            });

            const shouldSuspend = recentShortCalls >= 3;
            await transaction.callTask.update({
              where: { id: metadata.call_task_id },
              data: {
                status: 'PENDING',
                callerId: null
              }
            });

            await transaction.caller.update({
              where: { id: metadata.caller_id },
              data: {
                allocationStatus: shouldSuspend ? 'SUSPENDED' : 'RESTRICTED_FRAUD',
                fraudStatus: shouldSuspend ? 'SUSPENDED' : 'RESTRICTED'
              }
            });

            await transaction.systemEvent.create({
              data: {
                category: EVENT_CATEGORIES.FRAUD,
                entityType: 'caller',
                entityId: metadata.caller_id,
                correlationId,
                message: 'short_call_detected_restriction_applied',
                payload: toJsonValue({
                  callId: event.data.call_id,
                  durationSeconds: event.data.timing.duration_seconds,
                  timezoneMismatch,
                  recentShortCalls,
                  enforcement: shouldSuspend ? 'suspended' : 'restricted'
                })
              }
            });
          } else {
            await transaction.callTask.update({
              where: { id: metadata.call_task_id },
              data: {
                status: 'COMPLETED'
              }
            });
          }
          break;
        }
        case 'call.failed':
          await transaction.callTask.update({
            where: { id: metadata.call_task_id },
            data: {
              status: 'PENDING',
              callerId: null
            }
          });
          break;
        case 'call.recording_ready':
          await transaction.callLog.update({
            where: { callId: event.data.call_id },
            data: {
              recordingUrl: event.data.recording?.recording_url
            }
          });
          break;
        case 'call.ringing':
          break;
        default:
          break;
      }

      await transaction.processedWebhookEvent.update({
        where: { eventId: event.event_id },
        data: {
          status: 'processed',
          processedAt: clock.now()
        }
      });
    });
  }
}
