import type { Channel, PrismaClient } from '@prisma/client';

import { normalizeChannel } from '../../config/channels';
import { AppError } from '../../core/errors/appError';
import { getRequestContext } from '../../core/http/requestContext';
import { clock } from '../../core/time/clock';
import { MessagingClient } from '../../integrations/messaging/messagingClient';
import { CooldownService } from '../cooldown/cooldownService';

export interface SendOutreachMessageInput {
  projectId: string;
  expertId: string;
  channel: Channel;
  recipient: string;
  body: string;
  overrideCooldown: boolean;
}

export class OutreachService {
  private readonly cooldownService: CooldownService;
  private readonly messagingClient: MessagingClient;

  public constructor(private readonly prismaClient: PrismaClient) {
    this.cooldownService = new CooldownService(prismaClient);
    this.messagingClient = new MessagingClient();
  }

  public async sendMessage(input: SendOutreachMessageInput): Promise<{ threadId: string; messageId: string }> {
    const cooldownResult = await this.cooldownService.checkAndLog({
      projectId: input.projectId,
      expertId: input.expertId,
      channel: input.channel,
      overrideCooldown: input.overrideCooldown,
      reason: 'outreach_message_attempt'
    });

    if (!cooldownResult.allowed) {
      throw new AppError('Cooldown active for expert', 409, 'cooldown_active', {
        expiresAt: cooldownResult.expiresAt.toISOString()
      });
    }

    const existingThread = await this.prismaClient.outreachThread.findFirst({
      where: {
        projectId: input.projectId,
        expertId: input.expertId,
        channel: input.channel
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    const thread = existingThread
      ? await this.prismaClient.outreachThread.update({
          where: { id: existingThread.id },
          data: {
            lastMessageAt: clock.now()
          }
        })
      : await this.prismaClient.outreachThread.create({
          data: {
            projectId: input.projectId,
            expertId: input.expertId,
            channel: input.channel,
            firstContactAt: clock.now(),
            lastMessageAt: clock.now(),
            replied: false
          }
        });

    const correlationId = getRequestContext()?.correlationId ?? 'system';
    const providerResult = await this.messagingClient.sendMessage({
      channel: normalizeChannel(input.channel),
      recipient: input.recipient,
      body: input.body,
      correlationId
    });

    const message = await this.prismaClient.outreachMessage.create({
      data: {
        threadId: thread.id,
        direction: 'OUTBOUND',
        status: 'SENT',
        body: input.body,
        providerMessageId: providerResult.providerMessageId,
        sentAt: clock.now()
      }
    });

    return {
      threadId: thread.id,
      messageId: message.id
    };
  }
}
