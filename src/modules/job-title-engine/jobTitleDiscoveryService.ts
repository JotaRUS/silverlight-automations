import type { PrismaClient } from '@prisma/client';

import { ApolloClient } from '../../integrations/apollo/apolloClient';
import { OpenAiClient } from '../../integrations/openai/openAiClient';
import { deduplicateNormalizedTitles } from './titleNormalizer';
import type { JobTitleDiscoveryRequest } from './jobTitleDiscoverySchemas';
import { clock } from '../../core/time/clock';

interface JobTitleDiscoveryDependencies {
  prismaClient: PrismaClient;
  apolloClient: ApolloClient;
  openAiClient: OpenAiClient;
}

export class JobTitleDiscoveryService {
  public constructor(private readonly dependencies: JobTitleDiscoveryDependencies) {}

  public async discover(request: JobTitleDiscoveryRequest, correlationId: string): Promise<number> {
    let persistedCount = 0;

    for (const company of request.companies) {
      const collectedTitles: string[] = [];
      for (const geographyIsoCode of request.geographyIsoCodes) {
        const titles = await this.dependencies.apolloClient.fetchJobTitles({
          companyName: company.companyName,
          geographyIsoCode,
          correlationId
        });
        collectedTitles.push(...titles);
      }

      const normalizedSourceTitles = deduplicateNormalizedTitles(collectedTitles);
      const expandedTitles = await this.dependencies.openAiClient.expandAndScoreTitles({
        companyName: company.companyName,
        geographyIsoCode: request.geographyIsoCodes[0],
        sourceTitles: normalizedSourceTitles,
        correlationId
      });

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
            source: 'apollo+openai',
            aiDecisionLog: {
              reason: expandedTitle.reason,
              relevant: expandedTitle.relevant,
              relevanceScore: expandedTitle.relevanceScore,
              generatedAt: clock.now().toISOString(),
              sourceTitles: normalizedSourceTitles
            }
          },
          update: {
            relevanceScore: expandedTitle.relevanceScore,
            aiDecisionLog: {
              reason: expandedTitle.reason,
              relevant: expandedTitle.relevant,
              relevanceScore: expandedTitle.relevanceScore,
              generatedAt: clock.now().toISOString(),
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
            sourceTitleCount: normalizedSourceTitles.length
          }
        }
      });
    }

    return persistedCount;
  }
}
