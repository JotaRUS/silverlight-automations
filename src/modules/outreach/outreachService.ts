import type { Channel, PrismaClient } from '@prisma/client';

import { normalizeChannel } from '../../config/channels';
import { AppError } from '../../core/errors/appError';
import { getRequestContext } from '../../core/http/requestContext';
import { logger } from '../../core/logging/logger';
import { publishRealtimeEvent } from '../../core/realtime/realtimePubSub';
import { clock } from '../../core/time/clock';
import { MessagingClient } from '../../integrations/messaging/messagingClient';
import { CooldownService } from '../cooldown/cooldownService';
import { ProjectCompletionService } from '../projects/projectCompletionService';
import { isChannelAvailableForProject, selectEmailsForOutreach, type CandidateEmail } from './channelSelection';

export interface SendOutreachMessageInput {
  projectId: string;
  expertId: string;
  channel: Channel;
  recipient: string;
  body?: string;
  overrideCooldown: boolean;
}

export interface HandleInboundReplyInput {
  threadId: string;
  channel: Channel;
  body: string;
  providerMessageId?: string;
}

export interface HandleInboundReplyResult {
  messageId: string;
  threadId: string;
  expertId: string;
  preferredChannelUpdated: boolean;
}

function composeOutreachBody(isExistingNetworkExpert: boolean): string {
  if (isExistingNetworkExpert) {
    return (
      'We have a new project that matches your expertise and would love to invite you to participate. ' +
      'Please let us know if you are interested and available.'
    );
  }
  return (
    "We'd like to invite you to join our expert network. " +
    'Based on your background, we believe you could be a great fit for upcoming projects. ' +
    'Please let us know if you are interested.'
  );
}

export class OutreachService {
  private readonly cooldownService: CooldownService;
  private readonly messagingClient: MessagingClient;

  public constructor(private readonly prismaClient: PrismaClient) {
    this.cooldownService = new CooldownService(prismaClient);
    this.messagingClient = new MessagingClient();
  }

  /**
   * Returns true when the expert already has outreach threads from projects
   * other than the given one, indicating they are part of the network.
   */
  private async checkIsExistingNetworkExpert(expertId: string, currentProjectId: string): Promise<boolean> {
    const otherProjectThread = await this.prismaClient.outreachThread.findFirst({
      where: {
        expertId,
        projectId: { not: currentProjectId }
      },
      select: { id: true }
    });
    return otherProjectThread !== null;
  }

  /**
   * When the channel is EMAIL, applies region-based filtering to pick
   * an eligible recipient address. Falls back to the originally provided
   * recipient when filtering is not applicable.
   */
  private async resolveEmailRecipient(expertId: string, providedRecipient: string): Promise<string> {
    const expert = await this.prismaClient.expert.findUnique({
      where: { id: expertId },
      select: { countryIso: true }
    });

    if (!expert?.countryIso) {
      return providedRecipient;
    }

    const emailContacts = await this.prismaClient.expertContact.findMany({
      where: {
        expertId,
        type: 'EMAIL',
        deletedAt: null
      },
      orderBy: { isPrimary: 'desc' }
    });

    if (emailContacts.length === 0) {
      return providedRecipient;
    }

    const candidateEmails: CandidateEmail[] = emailContacts.map((contact) => ({
      value: contact.value,
      label: contact.label === 'PROFESSIONAL' ? 'professional' : 'personal'
    }));

    const eligible = selectEmailsForOutreach(expert.countryIso, candidateEmails);

    if (eligible.length === 0) {
      throw new AppError(
        'No eligible email address for this region after applying professional-email filter',
        422,
        'no_eligible_email'
      );
    }

    const providedStillEligible = eligible.find((e) => e.value === providedRecipient);
    return providedStillEligible ? providedRecipient : eligible[0].value;
  }

  /**
   * Resolves the effective channel for an outbound message. If the expert
   * has a preferredChannel (set when they replied on a channel) and the
   * project has a provider bound for that channel, use it instead of the
   * originally requested channel.
   */
  private async resolveEffectiveChannel(
    projectId: string,
    expertId: string,
    requestedChannel: Channel
  ): Promise<Channel> {
    const expert = await this.prismaClient.expert.findUnique({
      where: { id: expertId },
      select: { preferredChannel: true }
    });

    if (!expert?.preferredChannel || expert.preferredChannel === requestedChannel) {
      return requestedChannel;
    }

    const preferred = expert.preferredChannel;
    const available = await isChannelAvailableForProject(this.prismaClient, projectId, preferred);

    if (available) {
      logger.info(
        { expertId, projectId, requestedChannel, preferredChannel: preferred },
        'outreach-channel-overridden-by-preferred'
      );
      return preferred;
    }

    logger.info(
      { expertId, projectId, preferredChannel: preferred, fallbackChannel: requestedChannel },
      'preferred-channel-unavailable-falling-back'
    );
    return requestedChannel;
  }

