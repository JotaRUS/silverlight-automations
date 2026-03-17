'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

interface Param {
  name: string;
  type: string;
  required?: boolean;
  description: string;
}

interface ResponseExample {
  status: number;
  label: string;
  body: string;
}

interface Endpoint {
  method: HttpMethod;
  path: string;
  summary: string;
  description?: string;
  auth: string;
  pathParams?: Param[];
  queryParams?: Param[];
  bodyParams?: Param[];
  bodyExample?: string;
  responses: ResponseExample[];
  notes?: string;
}

interface EndpointGroup {
  title: string;
  description: string;
  endpoints: Endpoint[];
}

/* ------------------------------------------------------------------ */
/*  Method badge color                                                 */
/* ------------------------------------------------------------------ */

const METHOD_COLOR: Record<HttpMethod, string> = {
  GET: 'bg-emerald-100 text-emerald-700',
  POST: 'bg-blue-100 text-blue-700',
  PATCH: 'bg-amber-100 text-amber-700',
  DELETE: 'bg-red-100 text-red-700'
};

/* ------------------------------------------------------------------ */
/*  Comprehensive endpoint data                                        */
/* ------------------------------------------------------------------ */

const groups: EndpointGroup[] = [
  /* ---- System ---- */
  {
    title: 'System',
    description: 'Health and readiness probes — no authentication required.',
    endpoints: [
      {
        method: 'GET',
        path: '/api/v1/system/health',
        summary: 'Basic health check',
        auth: 'None',
        responses: [
          { status: 200, label: 'Healthy', body: '{ "status": "ok" }' }
        ]
      },
      {
        method: 'GET',
        path: '/api/v1/system/ready',
        summary: 'Readiness check (PostgreSQL + Redis)',
        auth: 'None',
        responses: [
          { status: 200, label: 'Ready', body: '{ "status": "ready" }' },
          { status: 503, label: 'Not ready', body: '{ "status": "not-ready", "checks": { "db": false, "redis": true } }' }
        ]
      }
    ]
  },

  /* ---- Auth ---- */
  {
    title: 'Auth',
    description: 'Session login, CSRF tokens, LinkedIn OAuth, and profile management.',
    endpoints: [
      {
        method: 'POST',
        path: '/api/v1/auth/login',
        summary: 'Login and issue session cookie',
        description: 'In production, sends email + password. In development, you can also send userId + role.',
        auth: 'None',
        bodyParams: [
          { name: 'email', type: 'string', required: true, description: 'User email (production)' },
          { name: 'password', type: 'string', required: true, description: 'User password (production)' }
        ],
        bodyExample: '{\n  "email": "admin@example.com",\n  "password": "your-password"\n}',
        responses: [
          { status: 200, label: 'Success', body: '{\n  "authenticated": true,\n  "userId": "uuid",\n  "role": "admin",\n  "name": "Jane Doe",\n  "email": "admin@example.com",\n  "csrfToken": "f6d4e077..."\n}' },
          { status: 401, label: 'Invalid credentials', body: '{ "error": "Invalid credentials" }' }
        ],
        notes: 'Sets an httpOnly `access_token` cookie. Save the returned `csrfToken` for mutating requests.'
      },
      {
        method: 'POST',
        path: '/api/v1/auth/logout',
        summary: 'Clear session cookie',
        auth: 'Session cookie',
        responses: [
          { status: 200, label: 'Logged out', body: '{ "authenticated": false }' }
        ]
      },
      {
        method: 'GET',
        path: '/api/v1/auth/csrf',
        summary: 'Get a fresh CSRF token',
        auth: 'Session cookie',
        responses: [
          { status: 200, label: 'Token', body: '{ "csrfToken": "abc123..." }' }
        ]
      },
      {
        method: 'GET',
        path: '/api/v1/auth/me',
        summary: 'Get current user identity',
        auth: 'Session cookie or API key',
        responses: [
          { status: 200, label: 'Authenticated', body: '{\n  "userId": "uuid",\n  "role": "admin",\n  "authType": "session",\n  "name": "Jane Doe",\n  "email": "admin@example.com"\n}' },
          { status: 401, label: 'Unauthenticated', body: '{ "error": "Authentication required" }' }
        ]
      },
      {
        method: 'PATCH',
        path: '/api/v1/auth/profile',
        summary: 'Update own name or password',
        auth: 'Session cookie + CSRF',
        bodyParams: [
          { name: 'name', type: 'string', description: 'New display name' },
          { name: 'currentPassword', type: 'string', description: 'Required when changing password' },
          { name: 'newPassword', type: 'string', description: 'New password (min 6 chars)' }
        ],
        bodyExample: '{\n  "name": "Updated Name",\n  "currentPassword": "old",\n  "newPassword": "new123"\n}',
        responses: [
          { status: 200, label: 'Updated', body: '{ "userId": "uuid", "name": "Updated Name", "email": "admin@example.com", "role": "admin" }' },
          { status: 400, label: 'Validation error', body: '{ "error": "Current password is required to change password" }' }
        ]
      },
      {
        method: 'GET',
        path: '/api/v1/auth/linkedin/authorize',
        summary: 'Build LinkedIn OAuth authorization URL (legacy — see Providers group)',
        auth: 'Session cookie (admin/ops)',
        queryParams: [
          { name: 'providerAccountId', type: 'UUID', required: true, description: 'LinkedIn provider account' },
          { name: 'scope', type: 'string', description: 'OAuth scopes' },
          { name: 'responseMode', type: 'json | redirect', description: 'Default: json' }
        ],
        responses: [
          { status: 200, label: 'URL (json)', body: '{\n  "authorizeUrl": "https://www.linkedin.com/oauth/...",\n  "redirectUri": "...",\n  "state": "...",\n  "scopes": ["r_liteprofile"],\n  "expiresAt": "ISO date"\n}' }
        ],
        notes: 'Prefer the provider-scoped endpoint: GET /api/v1/providers/{providerAccountId}/linkedin/oauth/authorize'
      },
      {
        method: 'GET',
        path: '/api/v1/auth/linkedin/callback',
        summary: 'Handle LinkedIn OAuth callback (legacy — see Providers group)',
        auth: 'None',
        queryParams: [
          { name: 'code', type: 'string', description: 'Authorization code' },
          { name: 'state', type: 'string', description: 'State parameter' }
        ],
        responses: [
          { status: 200, label: 'Connected', body: '{\n  "connected": true,\n  "providerAccountId": "uuid",\n  "scope": "r_liteprofile",\n  "accessTokenExpiresAt": "ISO",\n  "refreshTokenExpiresAt": "ISO"\n}' }
        ],
        notes: 'Prefer the provider-scoped callback: GET /api/v1/providers/linkedin/oauth/callback'
      }
    ]
  },

  /* ---- Projects ---- */
  {
    title: 'Projects',
    description: 'Create and manage sourcing projects with geography, company, and job-title filters.',
    endpoints: [
      {
        method: 'GET',
        path: '/api/v1/projects',
        summary: 'List all projects',
        auth: 'API key or Session (admin/ops)',
        responses: [
          { status: 200, label: 'Project list', body: '[\n  {\n    "id": "uuid",\n    "name": "Project Alpha",\n    "status": "ACTIVE",\n    "targetThreshold": 100,\n    "signedUpCount": 42,\n    "completionPercentage": 42,\n    "geographyIsoCodes": ["JP", "SG", "IN"],\n    "priority": 1,\n    "createdAt": "ISO",\n    "updatedAt": "ISO"\n  }\n]' }
        ]
      },
      {
        method: 'POST',
        path: '/api/v1/projects',
        summary: 'Create a project',
        auth: 'API key or Session + CSRF (admin/ops)',
        bodyParams: [
          { name: 'name', type: 'string', required: true, description: 'Project name' },
          { name: 'description', type: 'string', description: 'Optional description' },
          { name: 'targetThreshold', type: 'number', required: true, description: 'Target expert count' },
          { name: 'geographyIsoCodes', type: 'string[]', required: true, description: 'ISO 3166-1 alpha-2 country codes' },
          { name: 'priority', type: 'number', description: '0 (low) to 3 (critical)' },
          { name: 'overrideCooldown', type: 'boolean', description: 'Skip outreach cooldowns' },
          { name: 'apolloProviderAccountId', type: 'UUID', description: 'Bind Apollo provider' },
          { name: 'googleSheetsProviderAccountId', type: 'UUID', description: 'Bind Google Sheets export destination' },
          { name: 'supabaseProviderAccountId', type: 'UUID', description: 'Bind Supabase export destination' },
          { name: 'outreachMessageTemplate', type: 'String', description: 'Outreach message template with variable placeholders: {{FirstName}}, {{LastName}}, {{Country}}, {{JobTitle}}, {{CurrentCompany}}' }
        ],
        bodyExample: '{\n  "name": "LATAM Engineering",\n  "targetThreshold": 50,\n  "geographyIsoCodes": ["AR", "BR", "UY"],\n  "priority": 1,\n  "googleSheetsProviderAccountId": "uuid-of-gsheets-account",\n  "supabaseProviderAccountId": "uuid-of-supabase-account",\n  "outreachMessageTemplate": "Hi {{FirstName}}, we have an opportunity at {{Company}}..."\n}',
        responses: [
          { status: 201, label: 'Created', body: '{\n  "id": "uuid",\n  "name": "LATAM Engineering",\n  "status": "ACTIVE",\n  ...\n}' },
          { status: 400, label: 'Validation error', body: '{ "error": "name is required" }' }
        ]
      },
      {
        method: 'GET',
        path: '/api/v1/projects/{projectId}',
        summary: 'Get a single project',
        auth: 'API key or Session (admin/ops)',
        pathParams: [{ name: 'projectId', type: 'UUID', required: true, description: 'Project ID' }],
        responses: [
          { status: 200, label: 'Project', body: '{ "id": "uuid", "name": "...", ... }' },
          { status: 404, label: 'Not found', body: '{ "error": "Project not found" }' }
        ]
      },
      {
        method: 'PATCH',
        path: '/api/v1/projects/{projectId}',
        summary: 'Update a project',
        auth: 'API key or Session + CSRF (admin/ops)',
        pathParams: [{ name: 'projectId', type: 'UUID', required: true, description: 'Project ID' }],
        bodyParams: [
          { name: 'name', type: 'string', description: 'New project name' },
          { name: 'status', type: 'enum', description: 'ACTIVE | PAUSED | COMPLETED | ARCHIVED' },
          { name: 'targetThreshold', type: 'number', description: 'Updated expert target' },
          { name: 'geographyIsoCodes', type: 'string[]', description: 'Updated country codes' },
          { name: 'googleSheetsProviderAccountId', type: 'UUID | null', description: 'Bind or unbind Google Sheets export' },
          { name: 'supabaseProviderAccountId', type: 'UUID | null', description: 'Bind or unbind Supabase export' },
          { name: 'outreachMessageTemplate', type: 'String | null', description: 'Outreach message template with variable placeholders; null to clear' }
        ],
        bodyExample: '{\n  "status": "PAUSED",\n  "targetThreshold": 200,\n  "googleSheetsProviderAccountId": "uuid-or-null",\n  "outreachMessageTemplate": "Hi {{FirstName}}, ..."\n}',
        responses: [
          { status: 200, label: 'Updated', body: '{ "id": "uuid", "status": "PAUSED", ... }' }
        ]
      },
      {
        method: 'DELETE',
        path: '/api/v1/projects/{projectId}',
        summary: 'Soft-delete (archive) a project',
        auth: 'API key or Session + CSRF (admin/ops)',
        pathParams: [{ name: 'projectId', type: 'UUID', required: true, description: 'Project ID' }],
        responses: [
          { status: 200, label: 'Archived', body: '{ "id": "uuid", "deletedAt": "ISO" }' }
        ]
      },
      {
        method: 'GET',
        path: '/api/v1/projects/{projectId}/companies',
        summary: 'List stored company filters',
        auth: 'API key or Session (admin/ops)',
        pathParams: [{ name: 'projectId', type: 'UUID', required: true, description: 'Project ID' }],
        responses: [
          { status: 200, label: 'Companies', body: '[\n  { "id": "uuid", "name": "Acme Corp", "domain": null }\n]' }
        ]
      },
      {
        method: 'POST',
        path: '/api/v1/projects/{projectId}/companies',
        summary: 'Replace company filters (sync)',
        auth: 'API key or Session + CSRF (admin/ops)',
        pathParams: [{ name: 'projectId', type: 'UUID', required: true, description: 'Project ID' }],
        bodyParams: [
          { name: 'companies', type: 'array', required: true, description: 'Array of { name, domain?, countryIso?, metadata? }' }
        ],
        bodyExample: '{\n  "companies": [\n    { "name": "Acme Corp" },\n    { "name": "Globex", "domain": "globex.com" }\n  ]\n}',
        responses: [
          { status: 200, label: 'Synced', body: '{ "count": 2 }' }
        ]
      },
      {
        method: 'GET',
        path: '/api/v1/projects/{projectId}/job-titles',
        summary: 'List stored job-title filters',
        auth: 'API key or Session (admin/ops)',
        pathParams: [{ name: 'projectId', type: 'UUID', required: true, description: 'Project ID' }],
        responses: [
          { status: 200, label: 'Job titles', body: '[\n  { "id": "uuid", "titleOriginal": "CTO", "titleNormalized": "cto" }\n]' }
        ]
      },
      {
        method: 'POST',
        path: '/api/v1/projects/{projectId}/job-titles',
        summary: 'Replace job-title filters (sync)',
        auth: 'API key or Session + CSRF (admin/ops)',
        pathParams: [{ name: 'projectId', type: 'UUID', required: true, description: 'Project ID' }],
        bodyParams: [
          { name: 'jobTitles', type: 'array', required: true, description: 'Array of { title, relevanceScore? }' }
        ],
        bodyExample: '{\n  "jobTitles": [\n    { "title": "CTO" },\n    { "title": "VP Engineering" }\n  ]\n}',
        responses: [
          { status: 200, label: 'Synced', body: '{ "count": 2 }' }
        ]
      },
      {
        method: 'POST',
        path: '/api/v1/projects/{projectId}/kick',
        summary: 'Kick sourcing and enrichment queues',
        description: 'Triggers Apollo sourcing using the project\'s stored companies, job titles, and geography filters.',
        auth: 'API key or Session + CSRF (admin/ops)',
        pathParams: [{ name: 'projectId', type: 'UUID', required: true, description: 'Project ID' }],
        responses: [
          { status: 202, label: 'Accepted', body: '{ "accepted": true }' }
        ]
      },
      {
        method: 'POST',
        path: '/api/v1/projects/{projectId}/import-leads',
        summary: 'Import leads from CSV data',
        auth: 'API key or Session + CSRF (admin/ops)',
        pathParams: [{ name: 'projectId', type: 'UUID', required: true, description: 'Project ID' }],
        bodyParams: [
          { name: 'leads', type: 'array', required: true, description: 'Array of row objects (parsed CSV): each object has string keys (column names) and string values' },
          { name: 'salesNavSearchId', type: 'UUID', description: 'Optional Sales Nav search to associate leads with' }
        ],
        bodyExample: '{\n  "leads": [\n    { "email": "jane@example.com", "firstName": "Jane", "lastName": "Doe" },\n    { "email": "john@example.com", "firstName": "John", "lastName": "Smith" }\n  ],\n  "salesNavSearchId": "uuid"\n}',
        responses: [
          { status: 200, label: 'Imported', body: '{ "imported": 10, "duplicatesSkipped": 2, "errors": [] }' },
          { status: 400, label: 'Validation error', body: '{ "error": "Invalid or missing leads" }' }
        ]
      },
      {
        method: 'POST',
        path: '/api/v1/projects/{projectId}/apollo-search',
        summary: 'Queue manual Apollo search with filters',
        description: 'Falls back to stored project filters when not provided in the body.',
        auth: 'API key or Session + CSRF (admin/ops)',
        pathParams: [{ name: 'projectId', type: 'UUID', required: true, description: 'Project ID' }],
        bodyParams: [
          { name: 'personTitles', type: 'string[]', description: 'Job titles to search' },
          { name: 'personLocations', type: 'string[]', description: 'Location strings' },
          { name: 'organizationNames', type: 'string[]', description: 'Company names' },
          { name: 'maxPages', type: 'number', description: 'Max result pages (default 1)' },
          { name: 'perPage', type: 'number', description: 'Results per page (default 25)' }
        ],
        bodyExample: '{\n  "personTitles": ["CTO", "VP Engineering"],\n  "organizationNames": ["Acme Corp"],\n  "maxPages": 3\n}',
        responses: [
          { status: 202, label: 'Queued', body: '{ "accepted": true, "jobId": "uuid" }' }
        ]
      },
      {
        method: 'GET',
        path: '/api/v1/projects/{projectId}/sales-nav-searches',
        summary: 'List active Sales Navigator searches',
        auth: 'Session (admin/ops)',
        pathParams: [{ name: 'projectId', type: 'UUID', required: true, description: 'Project ID' }],
        responses: [
          { status: 200, label: 'Searches', body: '[\n  { "id": "uuid", "sourceUrl": "https://linkedin.com/sales/search/...", "createdAt": "ISO" }\n]' }
        ]
      },
      {
        method: 'POST',
        path: '/api/v1/projects/{projectId}/sales-nav-searches',
        summary: 'Attach Sales Navigator search URLs',
        auth: 'Session + CSRF (admin/ops)',
        pathParams: [{ name: 'projectId', type: 'UUID', required: true, description: 'Project ID' }],
        bodyExample: '{\n  "searches": [\n    { "sourceUrl": "https://linkedin.com/sales/search/..." }\n  ]\n}',
        responses: [
          { status: 200, label: 'Attached', body: '{ "count": 1 }' }
        ]
      },
      {
        method: 'DELETE',
        path: '/api/v1/projects/{projectId}/sales-nav-searches/{searchId}',
        summary: 'Remove a Sales Navigator search',
        auth: 'Session + CSRF (admin/ops)',
        pathParams: [
          { name: 'projectId', type: 'UUID', required: true, description: 'Project ID' },
          { name: 'searchId', type: 'UUID', required: true, description: 'Search ID' }
        ],
        responses: [
          { status: 200, label: 'Removed', body: '{ "ok": true }' },
          { status: 404, label: 'Not found', body: '{ "error": "Search not found" }' }
        ]
      },
      {
        method: 'GET',
        path: '/api/v1/projects/{projectId}/screening-questions',
        summary: 'List screening questions for a project',
        auth: 'Session (admin/ops)',
        pathParams: [{ name: 'projectId', type: 'UUID', required: true, description: 'Project ID' }],
        responses: [
          { status: 200, label: 'Questions', body: '[\n  { "id": "uuid", "prompt": "Are you available for a 30-min call?", "displayOrder": 1 }\n]' }
        ]
      },
      {
        method: 'POST',
        path: '/api/v1/projects/{projectId}/screening-questions',
        summary: 'Create a screening question',
        auth: 'Session + CSRF (admin/ops)',
        pathParams: [{ name: 'projectId', type: 'UUID', required: true, description: 'Project ID' }],
        bodyExample: '{\n  "prompt": "Do you have 5+ years of experience?",\n  "displayOrder": 2,\n  "required": true\n}',
        responses: [
          { status: 201, label: 'Created', body: '{ "id": "uuid", "prompt": "...", "displayOrder": 2 }' }
        ]
      },
      {
        method: 'PATCH',
        path: '/api/v1/projects/{projectId}/screening-questions/{questionId}',
        summary: 'Update a screening question',
        auth: 'Session + CSRF (admin/ops)',
        pathParams: [
          { name: 'projectId', type: 'UUID', required: true, description: 'Project ID' },
          { name: 'questionId', type: 'UUID', required: true, description: 'Question ID' }
        ],
        bodyExample: '{ "prompt": "Updated question text", "required": false }',
        responses: [
          { status: 200, label: 'Updated', body: '{ "id": "uuid", "prompt": "Updated question text", ... }' }
        ]
      },
      {
        method: 'DELETE',
        path: '/api/v1/projects/{projectId}/screening-questions/{questionId}',
        summary: 'Delete a screening question',
        description: 'Permanently removes the question and all associated responses (cascade).',
        auth: 'Session + CSRF (admin/ops)',
        pathParams: [
          { name: 'projectId', type: 'UUID', required: true, description: 'Project ID' },
          { name: 'questionId', type: 'UUID', required: true, description: 'Question ID' }
        ],
        responses: [
          { status: 204, label: 'Deleted', body: '' }
        ]
      }
    ]
  },

  /* ---- Leads ---- */
  {
    title: 'Leads',
    description: 'View, filter, update, and delete leads from the admin pipeline.',
    endpoints: [
      {
        method: 'GET',
        path: '/api/v1/admin/leads',
        summary: 'List leads with enrichment summaries',
        description: 'List leads with enrichment summaries. The projectId query parameter is required.',
        auth: 'API key or Session (admin/ops)',
        queryParams: [
          { name: 'projectId', type: 'UUID', required: true, description: 'Filter by project (required)' },
          { name: 'status', type: 'enum', description: 'NEW | ENRICHED | OUTREACH | SCREENING | SIGNED_UP | DISQUALIFIED' },
          { name: 'page', type: 'number', description: 'Page number (default 1)' },
          { name: 'pageSize', type: 'number', description: '1–200, default 50' }
        ],
        responses: [
          { status: 200, label: 'Paginated leads', body: '{\n  "total": 150,\n  "page": 1,\n  "pageSize": 50,\n  "totalPages": 3,\n  "statusCounts": { "NEW": 80, "ENRICHED": 50, "DISQUALIFIED": 20 },\n  "leads": [\n    {\n      "id": "uuid",\n      "firstName": "Jane",\n      "lastName": "Doe",\n      "fullName": "Jane Doe",\n      "jobTitle": "CTO",\n      "status": "ENRICHED",\n      "googleSheetsExportedAt": "2026-02-25T12:00:00.000Z",\n      "supabaseExportedAt": "2026-02-25T12:01:00.000Z",\n      "project": { "id": "uuid", "name": "LATAM Engineering" },\n      "expert": { "currentCompany": "Acme Corp", ... },\n      "contacts": [ { "type": "EMAIL", "value": "jane@example.com" } ],\n      "enrichmentAttempts": [ { "provider": "LEADMAGIC", "status": "SUCCESS" } ]\n    }\n  ]\n}' }
        ]
      },
      {
        method: 'PATCH',
        path: '/api/v1/admin/leads/{leadId}',
        summary: 'Update a lead',
        auth: 'API key or Session + CSRF (admin/ops)',
        pathParams: [{ name: 'leadId', type: 'UUID', required: true, description: 'Lead ID' }],
        bodyParams: [
          { name: 'status', type: 'enum', description: 'New status' },
          { name: 'fullName', type: 'string', description: 'Updated name' },
          { name: 'jobTitle', type: 'string', description: 'Updated title' },
          { name: 'countryIso', type: 'string', description: 'Updated country code' }
        ],
        bodyExample: '{ "status": "DISQUALIFIED" }',
        responses: [
          { status: 200, label: 'Updated', body: '{ "id": "uuid", "status": "DISQUALIFIED", ... }' },
          { status: 404, label: 'Not found', body: '{ "error": "Lead not found" }' }
        ]
      },
      {
        method: 'DELETE',
        path: '/api/v1/admin/leads/{leadId}',
        summary: 'Soft-delete a lead',
        auth: 'API key or Session + CSRF (admin/ops)',
        pathParams: [{ name: 'leadId', type: 'UUID', required: true, description: 'Lead ID' }],
        responses: [
          { status: 200, label: 'Deleted', body: '{ "id": "uuid", "deletedAt": "ISO" }' }
        ]
      }
    ]
  },

  /* ---- Providers ---- */
  {
    title: 'Providers',
    description: 'Manage provider accounts (Apollo, enrichment services, messaging, Supabase, etc.) and LinkedIn OAuth authorization.',
    endpoints: [
      {
        method: 'GET',
        path: '/api/v1/providers',
        summary: 'List all provider accounts',
        auth: 'API key or Session (admin/ops)',
        queryParams: [
          { name: 'providerType', type: 'enum', description: 'Filter by type (APOLLO, LEADMAGIC, SUPABASE, etc.)' },
          { name: 'isActive', type: 'true | false', description: 'Filter by active status' }
        ],
        responses: [
          { status: 200, label: 'Providers', body: '[\n  {\n    "id": "uuid",\n    "providerType": "APOLLO",\n    "accountLabel": "Main Apollo",\n    "isActive": true,\n    "lastHealthStatus": "healthy"\n  }\n]' }
        ]
      },
      {
        method: 'POST',
        path: '/api/v1/providers',
        summary: 'Create a provider account',
        auth: 'API key or Session + CSRF (admin/ops)',
        bodyParams: [
          { name: 'providerType', type: 'enum', required: true, description: 'APOLLO | LEADMAGIC | PROSPEO | ROCKETREACH | SUPABASE | ...' },
          { name: 'accountLabel', type: 'string', required: true, description: 'Human-friendly label' },
          { name: 'credentials', type: 'object', required: true, description: 'Provider-specific keys (encrypted at rest)' },
          { name: 'isActive', type: 'boolean', description: 'Default true' }
        ],
        bodyExample: '{\n  "providerType": "SUPABASE",\n  "accountLabel": "Prod Export",\n  "credentials": {\n    "projectUrl": "https://xyz.supabase.co",\n    "serviceRoleKey": "eyJ...",\n    "schema": "public",\n    "tableName": "enriched_leads",\n    "columnEmail": "email",\n    "columnPhone": "phone",\n    "columnCountry": "country",\n    "columnCurrentCompany": "current_company",\n    "columnLinkedinUrl": "linkedin_url",\n    "columnJobTitle": "job_title"\n  }\n}',
        responses: [
          { status: 201, label: 'Created', body: '{ "id": "uuid", "providerType": "SUPABASE", "accountLabel": "Prod Export", ... }' },
          { status: 400, label: 'Invalid credentials', body: '{ "error": "Missing required credential: serviceRoleKey" }' }
        ]
      },
      {
        method: 'GET',
        path: '/api/v1/providers/{providerAccountId}',
        summary: 'Get provider account details',
        auth: 'API key or Session (admin/ops)',
        pathParams: [{ name: 'providerAccountId', type: 'UUID', required: true, description: 'Provider ID' }],
        responses: [
          { status: 200, label: 'Provider', body: '{ "id": "uuid", ... }' },
          { status: 404, label: 'Not found', body: '{ "error": "Provider account not found" }' }
        ]
      },
      {
        method: 'PATCH',
        path: '/api/v1/providers/{providerAccountId}',
        summary: 'Update provider account',
        auth: 'API key or Session + CSRF (admin/ops)',
        pathParams: [{ name: 'providerAccountId', type: 'UUID', required: true, description: 'Provider ID' }],
        bodyExample: '{ "isActive": false }',
        responses: [
          { status: 200, label: 'Updated', body: '{ "id": "uuid", "isActive": false, ... }' }
        ]
      },
      {
        method: 'POST',
        path: '/api/v1/providers/{providerAccountId}/test-connection',
        summary: 'Run a provider health check',
        auth: 'API key or Session + CSRF (admin/ops)',
        pathParams: [{ name: 'providerAccountId', type: 'UUID', required: true, description: 'Provider ID' }],
        responses: [
          { status: 200, label: 'Healthy', body: '{ "healthy": true }' },
          { status: 200, label: 'Unhealthy', body: '{ "healthy": false, "error": "ROCKETREACH — 402 Payment Required" }' }
        ]
      },
      {
        method: 'POST',
        path: '/api/v1/providers/{providerAccountId}/bind-project',
        summary: 'Bind provider to a project role',
        auth: 'API key or Session + CSRF (admin/ops)',
        pathParams: [{ name: 'providerAccountId', type: 'UUID', required: true, description: 'Provider ID' }],
        bodyExample: '{ "projectId": "uuid" }',
        responses: [
          { status: 200, label: 'Bound', body: '{ "projectId": "uuid", "providerAccountId": "uuid" }' }
        ]
      },
      {
        method: 'GET',
        path: '/api/v1/providers/{providerAccountId}/linkedin/oauth/authorize',
        summary: 'Initiate LinkedIn 3-legged OAuth authorization',
        description: 'Returns an authorization URL for the admin to visit in a browser. After the admin grants permissions on LinkedIn, they are redirected back to the callback endpoint. Used for SALES_NAV_WEBHOOK providers.',
        auth: 'Session cookie or API key (admin/ops)',
        pathParams: [{ name: 'providerAccountId', type: 'UUID', required: true, description: 'LinkedIn Sales Nav provider account ID' }],
        responses: [
          { status: 200, label: 'Authorization URL', body: '{\n  "authorizationUrl": "https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=...&redirect_uri=...&state=...&scope=...",\n  "state": "random-state-value"\n}' },
          { status: 400, label: 'Not a LinkedIn provider', body: '{ "error": "Provider is not a SALES_NAV_WEBHOOK type" }' }
        ],
        notes: 'The admin must open the authorizationUrl in a browser to complete the OAuth flow.'
      },
      {
        method: 'GET',
        path: '/api/v1/providers/linkedin/oauth/callback',
        summary: 'LinkedIn OAuth callback (browser redirect)',
        description: 'LinkedIn redirects here after the admin authorizes. Exchanges the authorization code for access and refresh tokens, stores them on the provider account, and redirects to the admin UI. This endpoint is unauthenticated — it is called by the browser redirect from LinkedIn.',
        auth: 'None (browser redirect from LinkedIn)',
        queryParams: [
          { name: 'code', type: 'string', required: true, description: 'Authorization code from LinkedIn' },
          { name: 'state', type: 'string', required: true, description: 'State parameter for CSRF protection' }
        ],
        responses: [
          { status: 302, label: 'Redirect to admin UI', body: '(Redirects to /admin/providers with success status)' },
          { status: 400, label: 'Invalid state or code', body: '{ "error": "Invalid or expired state parameter" }' }
        ],
        notes: 'This redirect URI must be registered in the LinkedIn Developer Portal under the app\'s Auth tab → Authorized redirect URLs. Access tokens last 60 days, refresh tokens 365 days.'
      },
      {
        method: 'GET',
        path: '/api/v1/providers/{providerAccountId}/linkedin/oauth/status',
        summary: 'Check LinkedIn OAuth connection status',
        description: 'Returns the current OAuth status for a Lead Sync API provider, including token expiration dates and granted scopes.',
        auth: 'Session cookie or API key (admin/ops)',
        pathParams: [{ name: 'providerAccountId', type: 'UUID', required: true, description: 'LinkedIn Sales Nav provider account ID' }],
        responses: [
          { status: 200, label: 'Connected', body: '{\n  "status": "connected",\n  "accessTokenExpiresAt": "2026-05-16T12:00:00.000Z",\n  "refreshTokenExpiresAt": "2027-03-17T12:00:00.000Z",\n  "scope": "r_sales_nav_analytics r_organization_leads"\n}' },
          { status: 200, label: 'Not connected', body: '{\n  "status": "not_connected",\n  "accessTokenExpiresAt": null,\n  "refreshTokenExpiresAt": null,\n  "scope": null\n}' },
          { status: 200, label: 'Expired', body: '{\n  "status": "expired",\n  "accessTokenExpiresAt": "2026-01-15T12:00:00.000Z",\n  "refreshTokenExpiresAt": "2026-03-01T12:00:00.000Z",\n  "scope": "r_sales_nav_analytics r_organization_leads"\n}' }
        ],
        notes: 'Status values: not_connected (OAuth not completed), connected (valid tokens, auto-refreshed), expired (re-authorization required).'
      }
    ]
  },

  /* ---- API Keys ---- */
  {
    title: 'API Keys',
    description: 'Create and manage personal platform API keys. These endpoints require a browser session (not API key auth).',
    endpoints: [
      {
        method: 'GET',
        path: '/api/v1/api-keys',
        summary: 'List your API keys',
        auth: 'Session cookie',
        responses: [
          { status: 200, label: 'Key list', body: '[\n  {\n    "id": "uuid",\n    "name": "Postman",\n    "keyPrefix": "slk_abc12",\n    "scopes": ["read:projects", "read:leads"],\n    "lastUsedAt": null,\n    "expiresAt": null,\n    "revokedAt": null,\n    "createdAt": "ISO"\n  }\n]' }
        ]
      },
      {
        method: 'POST',
        path: '/api/v1/api-keys',
        summary: 'Create a new API key',
        description: 'The full key is returned only once in the response. Store it securely.',
        auth: 'Session cookie + CSRF',
        bodyParams: [
          { name: 'name', type: 'string', required: true, description: 'Human label for the key' },
          { name: 'scopes', type: 'string[]', description: 'read:projects, read:leads, write:projects, write:leads, admin:providers' },
          { name: 'expiresAt', type: 'ISO date', description: 'Optional expiry' }
        ],
        bodyExample: '{\n  "name": "CI Pipeline",\n  "scopes": ["read:projects", "read:leads"]\n}',
        responses: [
          { status: 201, label: 'Created (key shown once)', body: '{\n  "id": "uuid",\n  "name": "CI Pipeline",\n  "keyPrefix": "slk_abc12",\n  "fullKey": "slk_abc12.xxxxxxxxxx",\n  "scopes": ["read:projects", "read:leads"],\n  "expiresAt": null,\n  "createdAt": "ISO"\n}' }
        ],
        notes: 'The fullKey field is only returned on creation. Copy it immediately.'
      },
      {
        method: 'POST',
        path: '/api/v1/api-keys/{apiKeyId}/revoke',
        summary: 'Revoke an API key',
        auth: 'Session cookie + CSRF',
        pathParams: [{ name: 'apiKeyId', type: 'UUID', required: true, description: 'API key ID' }],
        responses: [
          { status: 200, label: 'Revoked', body: '{ "id": "uuid", "revokedAt": "ISO" }' }
        ]
      }
    ]
  },

  /* ---- Callers ---- */
  {
    title: 'Callers',
    description: 'Manage caller (phone agent) profiles and their performance metrics.',
    endpoints: [
      {
        method: 'POST',
        path: '/api/v1/callers',
        summary: 'Create a caller profile',
        auth: 'Session (admin/ops)',
        bodyParams: [
          { name: 'email', type: 'string', required: true, description: 'Caller email' },
          { name: 'name', type: 'string', required: true, description: 'Caller name' },
          { name: 'timezone', type: 'string', required: true, description: 'IANA timezone' },
          { name: 'languageCodes', type: 'string[]', required: true, description: 'ISO language codes' },
          { name: 'regionIsoCodes', type: 'string[]', required: true, description: 'Region/country codes' }
        ],
        bodyExample: '{\n  "email": "caller@example.com",\n  "name": "John Doe",\n  "timezone": "America/New_York",\n  "languageCodes": ["en"],\n  "regionIsoCodes": ["US"]\n}',
        responses: [
          { status: 201, label: 'Created', body: '{ "id": "uuid", "email": "caller@example.com", ... }' }
        ]
      },
      {
        method: 'GET',
        path: '/api/v1/callers/{callerId}',
        summary: 'Get a caller',
        auth: 'Session (admin/ops)',
        pathParams: [{ name: 'callerId', type: 'UUID', required: true, description: 'Caller ID' }],
        responses: [
          { status: 200, label: 'Caller', body: '{ "id": "uuid", "name": "...", ... }' }
        ]
      },
      {
        method: 'PATCH',
        path: '/api/v1/callers/{callerId}',
        summary: 'Update a caller',
        auth: 'Session + CSRF (admin/ops)',
        pathParams: [{ name: 'callerId', type: 'UUID', required: true, description: 'Caller ID' }],
        bodyExample: '{ "name": "Jane Doe" }',
        responses: [
          { status: 200, label: 'Updated', body: '{ "id": "uuid", "name": "Jane Doe", ... }' }
        ]
      },
      {
        method: 'GET',
        path: '/api/v1/callers/{callerId}/performance/latest',
        summary: 'Latest performance metrics for a caller',
        auth: 'Session (admin/ops)',
        pathParams: [{ name: 'callerId', type: 'UUID', required: true, description: 'Caller ID' }],
        responses: [
          { status: 200, label: 'Snapshot', body: '{ "callerId": "uuid", "period": "daily", "callsMade": 50, "signups": 5, ... }' }
        ]
      }
    ]
  },

  /* ---- Call Tasks ---- */
  {
    title: 'Call Tasks',
    description: 'Caller task assignment and operator task management.',
    endpoints: [
      {
        method: 'GET',
        path: '/api/v1/call-tasks/current',
        summary: 'Fetch assigned task for caller',
        auth: 'Session (caller)',
        responses: [
          { status: 200, label: 'Task', body: '{ "id": "uuid", "expert": { ... }, "project": { ... } }' },
          { status: 204, label: 'No tasks', body: '' }
        ]
      },
      {
        method: 'POST',
        path: '/api/v1/call-tasks/{taskId}/outcome',
        summary: 'Submit call outcome',
        auth: 'Session + CSRF (caller)',
        pathParams: [{ name: 'taskId', type: 'UUID', required: true, description: 'Task ID' }],
        bodyParams: [
          { name: 'outcome', type: 'enum', required: true, description: 'INTERESTED_SIGNUP_LINK_SENT | RETRYABLE_REJECTION | NEVER_CONTACT_AGAIN' }
        ],
        bodyExample: '{ "outcome": "INTERESTED_SIGNUP_LINK_SENT" }',
        responses: [
          { status: 200, label: 'Accepted', body: '{ "accepted": true }' }
        ]
      },
      {
        method: 'GET',
        path: '/api/v1/call-tasks/operator/tasks',
        summary: 'List tasks with filters (operator view)',
        auth: 'Session (admin/ops)',
        queryParams: [
          { name: 'status', type: 'enum', description: 'Filter by task status' },
          { name: 'projectId', type: 'UUID', description: 'Filter by project' },
          { name: 'limit', type: 'number', description: '1–100' }
        ],
        responses: [
          { status: 200, label: 'Tasks', body: '[ { "id": "uuid", "status": "PENDING", "expert": { ... } } ]' }
        ]
      },
      {
        method: 'POST',
        path: '/api/v1/call-tasks/operator/tasks/{taskId}/requeue',
        summary: 'Requeue a task for reassignment',
        auth: 'Session + CSRF (admin/ops)',
        pathParams: [{ name: 'taskId', type: 'UUID', required: true, description: 'Task ID' }],
        bodyExample: '{ "reason": "Caller unavailable" }',
        responses: [
          { status: 200, label: 'Requeued', body: '{ "accepted": true }' }
        ]
      }
    ]
  },

  /* ---- Outreach ---- */
  {
    title: 'Outreach',
    description: 'Send messages through configured channels and manage outreach threads.',
    endpoints: [
      {
        method: 'POST',
        path: '/api/v1/outreach/send',
        summary: 'Queue an outreach message',
        auth: 'Session + CSRF (admin/ops)',
        bodyParams: [
          { name: 'projectId', type: 'UUID', required: true, description: 'Project ID' },
          { name: 'expertId', type: 'UUID', required: true, description: 'Expert ID' },
          { name: 'channel', type: 'enum', required: true, description: 'EMAIL | PHONE | LINKEDIN | WHATSAPP | SMS | ...' },
          { name: 'recipient', type: 'string', required: true, description: 'Email, phone, or handle' },
          { name: 'body', type: 'string', required: true, description: 'Message content' },
          { name: 'overrideCooldown', type: 'boolean', description: 'Skip cooldown period' }
        ],
        bodyExample: '{\n  "projectId": "uuid",\n  "expertId": "uuid",\n  "channel": "EMAIL",\n  "recipient": "jane@example.com",\n  "body": "Hello, we have an opportunity..."\n}',
        responses: [
          { status: 202, label: 'Queued', body: '{ "accepted": true, "jobId": "uuid" }' },
          { status: 429, label: 'Cooldown active', body: '{ "error": "Cooldown active for this expert" }' }
        ]
      },
      {
        method: 'GET',
        path: '/api/v1/admin/outreach/threads',
        summary: 'List outreach threads',
        auth: 'Session (admin/ops)',
        responses: [
          { status: 200, label: 'Threads', body: '[ { "id": "uuid", "channel": "EMAIL", "status": "ACTIVE", ... } ]' }
        ]
      },
      {
        method: 'PATCH',
        path: '/api/v1/admin/outreach/threads/{threadId}',
        summary: 'Update thread status',
        auth: 'Session + CSRF (admin/ops)',
        pathParams: [{ name: 'threadId', type: 'UUID', required: true, description: 'Thread ID' }],
        bodyExample: '{ "status": "CLOSED" }',
        responses: [
          { status: 200, label: 'Updated', body: '{ "id": "uuid", "status": "CLOSED" }' }
        ]
      }
    ]
  },

  /* ---- Screening ---- */
  {
    title: 'Screening',
    description: 'Dispatch screening questions to experts and manage responses.',
    endpoints: [
      {
        method: 'GET',
        path: '/api/v1/projects/:projectId/available-channels',
        summary: 'List outreach channels available for a project',
        auth: 'Session (admin/ops)',
        bodyExample: '',
        responses: [
          { status: 200, label: 'Channels', body: '[{ "channel": "EMAIL", "label": "Email" }, { "channel": "WHATSAPP", "label": "WhatsApp" }]' }
        ]
      },
      {
        method: 'POST',
        path: '/api/v1/screening/dispatch',
        summary: 'Dispatch screening to an expert via chosen channel. Transitions lead to SCREENING status.',
        auth: 'Session + CSRF (admin/ops)',
        bodyExample: '{ "projectId": "uuid", "expertId": "uuid", "channel": "WHATSAPP" }',
        responses: [
          { status: 200, label: 'Sent', body: '{ "sent": 4 }' }
        ]
      },
      {
        method: 'POST',
        path: '/api/v1/screening/response',
        summary: 'Record a screening response',
        auth: 'Session + CSRF (admin/ops)',
        bodyExample: '{\n  "projectId": "uuid",\n  "expertId": "uuid",\n  "questionId": "uuid",\n  "responseText": "Yes, I have 10 years of experience"\n}',
        responses: [
          { status: 200, label: 'Recorded', body: '{ "accepted": true }' }
        ]
      },
      {
        method: 'GET',
        path: '/api/v1/admin/screening/responses',
        summary: 'List screening responses',
        auth: 'Session (admin/ops)',
        queryParams: [
          { name: 'projectId', type: 'UUID', description: 'Filter by project' },
          { name: 'status', type: 'string', description: 'Comma-separated statuses (PENDING, IN_PROGRESS, COMPLETE, ESCALATED)' }
        ],
        responses: [
          { status: 200, label: 'Responses', body: '[ { "id": "uuid", "responseText": "...", "status": "PENDING", "question": {...}, "expert": {...} } ]' }
        ]
      },
      {
        method: 'PATCH',
        path: '/api/v1/admin/screening/{responseId}',
        summary: 'Update a screening response',
        auth: 'Session + CSRF (admin/ops)',
        pathParams: [{ name: 'responseId', type: 'UUID', required: true, description: 'Response ID' }],
        bodyExample: '{ "status": "COMPLETE", "responseText": "Updated text" }',
        responses: [
          { status: 200, label: 'Updated', body: '{ "id": "uuid", "status": "COMPLETE", ... }' }
        ]
      },
      {
        method: 'POST',
        path: '/api/v1/admin/screening/{responseId}/follow-up',
        summary: 'Send a follow-up reminder',
        description: 'Sends a reminder message to the expert for pending screening questions in the same project.',
        auth: 'Session + CSRF (admin/ops)',
        pathParams: [{ name: 'responseId', type: 'UUID', required: true, description: 'Response ID' }],
        responses: [
          { status: 200, label: 'Sent', body: '{ "ok": true }' }
        ]
      },
      {
        method: 'POST',
        path: '/api/v1/admin/screening/{responseId}/escalate',
        summary: 'Escalate to phone call',
        description: 'Sets the response to ESCALATED and creates a PENDING call task for a caller to follow up.',
        auth: 'Session + CSRF (admin/ops)',
        pathParams: [{ name: 'responseId', type: 'UUID', required: true, description: 'Response ID' }],
        responses: [
          { status: 200, label: 'Escalated', body: '{ "ok": true }' }
        ]
      }
    ]
  },

  /* ---- Notifications ---- */
  {
    title: 'Notifications',
    description: 'In-app notification management.',
    endpoints: [
      {
        method: 'GET',
        path: '/api/v1/notifications',
        summary: 'List notifications',
        auth: 'Session (admin/ops)',
        queryParams: [
          { name: 'unreadOnly', type: 'true | false', description: 'Only unread' },
          { name: 'limit', type: 'number', description: 'Max 100' },
          { name: 'offset', type: 'number', description: 'Pagination offset' }
        ],
        responses: [
          { status: 200, label: 'Notifications', body: '[ { "id": "uuid", "type": "PROVIDER_ERROR", "title": "...", "readAt": null } ]' }
        ]
      },
      {
        method: 'GET',
        path: '/api/v1/notifications/unread-count',
        summary: 'Get unread notification count',
        auth: 'Session (admin/ops)',
        responses: [
          { status: 200, label: 'Count', body: '{ "count": 5 }' }
        ]
      },
      {
        method: 'POST',
        path: '/api/v1/notifications/mark-read',
        summary: 'Mark specific notifications as read',
        auth: 'Session + CSRF (admin/ops)',
        bodyExample: '{ "ids": ["uuid-1", "uuid-2"] }',
        responses: [
          { status: 200, label: 'OK', body: '{ "ok": true }' }
        ]
      },
      {
        method: 'POST',
        path: '/api/v1/notifications/mark-all-read',
        summary: 'Mark all notifications as read',
        auth: 'Session + CSRF (admin/ops)',
        responses: [
          { status: 200, label: 'OK', body: '{ "ok": true }' }
        ]
      }
    ]
  },

  /* ---- Users ---- */
  {
    title: 'Users',
    description: 'Admin-only user management (create, list, update, delete).',
    endpoints: [
      {
        method: 'GET',
        path: '/api/v1/users',
        summary: 'List users',
        auth: 'Session (admin only)',
        responses: [
          { status: 200, label: 'Users', body: '[ { "id": "uuid", "email": "...", "name": "...", "role": "ADMIN" } ]' }
        ]
      },
      {
        method: 'POST',
        path: '/api/v1/users',
        summary: 'Create a user',
        auth: 'Session + CSRF (admin only)',
        bodyParams: [
          { name: 'email', type: 'string', required: true, description: 'User email' },
          { name: 'name', type: 'string', required: true, description: 'User name' },
          { name: 'password', type: 'string', required: true, description: 'Initial password' },
          { name: 'role', type: 'enum', description: 'ADMIN | OPS | CALLER (default CALLER)' }
        ],
        bodyExample: '{\n  "email": "ops@example.com",\n  "name": "Ops User",\n  "password": "secret123",\n  "role": "OPS"\n}',
        responses: [
          { status: 201, label: 'Created', body: '{ "id": "uuid", "email": "ops@example.com", "role": "OPS" }' },
          { status: 409, label: 'Duplicate', body: '{ "error": "User with this email already exists" }' }
        ]
      },
      {
        method: 'GET',
        path: '/api/v1/users/{userId}',
        summary: 'Get a user',
        auth: 'Session (admin only)',
        pathParams: [{ name: 'userId', type: 'UUID', required: true, description: 'User ID' }],
        responses: [
          { status: 200, label: 'User', body: '{ "id": "uuid", "email": "...", "name": "...", "role": "OPS" }' }
        ]
      },
      {
        method: 'PATCH',
        path: '/api/v1/users/{userId}',
        summary: 'Update a user',
        auth: 'Session + CSRF (admin only)',
        pathParams: [{ name: 'userId', type: 'UUID', required: true, description: 'User ID' }],
        bodyExample: '{ "role": "ADMIN" }',
        responses: [
          { status: 200, label: 'Updated', body: '{ "id": "uuid", "role": "ADMIN", ... }' }
        ]
      },
      {
        method: 'DELETE',
        path: '/api/v1/users/{userId}',
        summary: 'Soft-delete a user',
        auth: 'Session + CSRF (admin only)',
        pathParams: [{ name: 'userId', type: 'UUID', required: true, description: 'User ID' }],
        responses: [
          { status: 200, label: 'Deleted', body: '{ "id": "uuid", "deletedAt": "ISO" }' }
        ]
      }
    ]
  },

  /* ---- Admin Dashboard & Observability ---- */
  {
    title: 'Admin Dashboard & Observability',
    description: 'Operational dashboards, ranking, call board, and observability queries.',
    endpoints: [
      {
        method: 'GET',
        path: '/api/v1/admin/dashboard-stats',
        summary: 'Dashboard statistics',
        auth: 'Session (admin/ops)',
        responses: [
          { status: 200, label: 'Stats', body: '{ "totalLeads": 500, "totalProjects": 10, "activeProviders": 8, ... }' }
        ]
      },
      {
        method: 'GET',
        path: '/api/v1/admin/call-board',
        summary: 'Call board with tasks, callers, and metrics',
        auth: 'Session (admin/ops)',
        responses: [
          { status: 200, label: 'Board', body: '{ "tasks": [...], "callers": [...], "metrics": { ... } }' }
        ]
      },
      {
        method: 'GET',
        path: '/api/v1/admin/ranking/latest',
        summary: 'Latest ranking snapshots',
        auth: 'Session (admin/ops)',
        queryParams: [{ name: 'projectId', type: 'UUID', description: 'Filter by project' }],
        responses: [
          { status: 200, label: 'Rankings', body: '[ { "callerId": "uuid", "score": 95.2, ... } ]' }
        ]
      },
      {
        method: 'GET',
        path: '/api/v1/admin/observability/dlq',
        summary: 'Dead letter queue jobs',
        auth: 'Session (admin/ops)',
        responses: [{ status: 200, label: 'DLQ', body: '[ { "jobId": "...", "queue": "enrichment", "error": "..." } ]' }]
      },
      {
        method: 'GET',
        path: '/api/v1/admin/observability/webhooks',
        summary: 'Processed webhook events',
        auth: 'Session (admin/ops)',
        responses: [{ status: 200, label: 'Events', body: '[ { "id": "uuid", "source": "yay", "processedAt": "ISO" } ]' }]
      },
      {
        method: 'GET',
        path: '/api/v1/admin/observability/provider-limits',
        summary: 'Provider rate-limit / credit events',
        auth: 'Session (admin/ops)',
        responses: [{ status: 200, label: 'Events', body: '[ { "provider": "ROCKETREACH", "event": "QUARANTINED", ... } ]' }]
      },
      {
        method: 'GET',
        path: '/api/v1/admin/cooldown-logs',
        summary: 'List recent cooldown enforcement logs',
        auth: 'Session (admin/ops)',
        queryParams: [
          { name: 'limit', type: 'number', description: 'Max 200, default 50' },
          { name: 'projectId', type: 'UUID', description: 'Filter by project' }
        ],
        responses: [
          { status: 200, label: 'Logs', body: '[\n  { "id": "uuid", "expertId": "uuid", "projectId": "uuid", "action": "BLOCKED", "createdAt": "ISO", "expert": { "fullName": "..." }, "project": { "name": "..." } }\n]' }
        ]
      },
      {
        method: 'GET',
        path: '/api/v1/admin/ping',
        summary: 'Admin health ping',
        auth: 'Session (admin only)',
        responses: [{ status: 200, label: 'OK', body: '{ "status": "admin-ok" }' }]
      }
    ]
  },

  /* ---- Other ---- */
  {
    title: 'Other Endpoints',
    description: 'Documentation generation, job title discovery, and machine-readable contracts.',
    endpoints: [
      {
        method: 'POST',
        path: '/api/v1/documentation/generate',
        summary: 'Enqueue documentation generation job',
        auth: 'Session + CSRF (admin/ops)',
        responses: [{ status: 202, label: 'Accepted', body: '{ "accepted": true, "jobId": "uuid" }' }]
      },
      {
        method: 'POST',
        path: '/api/v1/job-title-discovery/trigger',
        summary: 'Trigger job title discovery',
        auth: 'Session + CSRF (admin/ops)',
        bodyExample: '{\n  "projectId": "uuid",\n  "companies": [{ "companyName": "Acme Corp" }],\n  "geographyIsoCodes": ["US"]\n}',
        responses: [{ status: 202, label: 'Accepted', body: '{ "accepted": true }' }]
      },
      {
        method: 'GET',
        path: '/api/v1/openapi.json',
        summary: 'Download OpenAPI 3.1.0 spec',
        auth: 'None',
        responses: [{ status: 200, label: 'JSON', body: '{ "openapi": "3.1.0", ... }' }]
      },
      {
        method: 'GET',
        path: '/api/v1/docs/postman-collection',
        summary: 'Download Postman collection file',
        auth: 'None',
        responses: [{ status: 200, label: 'JSON file download', body: '(Postman Collection v2.1 JSON)' }]
      }
    ]
  },

  /* ---- Webhooks ---- */
  {
    title: 'Webhooks',
    description: 'Inbound webhook receivers for third-party integrations. These are NOT called by users — they are registered with the external services.',
    endpoints: [
      {
        method: 'POST',
        path: '/webhooks/yay/{providerAccountId}',
        summary: 'Yay.com call event webhook',
        auth: 'HMAC signature (x-yay-signature, x-yay-timestamp, x-yay-event-id)',
        pathParams: [{ name: 'providerAccountId', type: 'UUID', required: true, description: 'Yay provider' }],
        responses: [
          { status: 200, label: 'Accepted', body: '{ "accepted": true }' },
          { status: 200, label: 'Duplicate', body: '{ "accepted": false, "reason": "duplicate" }' },
          { status: 401, label: 'Bad signature', body: '{ "error": "Invalid webhook signature" }' }
        ]
      },
      {
        method: 'POST',
        path: '/webhooks/sales-nav/{providerAccountId}',
        summary: 'Lead Sync API lead ingestion',
        auth: 'Bearer token or x-sales-nav-client-id header',
        pathParams: [{ name: 'providerAccountId', type: 'UUID', required: true, description: 'Sales Nav provider' }],
        responses: [
          { status: 200, label: 'Processed', body: '{ "accepted": true }' }
        ]
      },
      {
        method: 'POST',
        path: '/webhooks/sales-nav/{providerAccountId}/notification',
        summary: 'Lead Sync API notification webhook',
        auth: 'LinkedIn signature verification',
        pathParams: [{ name: 'providerAccountId', type: 'UUID', required: true, description: 'Sales Nav provider' }],
        responses: [
          { status: 200, label: 'OK', body: '' }
        ]
      },
      {
        method: 'POST',
        path: '/webhooks/twilio/{providerAccountId}',
        summary: 'Twilio inbound SMS / voicemail',
        description: 'Receives inbound SMS messages. Resolves sender to expert, records reply on outreach thread, and auto-matches pending screening responses.',
        auth: 'x-twilio-signature HMAC-SHA1',
        pathParams: [{ name: 'providerAccountId', type: 'UUID', required: true, description: 'Twilio provider' }],
        responses: [
          { status: 200, label: 'TwiML', body: '<Response/>' }
        ]
      },
      {
        method: 'POST',
        path: '/webhooks/sendgrid/{providerAccountId}',
        summary: 'SendGrid inbound email parse',
        description: 'Receives inbound emails via SendGrid Inbound Parse. Resolves sender to expert and records reply.',
        auth: 'HTTP Basic Auth (inboundParseVerificationKey)',
        pathParams: [{ name: 'providerAccountId', type: 'UUID', required: true, description: 'Email provider' }],
        responses: [
          { status: 200, label: 'Accepted', body: '{ "accepted": true }' }
        ]
      },
      {
        method: 'POST',
        path: '/webhooks/2chat/{providerAccountId}',
        summary: '2Chat WhatsApp inbound message',
        description: 'Receives WhatsApp replies via 2Chat. Resolves sender phone to expert and records reply.',
        auth: 'X-User-API-Key header',
        pathParams: [{ name: 'providerAccountId', type: 'UUID', required: true, description: '2Chat provider' }],
        responses: [
          { status: 200, label: 'Accepted', body: '{ "accepted": true }' }
        ]
      },
      {
        method: 'POST',
        path: '/webhooks/respondio/{providerAccountId}',
        summary: 'Respond.io inbound message',
        auth: 'Authorization: Bearer (apiKey)',
        pathParams: [{ name: 'providerAccountId', type: 'UUID', required: true, description: 'Respond.io provider' }],
        responses: [
          { status: 200, label: 'Accepted', body: '{ "accepted": true }' }
        ]
      },
      {
        method: 'POST',
        path: '/webhooks/telegram/{providerAccountId}',
        summary: 'Telegram bot inbound message',
        auth: 'X-Telegram-Bot-Api-Secret-Token header',
        pathParams: [{ name: 'providerAccountId', type: 'UUID', required: true, description: 'Telegram provider' }],
        responses: [
          { status: 200, label: 'Accepted', body: '{ "accepted": true }' }
        ]
      },
      {
        method: 'POST',
        path: '/webhooks/line/{providerAccountId}',
        summary: 'LINE Messaging API inbound',
        auth: 'x-line-signature HMAC-SHA256',
        pathParams: [{ name: 'providerAccountId', type: 'UUID', required: true, description: 'LINE provider' }],
        responses: [
          { status: 200, label: 'Accepted', body: '{ "accepted": true }' }
        ]
      },
      {
        method: 'POST',
        path: '/webhooks/viber/{providerAccountId}',
        summary: 'Viber bot inbound message',
        auth: 'X-Viber-Content-Signature HMAC-SHA256',
        pathParams: [{ name: 'providerAccountId', type: 'UUID', required: true, description: 'Viber provider' }],
        responses: [
          { status: 200, label: 'Accepted', body: '{ "accepted": true }' }
        ]
      },
      {
        method: 'POST',
        path: '/webhooks/kakaotalk/{providerAccountId}',
        summary: 'KakaoTalk chatbot skill webhook',
        auth: 'Authorization: KakaoAK (apiKey)',
        pathParams: [{ name: 'providerAccountId', type: 'UUID', required: true, description: 'KakaoTalk provider' }],
        responses: [
          { status: 200, label: 'Accepted', body: '{ "accepted": true }' }
        ]
      },
      {
        method: 'POST',
        path: '/webhooks/wechat/{providerAccountId}',
        summary: 'WeChat Official Account inbound message',
        auth: 'SHA1 signature (token + timestamp + nonce)',
        pathParams: [{ name: 'providerAccountId', type: 'UUID', required: true, description: 'WeChat provider' }],
        responses: [
          { status: 200, label: 'Success', body: 'success' }
        ]
      }
    ]
  }
];

