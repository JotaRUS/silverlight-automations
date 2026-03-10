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
          'Supports source, enrichment, outreach, Google Sheets, and Supabase destination providers. Supabase credentials: projectUrl, serviceRoleKey, schema, tableName, optional upsertKey.',
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
