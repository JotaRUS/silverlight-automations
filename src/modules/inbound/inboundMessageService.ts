import type { Channel, ContactType, PrismaClient } from '@prisma/client';

import { logger } from '../../core/logging/logger';
import { normalizeEmail, normalizePhone } from '../enrichment/enrichmentValidators';
import { OutreachService } from '../outreach/outreachService';
import { ScreeningService } from '../screening/screeningService';

export interface InboundWebhookMessage {
  providerMessageId: string;
  senderAddress: string;
  contactType: ContactType;
  channel: Channel;
  body: string;
  providerAccountId: string;
  rawPayload: unknown;
}

export interface InboundProcessingResult {
  expertId: string;
  threadId: string;
  messageId: string;
  screeningResponseUpdated: boolean;
}

export class InboundMessageService {
  private readonly outreachService: OutreachService;
  private readonly screeningService: ScreeningService;

  public constructor(private readonly prismaClient: PrismaClient) {
    this.outreachService = new OutreachService(prismaClient);
    this.screeningService = new ScreeningService(prismaClient);
  }

  public async processInboundMessage(message: InboundWebhookMessage): Promise<InboundProcessingResult> {
    const normalized = this.normalizeSender(message.senderAddress, message.contactType);
    if (!normalized) {
      throw new InboundResolutionError(`Unable to normalize sender address: ${message.senderAddress}`);
    }

    const contact = await this.prismaClient.expertContact.findFirst({
      where: {
        type: message.contactType,
        valueNormalized: normalized,
        deletedAt: null
      }
    });

    if (!contact) {
      throw new InboundResolutionError(`No expert found for ${message.contactType} ${normalized}`);
    }

    const thread = await this.prismaClient.outreachThread.findFirst({
      where: {
        expertId: contact.expertId,
        channel: message.channel,
        deletedAt: null
      },
      orderBy: [
        { replied: 'asc' },
        { lastMessageAt: 'desc' }
      ]
    });

    if (!thread) {
      throw new InboundResolutionError(
        `No outreach thread found for expert ${contact.expertId} on channel ${message.channel}`
      );
    }

    logger.info(
      {
        expertId: contact.expertId,
        threadId: thread.id,
        channel: message.channel,
        providerMessageId: message.providerMessageId
      },
      'inbound-message-resolved'
    );

    const result = await this.outreachService.handleInboundReply({
      threadId: thread.id,
      channel: message.channel,
      body: message.body,
      providerMessageId: message.providerMessageId
    });

    const screeningUpdated = await this.tryMatchScreeningResponse(
      thread.projectId,
      contact.expertId,
      message.body
    );

    return {
      expertId: result.expertId,
      threadId: result.threadId,
      messageId: result.messageId,
      screeningResponseUpdated: screeningUpdated
    };
  }

  private normalizeSender(address: string, contactType: ContactType): string | null {
    switch (contactType) {
      case 'EMAIL':
        return normalizeEmail(address);
      case 'PHONE':
        return normalizePhone(address);
      default:
        return address.trim().toLowerCase() || null;
    }
  }

  private async tryMatchScreeningResponse(
    projectId: string,
    expertId: string,
    body: string
  ): Promise<boolean> {
    const pendingResponse = await this.prismaClient.screeningResponse.findFirst({
      where: {
        projectId,
        expertId,
        status: { in: ['PENDING', 'IN_PROGRESS'] }
      },
      include: { question: true },
      orderBy: { question: { displayOrder: 'asc' } }
    });

    if (!pendingResponse) {
      return false;
    }

    try {
      await this.screeningService.recordResponse({
        projectId,
        expertId,
        questionId: pendingResponse.questionId,
        responseText: body
      });

      logger.info(
        {
          projectId,
          expertId,
          questionId: pendingResponse.questionId,
          questionPrompt: pendingResponse.question.prompt
        },
        'screening-response-auto-matched'
      );
      return true;
    } catch (error) {
      logger.warn(
        { projectId, expertId, error },
        'screening-response-auto-match-failed'
      );
      return false;
    }
  }
}

export class InboundResolutionError extends Error {
  public readonly code = 'inbound_resolution_failed';

  public constructor(message: string) {
    super(message);
    this.name = 'InboundResolutionError';
  }
}
