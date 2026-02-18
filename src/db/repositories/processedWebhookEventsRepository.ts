import { createHash } from 'node:crypto';

import type { PrismaClient, ProcessedWebhookEvent } from '@prisma/client';

import { AppError } from '../../core/errors/appError';
import { clock } from '../../core/time/clock';

export interface WebhookProcessingRegistrationInput {
  eventId: string;
  payload: unknown;
}

export class ProcessedWebhookEventsRepository {
  public constructor(private readonly prismaClient: PrismaClient) {}

  public async registerEventIfNew(
    input: WebhookProcessingRegistrationInput
  ): Promise<ProcessedWebhookEvent> {
    const payloadHash = createHash('sha256').update(JSON.stringify(input.payload)).digest('hex');

    try {
      return await this.prismaClient.processedWebhookEvent.create({
        data: {
          eventId: input.eventId,
          hash: payloadHash,
          status: 'accepted'
        }
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new AppError('Duplicate webhook event', 409, 'duplicate_webhook_event', {
          eventId: input.eventId
        });
      }

      throw error;
    }
  }

  public async markProcessed(eventId: string, status: string): Promise<void> {
    await this.prismaClient.processedWebhookEvent.update({
      where: { eventId },
      data: {
        status,
        processedAt: clock.now()
      }
    });
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code: string }).code === 'P2002'
    );
  }
}
