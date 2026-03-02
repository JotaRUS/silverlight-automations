import type { NotificationSeverity, Prisma, PrismaClient } from '@prisma/client';

import { publishRealtimeEvent } from '../../core/realtime/realtimePubSub';
import { logger } from '../../core/logging/logger';

export interface CreateNotificationInput {
  type: string;
  severity: NotificationSeverity;
  title: string;
  message: string;
  projectId?: string;
  metadata?: Record<string, unknown>;
}

export class NotificationService {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateNotificationInput) {
    const notification = await this.prisma.notification.create({
      data: {
        type: input.type,
        severity: input.severity,
        title: input.title,
        message: input.message,
        projectId: input.projectId,
        metadata: (input.metadata as Prisma.InputJsonValue) ?? undefined
      }
    });

    publishRealtimeEvent({
      namespace: 'admin',
      event: 'notification.created',
      data: notification
    }).catch((err) => {
      logger.warn({ err }, 'failed to publish notification realtime event');
    });

    return notification;
  }

  async list(options: { unreadOnly?: boolean; limit?: number; offset?: number } = {}) {
    const { unreadOnly = false, limit = 50, offset = 0 } = options;
    return this.prisma.notification.findMany({
      where: unreadOnly ? { readAt: null } : undefined,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset
    });
  }

  async unreadCount(): Promise<number> {
    return this.prisma.notification.count({ where: { readAt: null } });
  }

  async markRead(ids: string[]) {
    return this.prisma.notification.updateMany({
      where: { id: { in: ids }, readAt: null },
      data: { readAt: new Date() }
    });
  }

  async markAllRead() {
    return this.prisma.notification.updateMany({
      where: { readAt: null },
      data: { readAt: new Date() }
    });
  }
}
