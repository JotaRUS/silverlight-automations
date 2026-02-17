import type { CallLogRaw, PrismaClient } from '@prisma/client';

export interface StoreRawCallEventInput {
  eventId: string;
  eventType: string;
  accountId?: string;
  payload: unknown;
  correlationId?: string;
}

export class CallLogRawRepository {
  public constructor(private readonly prismaClient: PrismaClient) {}

  public async store(input: StoreRawCallEventInput): Promise<CallLogRaw> {
    return this.prismaClient.callLogRaw.create({
      data: {
        eventId: input.eventId,
        eventType: input.eventType,
        accountId: input.accountId,
        payload: input.payload as object,
        correlationId: input.correlationId
      }
    });
  }

  public async markProcessed(eventId: string): Promise<void> {
    await this.prismaClient.callLogRaw.update({
      where: { eventId },
      data: { processed: true }
    });
  }
}