/* ------------------------------------------------------------------ */
/*  Troubleshooting data                                               */
/* ------------------------------------------------------------------ */

const troubleshootingItems = [
  {
    problem: '401 Unauthorized on every request',
    solution: 'For API key auth, ensure you\'re sending `Authorization: Bearer slk_xxxxx.yyyyy` or `x-api-key: slk_xxxxx.yyyyy`. For browser sessions, make sure the `access_token` cookie is present (login first).'
  },
  {
    problem: '403 Forbidden — CSRF token missing',
    solution: 'Mutating requests (POST/PATCH/DELETE) with a session cookie require an `x-csrf-token` header. Get a fresh token from `GET /api/v1/auth/csrf`.'
  },
  {
    problem: '403 Forbidden — insufficient scopes',
    solution: 'Your API key may not have the required scopes. Create a new key with the needed scopes from Admin → API Keys.'
  },
  {
    problem: '404 on /api/v1/projects/{id}',
    solution: 'The project may have been soft-deleted (archived). Verify the project ID is correct and hasn\'t been deleted.'
  },
  {
    problem: '429 Too Many Requests',
    solution: 'The API allows 600 requests per minute. Back off and retry with exponential delay.'
  },
  {
    problem: '500 Internal Server Error',
    solution: 'Check the backend API logs at `/tmp/sl-api.log`. Common causes: missing Prisma migration (`npx prisma migrate deploy`), Redis down, or bad provider credentials.'
  },
  {
    problem: 'Provider health check returns unhealthy',
    solution: 'Verify the provider credentials are correct and the account has credits. Providers with repeated failures are automatically marked unhealthy and skipped. Re-activate from the Providers page after fixing credentials.'
  },
  {
    problem: 'Leads show "Enriched" but no email/phone',
    solution: 'Hover over the Enriched badge to see which providers were tried. If all providers failed or returned no data, check provider health on the Providers page.'
  },
  {
    problem: 'Supabase sync not writing rows',
    solution: 'Ensure the Supabase provider is bound to the project, the table name and schema match, and the service_role key has INSERT permissions. Run a health check on the provider.'
  }
];

