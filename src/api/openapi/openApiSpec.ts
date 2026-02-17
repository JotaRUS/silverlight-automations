export const openApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'Expert Sourcing Automation Platform API',
    version: '1.0.0'
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
    '/api/v1/auth/token': {
      post: {
        summary: 'Issue JWT access token'
      }
    },
    '/api/v1/projects': {
      post: {
        summary: 'Create project'
      }
    },
    '/api/v1/projects/{projectId}': {
      get: {
        summary: 'Get project by id'
      },
      patch: {
        summary: 'Update project by id'
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
    '/webhooks/yay': {
      post: {
        summary: 'Ingest Yay webhook events'
      }
    },
    '/webhooks/sales-nav': {
      post: {
        summary: 'Ingest Sales Navigator webhook payload'
      }
    }
  }
} as const;
