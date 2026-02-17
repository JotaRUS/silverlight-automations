import type { PrismaClient } from '@prisma/client';

import { getRequestContext } from '../../core/http/requestContext';
import { clock } from '../../core/time/clock';
import { OutreachService } from '../outreach/outreachService';
import { ProjectCompletionService } from '../projects/projectCompletionService';

export interface DispatchScreeningInput {
  projectId: string;
  expertId: string;
}

export interface RecordScreeningResponseInput {
  projectId: string;
  expertId: string;
  questionId: string;
  responseText: string;
}

export class ScreeningService {
  private readonly outreachService: OutreachService;
  private readonly projectCompletionService: ProjectCompletionService;

  public constructor(private readonly prismaClient: PrismaClient) {
    this.outreachService = new OutreachService(prismaClient);
    this.projectCompletionService = new ProjectCompletionService(prismaClient);
  }

  public async dispatchScreening(input: DispatchScreeningInput): Promise<number> {
    const [questions, expert] = await Promise.all([
      this.prismaClient.screeningQuestion.findMany({
        where: {
          projectId: input.projectId
        },
        orderBy: { displayOrder: 'asc' }
      }),
      this.prismaClient.expert.findUnique({
        where: { id: input.expertId }
      })
    ]);

    if (!expert?.preferredChannel) {
      return 0;
    }

    let sentCount = 0;
    for (const question of questions) {
      const existingResponse = await this.prismaClient.screeningResponse.findFirst({
        where: {
          projectId: input.projectId,
          questionId: question.id,
          expertId: input.expertId
        }
      });

      if (!existingResponse) {
        await this.prismaClient.screeningResponse.create({
          data: {
            projectId: input.projectId,
            questionId: question.id,
            expertId: input.expertId,
            channel: expert.preferredChannel,
            status: 'PENDING'
          }
        });
      }

      const recipientContact = await this.prismaClient.expertContact.findFirst({
        where: {
          expertId: input.expertId,
          deletedAt: null,
          type: expert.preferredChannel === 'EMAIL' ? 'EMAIL' : 'PHONE'
        },
        orderBy: { isPrimary: 'desc' }
      });
      if (!recipientContact) {
        continue;
      }

      await this.outreachService.sendMessage({
        projectId: input.projectId,
        expertId: input.expertId,
        channel: expert.preferredChannel,
        recipient: recipientContact.value,
        body: `Screening question ${String(question.displayOrder)}: ${question.prompt}`,
        overrideCooldown: true
      });
      sentCount += 1;
    }

    return sentCount;
  }

  public async recordResponse(input: RecordScreeningResponseInput): Promise<void> {
    await this.prismaClient.screeningResponse.updateMany({
      where: {
        projectId: input.projectId,
        questionId: input.questionId,
        expertId: input.expertId
      },
      data: {
        responseText: input.responseText,
        status: 'COMPLETE',
        submittedAt: clock.now()
      }
    });

    const pendingCount = await this.prismaClient.screeningResponse.count({
      where: {
        projectId: input.projectId,
        expertId: input.expertId,
        status: {
          in: ['PENDING', 'IN_PROGRESS']
        }
      }
    });

    if (pendingCount === 0) {
      await this.prismaClient.systemEvent.create({
        data: {
          category: 'JOB',
          entityType: 'screening',
          entityId: input.expertId,
          correlationId: getRequestContext()?.correlationId,
          message: 'screening_complete_for_expert'
        }
      });
    }

    await this.projectCompletionService.recalculate(input.projectId);
  }

  public async processFollowUp(projectId: string, expertId: string): Promise<void> {
    const pendingResponses = await this.prismaClient.screeningResponse.findMany({
      where: {
        projectId,
        expertId,
        status: {
          in: ['PENDING', 'IN_PROGRESS']
        }
      },
      include: {
        question: true
      }
    });
    if (!pendingResponses.length) {
      return;
    }

    const expert = await this.prismaClient.expert.findUnique({
      where: { id: expertId }
    });
    if (!expert?.preferredChannel) {
      return;
    }

    const contact = await this.prismaClient.expertContact.findFirst({
      where: {
        expertId,
        type: expert.preferredChannel === 'EMAIL' ? 'EMAIL' : 'PHONE',
        deletedAt: null
      },
      orderBy: { isPrimary: 'desc' }
    });
    if (!contact) {
      return;
    }

    const questionList = pendingResponses.map((response) => response.question.prompt).join('\n');
    await this.outreachService.sendMessage({
      projectId,
      expertId,
      channel: expert.preferredChannel,
      recipient: contact.value,
      body: `Reminder: please complete screening responses:\n${questionList}`,
      overrideCooldown: true
    });

    await this.prismaClient.screeningResponse.updateMany({
      where: {
        projectId,
        expertId,
        status: {
          in: ['PENDING', 'IN_PROGRESS']
        }
      },
      data: {
        status: 'IN_PROGRESS'
      }
    });
  }
}