/* ------------------------------------------------------------------ */
/*  Error reference data                                               */
/* ------------------------------------------------------------------ */

const errorCodes = [
  { status: 400, meaning: 'Bad Request — invalid JSON or validation error. Check the error message for field details.' },
  { status: 401, meaning: 'Unauthorized — no valid session cookie or API key provided.' },
  { status: 403, meaning: 'Forbidden — valid auth but insufficient role, scopes, or missing CSRF token.' },
  { status: 404, meaning: 'Not Found — the requested resource does not exist or has been soft-deleted.' },
  { status: 409, meaning: 'Conflict — duplicate resource (e.g., user with same email).' },
  { status: 429, meaning: 'Too Many Requests — rate limit exceeded. Wait and retry.' },
  { status: 500, meaning: 'Internal Server Error — unexpected failure. Check server logs.' },
  { status: 503, meaning: 'Service Unavailable — database or Redis is down.' }
];

/* ------------------------------------------------------------------ */
/*  Components                                                         */
/* ------------------------------------------------------------------ */

function MethodBadge({ method }: { method: HttpMethod }): JSX.Element {
  return (
    <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-bold tracking-wide ${METHOD_COLOR[method]}`}>
      {method}
    </span>
  );
}

function CodeBlock({ code }: { code: string }): JSX.Element {
  return (
    <pre className="overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs leading-relaxed text-slate-100">
      {code}
    </pre>
  );
}

function ParamTable({ title, params }: { title: string; params: Param[] }): JSX.Element {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</p>
      <div className="overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 text-left text-slate-600">
              <th className="px-3 py-1.5 font-medium">Name</th>
              <th className="px-3 py-1.5 font-medium">Type</th>
              <th className="px-3 py-1.5 font-medium">Required</th>
              <th className="px-3 py-1.5 font-medium">Description</th>
            </tr>
          </thead>
          <tbody>
            {params.map((p) => (
              <tr key={p.name} className="border-t border-slate-100">
                <td className="px-3 py-1.5 font-mono text-primary">{p.name}</td>
                <td className="px-3 py-1.5 text-slate-500">{p.type}</td>
                <td className="px-3 py-1.5">{p.required ? <span className="text-red-500">Yes</span> : <span className="text-slate-400">No</span>}</td>
                <td className="px-3 py-1.5 text-slate-600">{p.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EndpointCard({ ep }: { ep: Endpoint }): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-xl border border-slate-200 bg-white transition hover:shadow-sm">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <MethodBadge method={ep.method} />
        <code className="flex-1 text-sm font-medium text-slate-800">{ep.path}</code>
        <span className="hidden text-xs text-slate-400 sm:inline">{ep.summary}</span>
        <span className={`material-symbols-outlined text-base text-slate-400 transition ${expanded ? 'rotate-180' : ''}`}>
          expand_more
        </span>
      </button>
      {expanded && (
        <div className="space-y-4 border-t border-slate-100 px-4 py-4">
          <p className="text-sm text-slate-600">{ep.description ?? ep.summary}</p>
          <div className="flex items-center gap-2">
            <Badge tone="neutral">{ep.auth}</Badge>
          </div>

          {ep.pathParams?.length ? <ParamTable title="Path parameters" params={ep.pathParams} /> : null}
          {ep.queryParams?.length ? <ParamTable title="Query parameters" params={ep.queryParams} /> : null}
          {ep.bodyParams?.length ? <ParamTable title="Request body" params={ep.bodyParams} /> : null}

          {ep.bodyExample ? (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">Example request body</p>
              <CodeBlock code={ep.bodyExample} />
            </div>
          ) : null}

          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">Responses</p>
            <div className="space-y-2">
              {ep.responses.map((r) => (
                <div key={`${r.status}-${r.label}`} className="rounded-lg border border-slate-100 p-3">
                  <div className="mb-1 flex items-center gap-2">
                    <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${r.status < 300 ? 'bg-emerald-50 text-emerald-700' : r.status < 500 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>
                      {r.status}
                    </span>
                    <span className="text-xs text-slate-500">{r.label}</span>
                  </div>
                  {r.body ? <CodeBlock code={r.body} /> : null}
                </div>
              ))}
            </div>
          </div>

          {ep.notes ? (
            <div className="rounded-lg border-l-4 border-amber-400 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <strong>Note:</strong> {ep.notes}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function FullApiDocsPage(): JSX.Element {
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const scrollToSection = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveSection(id);
    }
  }, []);

  const filteredGroups = groups.map((g) => {
    if (!searchQuery.trim()) return g;
    const q = searchQuery.toLowerCase();
    const matchingEndpoints = g.endpoints.filter(
      (ep) =>
        ep.path.toLowerCase().includes(q) ||
        ep.summary.toLowerCase().includes(q) ||
        ep.method.toLowerCase().includes(q)
    );
    return { ...g, endpoints: matchingEndpoints };
  }).filter((g) => g.endpoints.length > 0);

  const totalEndpoints = groups.reduce((sum, g) => sum + g.endpoints.length, 0);

  return (
    <div className="flex gap-6">
      {/* Sidebar nav */}
      <aside className="sticky top-20 hidden h-[calc(100vh-6rem)] w-56 shrink-0 overflow-y-auto lg:block">
        <p className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">API Reference</p>
        <nav className="space-y-0.5">
          {groups.map((g) => {
            const slug = g.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
            return (
              <button
                key={slug}
                onClick={() => scrollToSection(slug)}
                className={`block w-full rounded-lg px-3 py-1.5 text-left text-xs font-medium transition ${
                  activeSection === slug ? 'bg-primary/10 text-primary' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                }`}
              >
                {g.title}
                <span className="ml-1 text-slate-400">({g.endpoints.length})</span>
              </button>
            );
          })}
          <hr className="my-2 border-slate-100" />
          <button onClick={() => scrollToSection('errors')} className="block w-full rounded-lg px-3 py-1.5 text-left text-xs font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-700">
            Error Codes
          </button>
          <button onClick={() => scrollToSection('troubleshooting')} className="block w-full rounded-lg px-3 py-1.5 text-left text-xs font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-700">
            Troubleshooting
          </button>
          <button onClick={() => scrollToSection('downloads')} className="block w-full rounded-lg px-3 py-1.5 text-left text-xs font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-700">
            Downloads
          </button>
        </nav>
      </aside>

      {/* Main content */}
      <div className="min-w-0 flex-1 space-y-10">
        {/* Hero */}
        <div>
          <h1 className="text-3xl font-bold text-slate-900">API Documentation</h1>
          <p className="mt-2 text-sm text-slate-500">
            Complete reference for the Expert Sourcing Automation Platform REST API — {totalEndpoints} endpoints across {groups.length} groups.
          </p>
        </div>

        {/* Quick auth summary */}
        <Card className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-800">Authentication</h2>
          <div className="grid gap-4 text-sm text-slate-600 md:grid-cols-2">
            <div className="space-y-1">
              <p className="font-medium text-slate-700">Browser Session</p>
              <p>Login via <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">POST /api/v1/auth/login</code> to get a cookie. Pass <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">x-csrf-token</code> on mutating requests.</p>
            </div>
            <div className="space-y-1">
              <p className="font-medium text-slate-700">Personal API Key</p>
              <p>Create from <Link href="/admin/api-keys" className="text-primary hover:underline">API Keys</Link>. Send as <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">Authorization: Bearer slk_...</code> or <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">x-api-key: slk_...</code>.</p>
            </div>
          </div>
        </Card>

        {/* Search */}
        <div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search endpoints by path, method, or summary..."
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 shadow-sm placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        {/* Endpoint groups */}
        {filteredGroups.map((group) => {
          const slug = group.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
          return (
            <section key={slug} id={slug} className="scroll-mt-24 space-y-3">
              <div>
                <h2 className="text-xl font-bold text-slate-900">{group.title}</h2>
                <p className="text-sm text-slate-500">{group.description}</p>
              </div>
              <div className="space-y-2">
                {group.endpoints.map((ep) => (
                  <EndpointCard key={`${ep.method}-${ep.path}`} ep={ep} />
                ))}
              </div>
            </section>
          );
        })}

        {/* Error codes */}
        <section id="errors" className="scroll-mt-24 space-y-3">
          <h2 className="text-xl font-bold text-slate-900">Error Codes</h2>
          <p className="text-sm text-slate-500">
            All errors return a JSON body with an <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">error</code> field.
          </p>
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-slate-600">
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Meaning</th>
                </tr>
              </thead>
              <tbody>
                {errorCodes.map((ec) => (
                  <tr key={ec.status} className="border-t border-slate-100">
                    <td className="px-4 py-2">
                      <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${ec.status < 500 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>
                        {ec.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-slate-600">{ec.meaning}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <CodeBlock
            code={`// All error responses follow this shape:\n{\n  "error": "Human-readable error message",\n  "details": { ... }  // optional validation details\n}`}
          />
        </section>

        {/* Troubleshooting */}
        <section id="troubleshooting" className="scroll-mt-24 space-y-3">
          <h2 className="text-xl font-bold text-slate-900">Troubleshooting</h2>
          <div className="space-y-2">
            {troubleshootingItems.map((item) => (
              <details key={item.problem} className="group rounded-xl border border-slate-200 bg-white">
                <summary className="flex cursor-pointer items-center gap-3 px-4 py-3 text-sm font-medium text-slate-800 [&::-webkit-details-marker]:hidden">
                  <span className="material-symbols-outlined text-base text-amber-500">warning</span>
                  {item.problem}
                  <span className="material-symbols-outlined ml-auto text-base text-slate-400 transition group-open:rotate-180">expand_more</span>
                </summary>
                <div className="border-t border-slate-100 px-4 py-3 text-sm text-slate-600">
                  {item.solution}
                </div>
              </details>
            ))}
          </div>
        </section>

        {/* Downloads */}
        <section id="downloads" className="scroll-mt-24 space-y-3">
          <h2 className="text-xl font-bold text-slate-900">Downloads</h2>
          <Card className="space-y-3">
            <p className="text-sm text-slate-600">
              Machine-readable API contracts and a ready-to-import Postman collection for quick testing.
            </p>
            <div className="flex flex-wrap gap-3">
              <a
                href="/api/v1/openapi.json"
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                <span className="material-symbols-outlined text-lg">description</span>
                OpenAPI 3.1.0 JSON
              </a>
              <a
                href="/api/v1/docs/postman-collection"
                className="inline-flex items-center gap-2 rounded-lg border border-primary bg-primary px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-primary/90"
              >
                <span className="material-symbols-outlined text-lg">download</span>
                Postman Collection
              </a>
            </div>
            <p className="text-xs text-slate-400">
              Import the Postman collection, set the <code className="rounded bg-slate-100 px-1 py-0.5">baseUrl</code> variable, and paste your API key into the <code className="rounded bg-slate-100 px-1 py-0.5">token</code> variable.
            </p>
          </Card>
        </section>

        <div className="pb-8" />
      </div>
    </div>
  );
}
