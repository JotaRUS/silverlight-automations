export const openApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'Expert Sourcing Automation Platform API',
    version: '1.1.0',
    description:
      'Cookie-based admin UI APIs plus scoped platform API keys for external integrations.'
  },
  components: {
    securitySchemes: {
      sessionCookie: {
        type: 'apiKey',
        in: 'cookie',
        name: 'access_token',
        description: 'Browser session cookie created by POST /api/v1/auth/login.'
      },
      csrfHeader: {
        type: 'apiKey',
        in: 'header',
        name: 'x-csrf-token',
        description: 'Required for mutating requests made with a browser session cookie.'
      },
      bearerApiKey: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'platform-api-key',
        description: 'Personal API key created from the admin UI.'
      },
      xApiKey: {
        type: 'apiKey',
        in: 'header',
        name: 'x-api-key',
        description: 'Alternative header for personal platform API keys.'
      }
    }
  },
  paths: {
    '/api/v1/system/health': {
      get: {
        summary: 'Health check',
        responses: {
          '200': {
            description: 'Service is healthy'
          }
        }
      }
    },
    '/api/v1/system/ready': {
      get: {
        summary: 'Readiness check',
        responses: {
          '200': {
            description: 'Service is ready'
          }
        }
      }
    },
    '/api/v1/auth/login': {
      post: {
        summary: 'Login and issue cookie-based session'
      }
    },
    '/api/v1/auth/logout': {
      post: {
        summary: 'Logout and clear cookie-based session'
      }
    },
    '/api/v1/auth/csrf': {
      get: {
        summary: 'Get CSRF token for mutating authenticated requests'
      }
    },
    '/api/v1/auth/linkedin/authorize': {
      get: {
        summary: 'Build LinkedIn OAuth authorization URL for a provider account'
      }
    },
    '/api/v1/auth/linkedin/callback': {
      get: {
        summary: 'Handle LinkedIn OAuth authorization code callback'
      }
    },
    '/api/v1/projects': {
      get: {
        summary: 'List projects',
        security: [{ bearerApiKey: [] }, { xApiKey: [] }, { sessionCookie: [] }]
      },
      post: {
        summary: 'Create project',
        description:
          'Supports provider bindings, world-country geography filters, and stored company/job-title filters via companion endpoints.',
        security: [{ bearerApiKey: [] }, { xApiKey: [] }, { sessionCookie: [] }, { csrfHeader: [] }]
      }
    },
    '/api/v1/projects/{projectId}': {
      get: {
        summary: 'Get project by id',
        security: [{ bearerApiKey: [] }, { xApiKey: [] }, { sessionCookie: [] }]
      },
      patch: {
        summary: 'Update project by id',
        security: [{ bearerApiKey: [] }, { xApiKey: [] }, { sessionCookie: [] }, { csrfHeader: [] }]
      },
      delete: {
        summary: 'Archive project by id',
        security: [{ bearerApiKey: [] }, { xApiKey: [] }, { sessionCookie: [] }, { csrfHeader: [] }]
      }
    },
    '/api/v1/projects/{projectId}/companies': {
      get: {
        summary: 'List stored company filters for a project',
        security: [{ bearerApiKey: [] }, { xApiKey: [] }, { sessionCookie: [] }]
      },
      post: {
        summary: 'Replace stored company filters for a project',
        security: [{ bearerApiKey: [] }, { xApiKey: [] }, { sessionCookie: [] }, { csrfHeader: [] }]
      }
    },
    '/api/v1/projects/{projectId}/job-titles': {
      get: {
        summary: 'List stored job-title filters for a project',
        security: [{ bearerApiKey: [] }, { xApiKey: [] }, { sessionCookie: [] }]
      },
      post: {
        summary: 'Replace stored job-title filters for a project',
        security: [{ bearerApiKey: [] }, { xApiKey: [] }, { sessionCookie: [] }, { csrfHeader: [] }]
      }
    },
    '/api/v1/projects/{projectId}/apollo-search': {
      post: {
        summary: 'Queue Apollo sourcing with project and ad-hoc filters',
        description:
          'Uses explicit person/company filters from the request body, falling back to stored project countries, companies, and job titles.',
        security: [{ bearerApiKey: [] }, { xApiKey: [] }, { sessionCookie: [] }, { csrfHeader: [] }]
      }
    },
    '/api/v1/projects/{projectId}/kick': {
      post: {
        summary: 'Kick project sourcing and enrichment queues',
        security: [{ bearerApiKey: [] }, { xApiKey: [] }, { sessionCookie: [] }, { csrfHeader: [] }]
      }
    },
    '/api/v1/admin/leads': {
      get: {
        summary: 'List leads with enrichment attempt summaries',
        description:
          'Returns lead records, project info, expert contacts, and the latest enrichment attempts for provider transparency.',
        security: [{ bearerApiKey: [] }, { xApiKey: [] }, { sessionCookie: [] }]
      }
    },
    '/api/v1/admin/leads/{leadId}': {
      patch: {
        summary: 'Update lead',
        security: [{ bearerApiKey: [] }, { xApiKey: [] }, { sessionCookie: [] }, { csrfHeader: [] }]
      },
      delete: {
        summary: 'Soft-delete lead',
        security: [{ bearerApiKey: [] }, { xApiKey: [] }, { sessionCookie: [] }, { csrfHeader: [] }]
      }
    },
    '/api/v1/callers': {
      post: {
        summary: 'Create caller profile'
      }
    },
    '/api/v1/callers/{callerId}/performance/latest': {
      get: {
        summary: 'Get latest caller performance snapshot'
      }
    },
    '/api/v1/job-title-discovery/trigger': {
      post: {
        summary: 'Trigger job title discovery workflow'
      }
    },
    '/api/v1/outreach/send': {
      post: {
        summary: 'Send outbound outreach message'
      }
    },
    '/api/v1/screening/dispatch': {
      post: {
        summary: 'Dispatch screening questions'
      }
    },
    '/api/v1/providers': {
      get: {
        summary: 'List provider accounts',
        security: [{ bearerApiKey: [] }, { xApiKey: [] }, { sessionCookie: [] }]
      },
      post: {
        summary: 'Create provider account',
        description:
          'Supports source, enrichment, outreach, Google Sheets, and Supabase destination providers. Supabase credentials: projectUrl, serviceRoleKey, schema, tableName, and optional column mappings (columnEmail, columnPhone, columnCountry, columnCurrentCompany, columnLinkedinUrl, columnJobTitle) to match your Supabase table schema.',
        security: [{ bearerApiKey: [] }, { xApiKey: [] }, { sessionCookie: [] }, { csrfHeader: [] }]
      }
    },
    '/api/v1/providers/{providerAccountId}': {
      get: {
        summary: 'Get provider account',
        security: [{ bearerApiKey: [] }, { xApiKey: [] }, { sessionCookie: [] }]
      },
      patch: {
        summary: 'Update provider account',
        security: [{ bearerApiKey: [] }, { xApiKey: [] }, { sessionCookie: [] }, { csrfHeader: [] }]
      }
    },
    '/api/v1/providers/{providerAccountId}/test-connection': {
      post: {
        summary: 'Run provider-specific health check',
        security: [{ bearerApiKey: [] }, { xApiKey: [] }, { sessionCookie: [] }, { csrfHeader: [] }]
      }
    },
    '/api/v1/providers/{providerAccountId}/bind-project': {
      post: {
        summary: 'Bind provider account to project role',
        security: [{ bearerApiKey: [] }, { xApiKey: [] }, { sessionCookie: [] }, { csrfHeader: [] }]
      }
    },
    '/api/v1/api-keys': {
      get: {
        summary: 'List personal API keys for the current user',
        security: [{ sessionCookie: [] }]
      },
      post: {
        summary: 'Create a personal API key',
        security: [{ sessionCookie: [] }, { csrfHeader: [] }]
      }
    },
    '/api/v1/api-keys/{apiKeyId}/revoke': {
      post: {
        summary: 'Revoke a personal API key',
        security: [{ sessionCookie: [] }, { csrfHeader: [] }]
      }
    },
    '/api/v1/docs/postman-collection': {
      get: {
        summary: 'Download the checked-in Postman collection'
      }
    },
    '/api/v1/documentation/generate': {
      post: {
        summary: 'Generate operational documentation artifacts'
      }
    },
    '/api/v1/call-tasks/current': {
      get: {
        summary: 'Caller fetches currently assigned call task'
      }
    },
    '/api/v1/call-tasks/{taskId}/outcome': {
      post: {
        summary: 'Caller submits call task outcome'
      }
    },
    '/api/v1/call-tasks/operator/tasks': {
      get: {
        summary: 'Operator lists call tasks with filters'
      }
    },
    '/api/v1/call-tasks/operator/tasks/{taskId}/requeue': {
      post: {
        summary: 'Operator requeues a task for reassignment'
      }
    },
    '/api/v1/admin/ranking/latest': {
      get: {
        summary: 'Get latest expert ranking snapshots',
        description:
          'Returns priority-ranked experts for call allocation. All scores are 0-100, split into four 25-point tiers: fresh reply (75-100), signup chase (50-75), callback chase (25-50), base pool (0-25). Snapshots are computed every 60 seconds by the scheduler. Includes expert contacts, project completion summaries, and boost metadata.',
        parameters: [
          {
            name: 'projectId',
            in: 'query',
            required: false,
            schema: { type: 'string', format: 'uuid' },
            description: 'Filter snapshots to a specific project'
          }
        ],
        responses: {
          '200': {
            description:
              'Object with `snapshots` (ranked expert list with score 0-100, boost tier metadata, expert contacts) and `projectSummaries` (active projects with completion data)'
          }
        }
      }
    },
    '/api/v1/admin/observability/summary': {
      get: {
        summary: 'Observability summary counts (24h)',
        description: 'Returns 24-hour counts for DLQ items, system events, fraud flags, and processed webhooks. Used by the stats bar on the observability dashboard.',
        responses: {
          '200': {
            description: 'Object with `dlqCount`, `recentEventCount`, `fraudFlagCount`, `webhookCount`'
          }
        }
      }
    },
    '/api/v1/admin/observability/system-events': {
      get: {
        summary: 'List system events with filtering',
        description: 'Returns paginated system events across all 6 categories (SYSTEM, JOB, WEBHOOK, ENFORCEMENT, FRAUD, ALLOCATION). Supports category filter, entity type filter, full-text search on message, and date range.',
        parameters: [
          { name: 'category', in: 'query', required: false, schema: { type: 'string', enum: ['SYSTEM', 'JOB', 'WEBHOOK', 'ENFORCEMENT', 'FRAUD', 'ALLOCATION'] }, description: 'Filter by event category' },
          { name: 'entityType', in: 'query', required: false, schema: { type: 'string' }, description: 'Filter by entity type' },
          { name: 'search', in: 'query', required: false, schema: { type: 'string' }, description: 'Full-text search on event message (case-insensitive)' },
          { name: 'since', in: 'query', required: false, schema: { type: 'string', format: 'date-time' }, description: 'Start of date range (ISO 8601)' },
          { name: 'until', in: 'query', required: false, schema: { type: 'string', format: 'date-time' }, description: 'End of date range (ISO 8601)' },
          { name: 'limit', in: 'query', required: false, schema: { type: 'integer', default: 100, maximum: 500 }, description: 'Page size' },
          { name: 'offset', in: 'query', required: false, schema: { type: 'integer', default: 0 }, description: 'Pagination offset' }
        ],
        responses: {
          '200': { description: 'Object with `events` (SystemEvent array) and `total` (count for pagination)' }
        }
      }
    },
    '/api/v1/admin/observability/dlq': {
      get: {
        summary: 'List dead-letter queue entries',
        description: 'Returns paginated DLQ entries for failed background jobs. Supports queue name filter, error message search, and date range.',
        parameters: [
          { name: 'queueName', in: 'query', required: false, schema: { type: 'string' }, description: 'Filter by queue name' },
          { name: 'search', in: 'query', required: false, schema: { type: 'string' }, description: 'Search error messages (case-insensitive)' },
          { name: 'since', in: 'query', required: false, schema: { type: 'string', format: 'date-time' }, description: 'Start of date range' },
          { name: 'until', in: 'query', required: false, schema: { type: 'string', format: 'date-time' }, description: 'End of date range' },
          { name: 'limit', in: 'query', required: false, schema: { type: 'integer', default: 100, maximum: 500 }, description: 'Page size' },
          { name: 'offset', in: 'query', required: false, schema: { type: 'integer', default: 0 }, description: 'Pagination offset' }
        ],
        responses: {
          '200': { description: 'Object with `jobs` (DeadLetterJob array) and `total`' }
        }
      }
    },
    '/api/v1/admin/observability/webhooks': {
      get: {
        summary: 'List processed webhook events',
        description: 'Returns paginated webhook deduplication records. Supports status filter, event ID search, and date range.',
        parameters: [
          { name: 'status', in: 'query', required: false, schema: { type: 'string' }, description: 'Filter by processing status' },
          { name: 'search', in: 'query', required: false, schema: { type: 'string' }, description: 'Search event IDs (case-insensitive)' },
          { name: 'since', in: 'query', required: false, schema: { type: 'string', format: 'date-time' }, description: 'Start of date range' },
          { name: 'until', in: 'query', required: false, schema: { type: 'string', format: 'date-time' }, description: 'End of date range' },
          { name: 'limit', in: 'query', required: false, schema: { type: 'integer', default: 100, maximum: 500 }, description: 'Page size' },
          { name: 'offset', in: 'query', required: false, schema: { type: 'integer', default: 0 }, description: 'Pagination offset' }
        ],
        responses: {
          '200': { description: 'Object with `events` (ProcessedWebhookEvent array) and `total`' }
        }
      }
    },
    '/api/v1/admin/observability/fraud': {
      get: {
        summary: 'List fraud flags and enforcement events',
        description: 'Returns paginated fraud-flagged call logs and FRAUD/ENFORCEMENT system events. Supports date range filtering.',
        parameters: [
          { name: 'since', in: 'query', required: false, schema: { type: 'string', format: 'date-time' }, description: 'Start of date range' },
          { name: 'until', in: 'query', required: false, schema: { type: 'string', format: 'date-time' }, description: 'End of date range' },
          { name: 'limit', in: 'query', required: false, schema: { type: 'integer', default: 100, maximum: 500 }, description: 'Page size' },
          { name: 'offset', in: 'query', required: false, schema: { type: 'integer', default: 0 }, description: 'Pagination offset' }
        ],
        responses: {
          '200': { description: 'Object with `callLogs`, `events`, `totalLogs`, `totalEvents`' }
        }
      }
    },
    '/webhooks/yay/{providerAccountId}': {
      post: {
        summary: 'Ingest Yay webhook events'
      }
    },
    '/webhooks/sales-nav/{providerAccountId}': {
      post: {
        summary: 'Ingest Sales Navigator webhook payload'
      }
    }
  }
} as const;