  public async sendMessage(input: SendOutreachMessageInput): Promise<{ threadId: string; messageId: string }> {
    const effectiveChannel = await this.resolveEffectiveChannel(
      input.projectId,
      input.expertId,
      input.channel
    );

    const cooldownResult = await this.cooldownService.check({
      projectId: input.projectId,
      expertId: input.expertId,
      channel: effectiveChannel,
      overrideCooldown: input.overrideCooldown,
      reason: 'outreach_message_attempt'
    });

    if (!cooldownResult.allowed) {
      throw new AppError('Cooldown active for expert', 409, 'cooldown_active', {
        expiresAt: cooldownResult.expiresAt.toISOString()
      });
    }

    const isExistingNetworkExpert = await this.checkIsExistingNetworkExpert(input.expertId, input.projectId);
    const body = input.body ?? composeOutreachBody(isExistingNetworkExpert);

    const recipient =
      effectiveChannel === 'EMAIL'
        ? await this.resolveEmailRecipient(input.expertId, input.recipient)
        : input.recipient;

    const existingThread = await this.prismaClient.outreachThread.findFirst({
      where: {
        projectId: input.projectId,
        expertId: input.expertId,
        channel: effectiveChannel
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
            channel: effectiveChannel,
            firstContactAt: clock.now(),
            lastMessageAt: clock.now(),
            replied: false
          }
        });

    const correlationId = getRequestContext()?.correlationId ?? 'system';
    const providerResult = await this.messagingClient.sendMessage({
      projectId: input.projectId,
      channel: normalizeChannel(effectiveChannel),
      recipient,
      body,
      correlationId
    });

    await this.cooldownService.enforce({
      projectId: input.projectId,
      expertId: input.expertId,
      channel: effectiveChannel,
      overrideCooldown: input.overrideCooldown,
      reason: 'outreach_message_sent'
    });

    const message = await this.prismaClient.outreachMessage.create({
      data: {
        threadId: thread.id,
        direction: 'OUTBOUND',
        status: 'SENT',
        body,
        providerMessageId: providerResult.providerMessageId,
        sentAt: clock.now(),
        metadata: { isExistingNetworkExpert }
      }
    });

    await publishRealtimeEvent({
      namespace: 'admin',
      event: 'outreach.thread.updated',
      data: {
        projectId: input.projectId,
        expertId: input.expertId,
        threadId: thread.id,
        channel: effectiveChannel
      }
    });

    return {
      threadId: thread.id,
      messageId: message.id
    };
  }

  /**
   * Handles an inbound reply from an expert. Records the message on the
   * thread, marks the thread as replied, sets the expert's preferredChannel
   * to the channel the reply arrived on, and advances associated leads
   * to REPLIED status.
   */
  public async handleInboundReply(input: HandleInboundReplyInput): Promise<HandleInboundReplyResult> {
    const thread = await this.prismaClient.outreachThread.findUnique({
      where: { id: input.threadId }
    });

    if (!thread) {
      throw new AppError('Outreach thread not found', 404, 'thread_not_found', {
        threadId: input.threadId
      });
    }

    const now = clock.now();

    const message = await this.prismaClient.outreachMessage.create({
      data: {
        threadId: thread.id,
        direction: 'INBOUND',
        status: 'RECEIVED',
        body: input.body,
        providerMessageId: input.providerMessageId ?? null,
        receivedAt: now
      }
    });

    await this.prismaClient.outreachThread.update({
      where: { id: thread.id },
      data: {
        replied: true,
        lastMessageAt: now
      }
    });

    const replyChannel = input.channel;
    let preferredChannelUpdated = false;

    const expert = await this.prismaClient.expert.findUnique({
      where: { id: thread.expertId },
      select: { id: true, preferredChannel: true }
    });

    if (expert && expert.preferredChannel !== replyChannel) {
      await this.prismaClient.expert.update({
        where: { id: expert.id },
        data: { preferredChannel: replyChannel }
      });
      preferredChannelUpdated = true;

      logger.info(
        {
          expertId: expert.id,
          previousChannel: expert.preferredChannel,
          newChannel: replyChannel,
          threadId: thread.id
        },
        'expert-preferred-channel-updated'
      );
    }

    await this.prismaClient.lead.updateMany({
      where: {
        expertId: thread.expertId,
        projectId: thread.projectId,
        status: { in: ['CONTACTED', 'OUTREACH_PENDING', 'ENRICHED'] }
      },
      data: { status: 'REPLIED' }
    });

    const completionService = new ProjectCompletionService(this.prismaClient);
    await completionService.recalculate(thread.projectId);

    await publishRealtimeEvent({
      namespace: 'admin',
      event: 'outreach.reply.received',
      data: {
        projectId: thread.projectId,
        expertId: thread.expertId,
        threadId: thread.id,
        channel: replyChannel,
        messageId: message.id
      }
    });

    return {
      messageId: message.id,
      threadId: thread.id,
      expertId: thread.expertId,
      preferredChannelUpdated
    };
  }
}
