import type { NotificationSeverity, Prisma } from '@prisma/client';

import { prisma } from '../../db/client';
import { publishRealtimeEvent } from '../../core/realtime/realtimePubSub';
import { logger } from '../../core/logging/logger';

interface NotificationInput {
  type: string;
  severity: NotificationSeverity;
  title: string;
  message: string;
  projectId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Fire-and-forget notification emitter safe to call from any module.
 * Persists to DB and pushes a realtime event to connected admin clients.
 */
export function emitNotification(input: NotificationInput): void {
  prisma.notification
    .create({
      data: {
        type: input.type,
        severity: input.severity,
        title: input.title,
        message: input.message,
        projectId: input.projectId,
        metadata: (input.metadata as Prisma.InputJsonValue) ?? undefined
      }
    })
    .then((notification) =>
      publishRealtimeEvent({
        namespace: 'admin',
        event: 'notification.created',
        data: notification
      })
    )
    .catch((err) => {
      logger.warn({ err, notificationType: input.type }, 'emit-notification-failed');
    });
}
