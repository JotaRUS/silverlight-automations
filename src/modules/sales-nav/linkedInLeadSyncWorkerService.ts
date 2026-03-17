import type { Prisma, PrismaClient } from '@prisma/client';
import type { Logger } from 'pino';

type JobLogger = ReturnType<Logger['child']>;

import type { LinkedInFetchResponseJob } from '../../queues/definitions/jobPayloadSchemas';
import { getQueues } from '../../queues';
import { buildJobId } from '../../queues/jobId';
import { enqueueWithContext } from '../../queues/producers/enqueueWithContext';
import { getLinkedInOAuthToken } from '../../integrations/sales-nav/salesNavOAuthClient';
import {
  getLeadFormResponse,
  getLeadForm
} from '../../integrations/sales-nav/linkedInLeadSyncClient';
import {
  buildQuestionFieldMap,
  extractFormIdFromUrn,
  mapLeadFormResponseToLead
} from './linkedInResponseMapper';
interface SalesNavSyncMetadata {
  webhookSubscriptionId?: string;
  lastResponsePolledAt?: string;
  syncedLeadFormIds?: string[];
  processedResponseIds?: string[];
  leadFormCache?: Record<string, {
    name: string;
    questionFieldMap: Record<string, string>;
    cachedAt: string;
  }>;
}

const MAX_PROCESSED_IDS = 500;

export class LinkedInLeadSyncWorkerService {
  public constructor(private readonly prismaClient: PrismaClient) {}

  public async fetchAndIngestResponse(
    payload: LinkedInFetchResponseJob,
    jobLogger: JobLogger
  ): Promise<void> {
    const { token } = await getLinkedInOAuthToken(payload.providerAccountId, this.prismaClient);

    const response = await getLeadFormResponse(token, payload.responseId);

    if (response.testLead) {
      jobLogger.info({ responseId: payload.responseId }, 'linkedin-lead-sync-skipped-test-lead');
      return;
    }

    const formId = this.resolveFormId(response.versionedLeadGenFormUrn, payload.formUrn);
    const questionFieldMap = await this.getOrFetchQuestionFieldMap(
      payload.providerAccountId,
      formId,
      token
    );

    const lead = mapLeadFormResponseToLead(response, questionFieldMap);

    const projectId = payload.projectId ?? await this.findBoundProjectId(payload.providerAccountId);
    if (!projectId) {
      jobLogger.warn(
        { providerAccountId: payload.providerAccountId },
        'linkedin-lead-sync-no-bound-project'
      );
      return;
    }

    await enqueueWithContext(
      getQueues().leadIngestionQueue,
      'lead-ingestion.ingest',
      {
        projectId,
        source: 'sales_nav',
        lead
      },
      {
        jobId: buildJobId('lead-ingestion', projectId, 'li-response', payload.responseId)
      }
    );

    await this.recordProcessedResponse(payload.providerAccountId, payload.responseId);

    jobLogger.info(
      { responseId: payload.responseId, projectId, leadName: lead.fullName },
      'linkedin-lead-sync-ingested'
    );
  }

  private resolveFormId(
    versionedFormUrn: string | undefined,
    formUrnFallback: string | undefined
  ): string | undefined {
    if (versionedFormUrn) {
      return extractFormIdFromUrn(versionedFormUrn);
    }
    if (formUrnFallback) {
      return extractFormIdFromUrn(formUrnFallback);
    }
    return undefined;
  }

  private async getOrFetchQuestionFieldMap(
    providerAccountId: string,
    formId: string | undefined,
    token: string
  ): Promise<Record<string, string>> {
    if (!formId) {
      return {};
    }

    const account = await this.prismaClient.providerAccount.findUniqueOrThrow({
      where: { id: providerAccountId }
    });

    const syncMeta = (account.syncMetadata as SalesNavSyncMetadata | null) ?? {};
    const cached = syncMeta.leadFormCache?.[formId];

    const cacheAge = cached ? Date.now() - new Date(cached.cachedAt).getTime() : Infinity;
    if (cached && cacheAge < 24 * 60 * 60 * 1000) {
      return cached.questionFieldMap;
    }

    const form = await getLeadForm(token, formId);
    const questionFieldMap = buildQuestionFieldMap(form);

    const updatedCache = {
      ...(syncMeta.leadFormCache ?? {}),
      [formId]: {
        name: form.name,
        questionFieldMap,
        cachedAt: new Date().toISOString()
      }
    };

    await this.prismaClient.providerAccount.update({
      where: { id: providerAccountId },
      data: {
        syncMetadata: {
          ...syncMeta,
          leadFormCache: updatedCache
        } as Prisma.InputJsonValue
      }
    });

    return questionFieldMap;
  }

  private async findBoundProjectId(providerAccountId: string): Promise<string | undefined> {
    const project = await this.prismaClient.project.findFirst({
      where: {
        salesNavWebhookProviderAccountId: providerAccountId,
        status: 'ACTIVE'
      },
      select: { id: true }
    });
    return project?.id;
  }

  private async recordProcessedResponse(
    providerAccountId: string,
    responseId: string
  ): Promise<void> {
    const account = await this.prismaClient.providerAccount.findUniqueOrThrow({
      where: { id: providerAccountId }
    });

    const syncMeta = (account.syncMetadata as SalesNavSyncMetadata | null) ?? {};
    const processed = [...(syncMeta.processedResponseIds ?? []), responseId];
    const trimmed = processed.length > MAX_PROCESSED_IDS
      ? processed.slice(processed.length - MAX_PROCESSED_IDS)
      : processed;

    await this.prismaClient.providerAccount.update({
      where: { id: providerAccountId },
      data: {
        syncMetadata: {
          ...syncMeta,
          processedResponseIds: trimmed
        } as Prisma.InputJsonValue
      }
    });
  }
}
