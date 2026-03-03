import { Worker } from 'bullmq';

import { env } from '../../config/env';
import { ApolloClient } from '../../integrations/apollo/apolloClient';
import { apolloLeadSourcingJobSchema, type ApolloLeadSourcingJob } from '../definitions/jobPayloadSchemas';
import { QUEUE_NAMES } from '../definitions/queueNames';
import { getQueues } from '..';
import { buildJobId } from '../jobId';
import { bullMqConnection } from '../redis';
import { createJobLogger, getJobCorrelationId, type CorrelatedJobData } from './withWorkerContext';
import { registerDeadLetterHandler } from './withDeadLetter';

const apolloClient = new ApolloClient();

export function createApolloLeadSourcingWorker(): Worker<CorrelatedJobData<ApolloLeadSourcingJob>> {
  const worker = new Worker<CorrelatedJobData<ApolloLeadSourcingJob>>(
    QUEUE_NAMES.APOLLO_LEAD_SOURCING,
    async (job) => {
      const jobLogger = createJobLogger(job);
      const correlationId = getJobCorrelationId(job);
      const payload = apolloLeadSourcingJobSchema.parse(job.data.data);

      jobLogger.info(
        { projectId: payload.projectId, locations: payload.personLocations, titles: payload.personTitles },
        'apollo-lead-sourcing-started'
      );

      const result = await apolloClient.searchPeople({
        projectId: payload.projectId,
        personLocations: payload.personLocations,
        personTitles: payload.personTitles,
        personSeniorities: payload.personSeniorities,
        personDepartments: payload.personDepartments,
        personFunctions: payload.personFunctions,
        personNotTitles: payload.personNotTitles,
        personSkills: payload.personSkills,
        organizationDomains: payload.organizationDomains,
        organizationNames: payload.organizationNames,
        organizationLocations: payload.organizationLocations,
        organizationNumEmployeesRanges: payload.organizationNumEmployeesRanges,
        keywords: payload.keywords,
        correlationId,
        maxPages: payload.maxPages ?? 2,
        perPage: payload.perPage ?? 25
      });

      let enqueued = 0;
      for (const person of result.people) {
        if (!person.firstName && !person.fullName) {
          continue;
        }

        const fullName = person.fullName ?? person.firstName ?? 'Unknown';
        const emails = person.email ? [person.email] : [];

        await getQueues().leadIngestionQueue.add(
          'lead-ingestion.ingest',
          {
            correlationId,
            data: {
              projectId: payload.projectId,
              source: 'apollo',
              lead: {
                firstName: person.firstName ?? undefined,
                lastName: person.lastName ?? undefined,
                fullName,
                jobTitle: person.jobTitle ?? undefined,
                companyName: person.companyName ?? undefined,
                linkedinUrl: person.linkedinUrl ?? undefined,
                countryIso: person.country?.length === 2 ? person.country : undefined,
                emails,
                phones: [],
                metadata: {
                  apolloId: person.apolloId,
                  source: 'apollo_people_search',
                  city: person.city ?? undefined,
                  state: person.state ?? undefined,
                  country: person.country ?? undefined
                }
              }
            }
          },
          {
            jobId: buildJobId('lead-ingestion', payload.projectId, person.apolloId)
          }
        );
        enqueued += 1;
      }

      jobLogger.info(
        {
          projectId: payload.projectId,
          totalFound: result.totalEntries,
          peopleReturned: result.people.length,
          leadsEnqueued: enqueued
        },
        'apollo-lead-sourcing-complete'
      );
    },
    {
      connection: bullMqConnection,
      prefix: env.REDIS_NAMESPACE,
      concurrency: 3
    }
  );

  registerDeadLetterHandler(worker, QUEUE_NAMES.APOLLO_LEAD_SOURCING);
  return worker;
}
