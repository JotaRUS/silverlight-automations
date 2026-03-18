import type { PrismaClient } from '@prisma/client';

import { ApolloClient } from '../../integrations/apollo/apolloClient';
import { OpenAiClient, type OpenAiCredentials } from '../../integrations/openai/openAiClient';
import { ProviderAccountsService } from '../providers/providerAccountsService';
import { deduplicateNormalizedTitles } from './titleNormalizer';
import type { JobTitleDiscoveryRequest } from './jobTitleDiscoverySchemas';
import { clock } from '../../core/time/clock';
import { AppError } from '../../core/errors/appError';

interface JobTitleDiscoveryDependencies {
  prismaClient: PrismaClient;
  apolloClient: ApolloClient;
  openAiClient: OpenAiClient;
}

export class JobTitleDiscoveryService {
  private readonly providerAccountsService: ProviderAccountsService;

  public constructor(private readonly dependencies: JobTitleDiscoveryDependencies) {
    this.providerAccountsService = new ProviderAccountsService(dependencies.prismaClient);
  }

  private async resolveProjectContext(projectId: string): Promise<{
    projectName: string;
    openAiCredentials: OpenAiCredentials;
  }> {
    const project = await this.dependencies.prismaClient.project.findUnique({
      where: { id: projectId },
      select: { name: true, openaiProviderAccountId: true }
    });

    if (!project?.openaiProviderAccountId) {
      throw new AppError(
        'No OpenAI provider bound to this project. Add an OpenAI provider account and bind it to the project.',
        400,
        'openai_provider_not_bound'
      );
    }

    const credentials = await this.providerAccountsService.getDecryptedCredentials(
      project.openaiProviderAccountId,
      'OPENAI'
    );

    return {
      projectName: project.name,
      openAiCredentials: {
        apiKey: typeof credentials.apiKey === 'string' ? credentials.apiKey : '',
        model: typeof credentials.model === 'string' ? credentials.model : 'gpt-4o-mini',
        classificationTemperature: typeof credentials.classificationTemperature === 'number'
          ? credentials.classificationTemperature
          : 0.2
      }
    };
  }

  public async discover(request: JobTitleDiscoveryRequest, correlationId: string): Promise<number> {
    const { projectName, openAiCredentials } = await this.resolveProjectContext(request.projectId);
    let persistedCount = 0;

    for (const company of request.companies) {
      const collectedTitles: string[] = [];
      for (const geographyIsoCode of request.geographyIsoCodes) {
        try {
          const titles = await this.dependencies.apolloClient.fetchJobTitles({
            projectId: request.projectId,
            companyName: company.companyName,
            geographyIsoCode,
            correlationId
          });
          collectedTitles.push(...titles);
        } catch (error) {
          await this.dependencies.prismaClient.systemEvent.create({
            data: {
              category: 'JOB',
              entityType: 'job_title_discovery',
              entityId: request.projectId,
              correlationId,
              message: 'job_title_discovery_apollo_titles_failed',
              payload: {
                companyName: company.companyName,
                geographyIsoCode,
                error: error instanceof Error ? error.message : 'unknown error'
              }
            }
          });
        }
      }

      const normalizedSourceTitles = deduplicateNormalizedTitles(collectedTitles);
      const expandedTitles = await this.dependencies.openAiClient.expandAndScoreTitles(
        {
          projectName,
          companyName: company.companyName,
          geographyIsoCode: request.geographyIsoCodes[0],
          sourceTitles: normalizedSourceTitles,
          correlationId
        },
        openAiCredentials
      );

      for (const expandedTitle of expandedTitles) {
        if (!expandedTitle.relevant) {
          continue;
        }

        await this.dependencies.prismaClient.jobTitle.upsert({
          where: {
            projectId_titleNormalized: {
              projectId: request.projectId,
              titleNormalized: expandedTitle.title.toLowerCase()
            }
          },
          create: {
            projectId: request.projectId,
            companyId: company.companyId,
            titleOriginal: expandedTitle.title,
            titleNormalized: expandedTitle.title.toLowerCase(),
            relevanceScore: expandedTitle.relevanceScore,
            source: normalizedSourceTitles.length > 0 ? 'apollo+openai' : 'openai_project_inference',
            aiDecisionLog: {
              reason: expandedTitle.reason,
              relevant: expandedTitle.relevant,
              relevanceScore: expandedTitle.relevanceScore,
              generatedAt: clock.now().toISOString(),
              projectName,
              sourceTitles: normalizedSourceTitles
            }
          },
          update: {
            relevanceScore: expandedTitle.relevanceScore,
            source: normalizedSourceTitles.length > 0 ? 'apollo+openai' : 'openai_project_inference',
            aiDecisionLog: {
              reason: expandedTitle.reason,
              relevant: expandedTitle.relevant,
              relevanceScore: expandedTitle.relevanceScore,
              generatedAt: clock.now().toISOString(),
              projectName,
              sourceTitles: normalizedSourceTitles
            }
          }
        });
        persistedCount += 1;
      }

      await this.dependencies.prismaClient.systemEvent.create({
        data: {
          category: 'JOB',
          entityType: 'job_title_discovery',
          entityId: request.projectId,
          correlationId,
          message: 'job_title_discovery_completed_for_company',
          payload: {
            companyName: company.companyName,
            persistedCount,
            sourceTitleCount: normalizedSourceTitles.length,
            inferenceMode: normalizedSourceTitles.length > 0 ? 'apollo_supported' : 'openai_only'
          }
        }
      });
    }

    return persistedCount;
  }
}
