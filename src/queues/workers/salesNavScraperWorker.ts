import { Worker } from 'bullmq';

import { env } from '../../config/env';
import { prisma } from '../../db/client';
import { decryptProviderCredentials } from '../../core/providers/providerCredentialsCrypto';
import {
  launchScraperBrowser,
  scrapeSearchUrl
} from '../../integrations/sales-nav/salesNavScraperService';
import { emitNotification } from '../../modules/notifications/emitNotification';
import { salesNavScraperJobSchema, type SalesNavScraperJob } from '../definitions/jobPayloadSchemas';
import { QUEUE_NAMES } from '../definitions/queueNames';
import { getQueues } from '../index';
import { buildJobId } from '../jobId';
import { bullMqConnection } from '../redis';
import { createJobLogger, type CorrelatedJobData } from './withWorkerContext';
import { registerDeadLetterHandler } from './withDeadLetter';

export function createSalesNavScraperWorker(): Worker<CorrelatedJobData<SalesNavScraperJob>> {
  const worker = new Worker<CorrelatedJobData<SalesNavScraperJob>>(
    QUEUE_NAMES.SALES_NAV_SCRAPER,
    async (job) => {
      const jobLogger = createJobLogger(job);
      const payload = salesNavScraperJobSchema.parse(job.data.data);

      const project = await prisma.project.findUnique({
        where: { id: payload.projectId },
        select: {
          id: true,
          name: true,
          salesNavWebhookProviderAccountId: true
        }
      });

      if (!project?.salesNavWebhookProviderAccountId) {
        throw new Error('Project has no Sales Navigator provider account bound');
      }

      const providerAccount = await prisma.providerAccount.findUniqueOrThrow({
        where: { id: project.salesNavWebhookProviderAccountId }
      });

      const credentials = decryptProviderCredentials(providerAccount.credentialsJson);
      const liAtCookie =
        typeof credentials.linkedInSessionCookie === 'string'
          ? credentials.linkedInSessionCookie
          : '';

      if (!liAtCookie) {
        emitNotification({
          type: 'provider.cookie_expired',
          severity: 'ERROR',
          title: `LinkedIn session cookie missing`,
          message: `No li_at cookie found for provider "${providerAccount.accountLabel}". Re-authorize via the Providers page.`,
          projectId: payload.projectId,
          metadata: { providerAccountId: providerAccount.id }
        });
        throw new Error('No LinkedIn session cookie (li_at) available in provider credentials');
      }

      emitNotification({
        type: 'project.scraping_started',
        severity: 'INFO',
        title: `Scraping started: ${project.name}`,
        message: `Scraping Sales Navigator search URL (page ${String(payload.resumeFromPage)}).`,
        projectId: payload.projectId,
        metadata: { salesNavSearchId: payload.salesNavSearchId }
      });

      await prisma.systemEvent.create({
        data: {
          category: 'JOB',
          entityType: 'sales_nav_scraper',
          entityId: payload.salesNavSearchId,
          correlationId: job.data.correlationId,
          message: 'sales_nav_scraper_started',
          payload: {
            projectId: payload.projectId,
            sourceUrl: payload.sourceUrl,
            resumeFromPage: payload.resumeFromPage
          }
        }
      });

      const { browser, page } = await launchScraperBrowser(liAtCookie);

      try {
        const result = await scrapeSearchUrl(
          page,
          payload.sourceUrl,
          payload.resumeFromPage,
          (pageNum, leadsOnPage) => {
            jobLogger.info(
              { pageNum, leadsOnPage },
              'sales-nav-scraper-page-progress'
            );
          }
        );

        if (result.abortedReason === 'session_expired') {
          emitNotification({
            type: 'provider.cookie_expired',
            severity: 'ERROR',
            title: `LinkedIn session expired`,
            message: `The li_at cookie has expired. Re-authorize via the Providers page to continue scraping.`,
            projectId: payload.projectId,
            metadata: { providerAccountId: providerAccount.id }
          });
          throw new Error('LinkedIn session cookie expired — detected login redirect');
        }

        const timeSlice = new Date().toISOString().slice(0, 16);
        let enqueued = 0;

        for (const lead of result.leads) {
          const jobId = buildJobId(
            'scraper-lead',
            payload.projectId,
            lead.linkedinUrl ?? lead.fullName,
            timeSlice
          );
          await getQueues().leadIngestionQueue.add(
            'lead-ingestion.ingest',
            {
              correlationId: job.data.correlationId,
              data: {
                projectId: payload.projectId,
                salesNavSearchId: payload.salesNavSearchId,
                source: 'sales_nav' as const,
                lead: {
                  firstName: lead.firstName,
                  lastName: lead.lastName,
                  fullName: lead.fullName,
                  companyName: lead.companyName,
                  jobTitle: lead.jobTitle,
                  linkedinUrl: lead.linkedinUrl,
                  emails: [],
                  phones: [],
                  metadata: { scrapedFromPage: true, location: lead.location }
                }
              }
            },
            { jobId }
          );
          enqueued++;
        }

        await prisma.salesNavSearch.update({
          where: { id: payload.salesNavSearchId },
          data: { paginationCursor: String(result.lastPageScraped) }
        });

        await prisma.systemEvent.create({
          data: {
            category: 'JOB',
            entityType: 'sales_nav_scraper',
            entityId: payload.salesNavSearchId,
            correlationId: job.data.correlationId,
            message: 'sales_nav_scraper_completed',
            payload: {
              projectId: payload.projectId,
              leadsExtracted: result.leads.length,
              leadsEnqueued: enqueued,
              lastPageScraped: result.lastPageScraped,
              totalResultsEstimate: result.totalResultsEstimate,
              abortedReason: result.abortedReason ?? null
            }
          }
        });

        emitNotification({
          type: 'project.scraping_completed',
          severity: result.abortedReason ? 'WARNING' : 'INFO',
          title: `Scraping ${result.abortedReason ? 'paused' : 'completed'}: ${project.name}`,
          message: `Extracted ${String(result.leads.length)} leads (pages 1-${String(result.lastPageScraped)}).${result.abortedReason ? ` Stopped: ${result.abortedReason}` : ''}`,
          projectId: payload.projectId,
          metadata: {
            salesNavSearchId: payload.salesNavSearchId,
            leadsExtracted: result.leads.length,
            lastPageScraped: result.lastPageScraped
          }
        });

        jobLogger.info(
          {
            leadsExtracted: result.leads.length,
            enqueued,
            lastPageScraped: result.lastPageScraped,
            abortedReason: result.abortedReason
          },
          'sales-nav-scraper-job-complete'
        );
      } finally {
        await browser.close().catch((err: unknown) => {
          jobLogger.warn({ err }, 'sales-nav-scraper-browser-close-error');
        });
      }
    },
    {
      connection: bullMqConnection,
      prefix: env.REDIS_NAMESPACE,
      concurrency: 1
    }
  );

  registerDeadLetterHandler(worker, QUEUE_NAMES.SALES_NAV_SCRAPER);
  return worker;
}
