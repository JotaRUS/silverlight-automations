# Expert Sourcing Automation Platform — Operations Manual

This manual covers operating the platform via its REST API, background processes, and optional Next.js frontend. You can interact through HTTP requests (curl, Postman, HTTPie, etc.) or through the web UI when the frontend is running.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Setup and Running](#2-setup-and-running)
3. [Authentication](#3-authentication)
4. [API Reference](#4-api-reference)
   - [System](#41-system)
   - [Auth](#42-auth)
   - [Projects](#43-projects)
   - [Callers](#44-callers)
   - [Call Tasks](#45-call-tasks)
   - [Job Title Discovery](#46-job-title-discovery)
   - [Outreach](#47-outreach)
   - [Screening](#48-screening)
   - [Worker Actions](#49-worker-actions)
   - [Documentation Generator](#410-documentation-generator)
   - [Webhooks](#411-webhooks)
   - [OpenAPI Spec](#412-openapi-spec)
5. [Background Processes](#5-background-processes)
   - [Worker Process](#51-worker-process)
   - [Scheduler Process](#52-scheduler-process)
6. [Queue Topology](#6-queue-topology)
7. [Data Model](#7-data-model)
8. [Lifecycle State Machines](#8-lifecycle-state-machines)
9. [Enrichment Pipeline](#9-enrichment-pipeline)
10. [Channel Reference](#10-channel-reference)
11. [Environment Variables](#11-environment-variables)
12. [Operational Recipes](#12-operational-recipes)
13. [Error Handling](#13-error-handling)
14. [Troubleshooting](#14-troubleshooting)
15. [Frontend Web UI](#15-frontend-web-ui)

---

## 1. Architecture Overview

The platform is composed of three long-running processes backed by PostgreSQL and Redis:

```text
                        +------------------------+
                        |   External Sources     |
                        | Apollo / Sales Nav     |
                        | 10 Enrichment Providers|
                        | 13 Messaging Channels  |
                        | Yay.com Webhooks       |
                        +-----------+------------+
                                    |
                                    v
+-----------------------------+   +-+---------------------------+
|        Express API          |-->| Validation + Auth + RBAC    |
| /api/v1/* + /webhooks/*     |   | Correlation + Rate Limiting |
+--------------+--------------+   +----+------------------------+
               |                       |
               | enqueue               | persist
               v                       v
     +---------+----------+     +------+---------------------+
     |  BullMQ Queues     |     | PostgreSQL (Prisma ORM)    |
     | 14 separated lanes |     | 30+ tables                 |
     +---------+----------+     +------+---------------------+
               |                       ^
               v                       |
      +--------+---------+            |
      |  Worker Process  |------------+
      | 14 workers       |
      +--------+---------+
               |
               v
      +--------+-----------+
      | Scheduler Process  |
      | 60s maintenance +  |
      | 5min auto-sourcing |
      +--------------------+
```

**Key guarantees:**

- Strict TypeScript with Zod validation on all inputs.
- JWT authentication with three roles: `admin`, `ops`, `caller`.
- Correlation IDs propagated through every request, log entry, and queue job.
- Idempotent webhook processing via `processed_webhook_events` deduplication table.
- Serializable transactions and advisory locks for identity-sensitive writes.
- Dead letter queue with 30-day retention and automatic archival.
- Rate limiting: 300 requests per 60 seconds globally.
- Request body limit: 1 MB.

---

## 2. Setup and Running

### Prerequisites

- Node.js >= 20
- Docker and Docker Compose (for PostgreSQL and Redis)

### Install dependencies

```bash
npm install
```

### Configure environment

```bash
cp .env.example .env
# Edit .env with real credentials
```

### Start Docker and the Four Processes

The platform requires Docker (for Redis and optionally PostgreSQL) plus four terminal processes. Follow these steps in order — each terminal stays open and running.

**Terminal 1 — Start Docker and infrastructure:**

```bash
# Open Docker Desktop first (macOS)
open -a Docker

# Wait until Docker is ready, then start Redis (and Postgres if not running locally)
docker compose up -d redis

# If you don't have a local PostgreSQL, also run:
# docker compose up -d postgres redis
```

Once Redis is running, run database migrations in this same terminal:

```bash
npm run db:migrate
```

**Terminal 2 — API server (port 3000):**

```bash
npm run dev
```

Wait until you see `server started` in the output before proceeding.

**Terminal 3 — Background workers:**

```bash
npm run dev:worker
```

This starts 14 queue workers that process all async jobs (enrichment, outreach, call validation, etc.).

**Terminal 4 — Scheduler:**

```bash
npm run dev:scheduler
```

This runs the 60-second maintenance cycle (performance recalculation, follow-ups, dead letter archival) and the 5-minute auto-sourcing loop.

**Terminal 5 — Frontend (port 3001):**

```bash
npm run dev:frontend
```

The web UI will be available at `http://localhost:3001`.

### Restart all services with one command

If you want to restart everything without manually managing each terminal, run this from the repository root:

```bash
npm run dev:restart
```

What this script does:
- Stops existing API/frontend processes and worker/scheduler watchers
- Ensures Docker Redis and PostgreSQL are running
- Starts API, worker, scheduler, and frontend in the background
- Writes logs to:
  - `/tmp/sl-api.log`
  - `/tmp/sl-worker.log`
  - `/tmp/sl-scheduler.log`
  - `/tmp/sl-frontend.log`

Useful follow-up commands:

```bash
tail -f /tmp/sl-api.log /tmp/sl-worker.log /tmp/sl-scheduler.log /tmp/sl-frontend.log
```

### Validate the setup

With all five terminals running, verify from any terminal:

```bash
# Health check (should return {"status":"ok"})
curl http://localhost:3000/api/v1/system/health

# Readiness check — verifies Postgres + Redis connectivity
curl http://localhost:3000/api/v1/system/ready
```

### Run quality gates

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

---

## 3. Authentication

The platform now supports two auth modes:

- Web UI / browser flows: cookie-based session from `POST /api/v1/auth/login`
- External integrations: personal API keys created in the admin UI and sent as `Authorization: Bearer <key>` or `x-api-key: <key>`

### Roles

| Role     | Description                                | Typical access                                          |
|----------|--------------------------------------------|---------------------------------------------------------|
| `admin`  | Full platform administration               | All endpoints                                           |
| `ops`    | Operations — manages projects and outreach | Projects, callers, outreach, screening, call tasks (operator views) |
| `caller` | Phone agent                                | `/call-tasks/current`, `/call-tasks/:taskId/outcome`    |

### Browser login

```bash
curl -i -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"your-password"}'
```

The response sets the `access_token` cookie and returns a `csrfToken`. Use that CSRF token for mutating cookie-authenticated requests.

### Development login shortcut

In development/test environments only, you can also mint a session with:

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"userId":"admin-user","role":"admin"}'
```

### Personal API keys

Create keys from `Admin -> API Keys`. External tools should then send either:

```bash
Authorization: Bearer slk_xxxxx.yyyyy
```

or:

```bash
x-api-key: slk_xxxxx.yyyyy
```

For the curl examples below, you can treat `$TOKEN` as a personal platform API key unless a section explicitly says cookie session or provider-specific token.

### Verify your identity

```bash
curl http://localhost:3000/api/v1/auth/me \
  -H "Authorization: Bearer $API_KEY"
```

Response:

```json
{
  "userId": "user-1",
  "role": "admin"
}
```

### Authorization errors

- **401 Unauthorized** — missing or invalid token.
- **403 Forbidden** — valid token but insufficient role.

---

## 4. API Reference

Base URL: `http://localhost:3000`

All JSON request bodies require `Content-Type: application/json`.

All responses follow this error format on failure:

```json
{
  "error": {
    "code": "invalid_payload",
    "message": "Human-readable message",
    "details": {}
  }
}
```

### 4.1 System

#### `GET /api/v1/system/health`

No auth. Returns `{"status":"ok"}` if the process is alive.

#### `GET /api/v1/system/ready`

No auth. Pings both PostgreSQL and Redis. Returns `{"status":"ready"}` or 500 if a dependency is down.

---

### 4.2 Auth

#### `POST /api/v1/auth/login`

In development/test, supports a simple dev login payload:

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"userId":"admin-user","role":"admin"}'
```

This sets an `access_token` cookie.

#### `GET /api/v1/auth/csrf`

Auth cookie required. Returns a CSRF token for mutating authenticated requests:

```json
{"csrfToken":"..."}
```

#### `GET /api/v1/auth/me`

Auth: any role. Returns the authenticated user's `userId` and `role`.

#### LinkedIn OAuth 2.0 Authorization Code Flow

##### `GET /api/v1/auth/linkedin/authorize`

Auth: `admin` or `ops`.

Builds a LinkedIn authorization URL for a specific provider account:

```bash
curl "http://localhost:3000/api/v1/auth/linkedin/authorize?providerAccountId=<providerAccountId>&responseMode=json"
```

Response includes:
- `authorizeUrl`
- `redirectUri`
- `state`
- `scopes`
- `expiresAt`

##### `GET /api/v1/auth/linkedin/callback`

LinkedIn redirect target for OAuth code exchange.

Production redirect URI:

`https://silverlight-automations.siblingssoftware.com.ar/api/v1/auth/linkedin/callback`

The callback exchanges authorization `code` for tokens and stores them in provider credentials.

#### `GET /api/v1/admin/ping`

Auth: `admin` only. Returns `{"status":"admin-ok"}`. Useful for verifying admin access.

---

### 4.3 Projects

Auth: `admin` or `ops`.

#### Create a project

```bash
curl -X POST http://localhost:3000/api/v1/projects \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "APAC Fintech Experts Q1",
    "description": "Source senior fintech experts in APAC region",
    "targetThreshold": 50,
    "geographyIsoCodes": ["SG", "JP", "AU"],
    "priority": 1,
    "overrideCooldown": false
  }'
```

**Request body:**

| Field               | Type     | Required | Notes                                |
|---------------------|----------|----------|--------------------------------------|
| `name`              | string   | yes      | Min 1 character                      |
| `description`       | string   | no       |                                      |
| `targetThreshold`   | integer  | yes      | Positive integer                     |
| `geographyIsoCodes` | string[] | yes      | ISO 3166-1 alpha-2 codes, min 1 item |
| `priority`          | integer  | no       | Default 0, min 0                     |
| `overrideCooldown`  | boolean  | no       | Default false                        |
| `regionConfig`      | object   | no       | Default {}                           |
| `apolloProviderAccountId` | UUID | no | Bind Apollo provider account |
| `salesNavWebhookProviderAccountId` | UUID | no | Bind Sales Nav provider account |
| `leadmagicProviderAccountId` | UUID | no | Bind LeadMagic provider account |
| `prospeoProviderAccountId` | UUID | no | Bind Prospeo provider account |
| `exaProviderAccountId` | UUID | no | Bind Exa provider account |
| `rocketreachProviderAccountId` | UUID | no | Bind RocketReach provider account |
| `wizaProviderAccountId` | UUID | no | Bind Wiza provider account |
| `foragerProviderAccountId` | UUID | no | Bind Forager provider account |
| `zeliqProviderAccountId` | UUID | no | Bind Zeliq provider account |
| `contactoutProviderAccountId` | UUID | no | Bind ContactOut provider account |
| `datagmProviderAccountId` | UUID | no | Bind DataGM provider account |
| `peopledatalabsProviderAccountId` | UUID | no | Bind PeopleDataLabs provider account |
| `linkedinProviderAccountId` | UUID | no | Bind LinkedIn provider account |
| `emailProviderAccountId` | UUID | no | Bind Email provider account |
| `twilioProviderAccountId` | UUID | no | Bind Twilio provider account |
| `whatsapp2chatProviderAccountId` | UUID | no | Bind WhatsApp (2Chat) provider account |
| `respondioProviderAccountId` | UUID | no | Bind Respond.io provider account |
| `lineProviderAccountId` | UUID | no | Bind LINE provider account |
| `wechatProviderAccountId` | UUID | no | Bind WeChat provider account |
| `viberProviderAccountId` | UUID | no | Bind Viber provider account |
| `telegramProviderAccountId` | UUID | no | Bind Telegram provider account |
| `kakaotalkProviderAccountId` | UUID | no | Bind KakaoTalk provider account |
| `voicemailDropProviderAccountId` | UUID | no | Bind Voicemail Drop provider account |
| `yayProviderAccountId` | UUID | no | Bind Yay provider account |
| `googleSheetsProviderAccountId` | UUID | no | Bind Google Sheets provider account |

> **Note:** Provider accounts can be bound at creation time or later via `POST /api/v1/providers/:id/bind-project`.

#### Get a project

```bash
curl http://localhost:3000/api/v1/projects/<projectId> \
  -H "Authorization: Bearer $TOKEN"
```

#### Update a project

```bash
curl -X PATCH http://localhost:3000/api/v1/projects/<projectId> \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"priority": 2, "description": "Updated description"}'
```

Accepts a partial body (any subset of the create fields).

#### Attach companies to a project

```bash
curl -X POST http://localhost:3000/api/v1/projects/<projectId>/companies \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "companies": [
      {"name": "Stripe", "domain": "stripe.com", "countryIso": "US"},
      {"name": "Wise", "domain": "wise.com", "countryIso": "GB"}
    ]
  }'
```

**Company fields:**

| Field        | Type   | Required | Notes                       |
|--------------|--------|----------|-----------------------------|
| `name`       | string | yes      | Min 1 character             |
| `domain`     | string | no       | Company website domain      |
| `countryIso` | string | no       | ISO 3166-1 alpha-2 (2 chars)|
| `metadata`   | object | no       | Arbitrary JSON              |

Response: `{"createdOrUpdated": 2}`

#### Add Sales Navigator searches

```bash
curl -X POST http://localhost:3000/api/v1/projects/<projectId>/sales-nav-searches \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "searches": [
      {"sourceUrl": "https://linkedin.com/sales/search/1", "normalizedUrl": "https://linkedin.com/sales/search/1"},
      {"sourceUrl": "https://linkedin.com/sales/search/2", "normalizedUrl": "https://linkedin.com/sales/search/2"},
      {"sourceUrl": "https://linkedin.com/sales/search/3", "normalizedUrl": "https://linkedin.com/sales/search/3"},
      {"sourceUrl": "https://linkedin.com/sales/search/4", "normalizedUrl": "https://linkedin.com/sales/search/4"},
      {"sourceUrl": "https://linkedin.com/sales/search/5", "normalizedUrl": "https://linkedin.com/sales/search/5"},
      {"sourceUrl": "https://linkedin.com/sales/search/6", "normalizedUrl": "https://linkedin.com/sales/search/6"}
    ]
  }'
```

Minimum 1 search required. Response: `{"created": N}`

#### Manage screening questions

**List questions:**

```bash
curl http://localhost:3000/api/v1/projects/<projectId>/screening-questions \
  -H "Authorization: Bearer $TOKEN"
```

**Create a question:**

```bash
curl -X POST http://localhost:3000/api/v1/projects/<projectId>/screening-questions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "How many years of experience do you have in fintech?",
    "displayOrder": 1,
    "required": true
  }'
```

**Update a question:**

```bash
curl -X PATCH http://localhost:3000/api/v1/projects/<projectId>/screening-questions/<questionId> \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Updated question text"}'
```

**Delete a question:**

```bash
curl -X DELETE http://localhost:3000/api/v1/projects/<projectId>/screening-questions/<questionId> \
  -H "Authorization: Bearer $TOKEN"
```

Returns 204 No Content. Deleting a question also removes all associated screening responses (cascade).

---

### 4.4 Callers

Auth: `admin` or `ops`.

#### Register a caller

```bash
curl -X POST http://localhost:3000/api/v1/callers \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john.smith@example.com",
    "name": "John Smith",
    "timezone": "America/New_York",
    "languageCodes": ["en", "es"],
    "regionIsoCodes": ["US", "MX"]
  }'
```

**Request body:**

| Field            | Type     | Required | Notes                                  |
|------------------|----------|----------|----------------------------------------|
| `email`          | string   | yes      | Must be a valid email (unique)         |
| `name`           | string   | yes      | Min 1 character                        |
| `timezone`       | string   | yes      | IANA timezone identifier               |
| `languageCodes`  | string[] | yes      | Min 1 item, each min 2 chars           |
| `regionIsoCodes` | string[] | yes      | Min 1 item, each exactly 2 chars       |
| `metadata`       | object   | no       | Arbitrary JSON                         |

#### Get a caller

```bash
curl http://localhost:3000/api/v1/callers/<callerId> \
  -H "Authorization: Bearer $TOKEN"
```

#### Update a caller

```bash
curl -X PATCH http://localhost:3000/api/v1/callers/<callerId> \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"timezone": "Europe/London"}'
```

#### Get latest performance metrics

```bash
curl http://localhost:3000/api/v1/callers/<callerId>/performance/latest \
  -H "Authorization: Bearer $TOKEN"
```

Returns the most recent `CallerPerformanceMetric` snapshot including rolling dial/connection counts, short call counts, allocation status, and performance score.

---

### 4.5 Call Tasks

#### Caller endpoints (role: `caller`)

**Get current assigned task:**

```bash
curl http://localhost:3000/api/v1/call-tasks/current \
  -H "Authorization: Bearer $CALLER_TOKEN"
```

Returns the caller's currently assigned call task, or assigns one if none is active.

**Submit call outcome:**

```bash
curl -X POST http://localhost:3000/api/v1/call-tasks/<taskId>/outcome \
  -H "Authorization: Bearer $CALLER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"outcome": "INTERESTED_SIGNUP_LINK_SENT"}'
```

**Outcome values:**

| Outcome                       | Effect                                                    |
|-------------------------------|-----------------------------------------------------------|
| `INTERESTED_SIGNUP_LINK_SENT` | Expert expressed interest; signup chase retry after 24h   |
| `RETRYABLE_REJECTION`         | Expert declined but may be retried later                  |
| `NEVER_CONTACT_AGAIN`         | Expert permanently suppressed                             |

#### Operator endpoints (role: `admin` or `ops`)

**List tasks with filters:**

```bash
curl "http://localhost:3000/api/v1/call-tasks/operator/tasks?status=PENDING&limit=20" \
  -H "Authorization: Bearer $TOKEN"
```

**Query parameters:**

| Param       | Type    | Required | Notes                                          |
|-------------|---------|----------|-------------------------------------------------|
| `status`    | string  | no       | `PENDING`, `ASSIGNED`, `DIALING`, `COMPLETED`   |
| `projectId` | UUID    | no       | Filter by project                               |
| `limit`     | integer | no       | 1–100                                           |

**Requeue a task:**

```bash
curl -X POST http://localhost:3000/api/v1/call-tasks/operator/tasks/<taskId>/requeue \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Caller reported technical issues"}'
```

---

### 4.6 Job Title Discovery

Auth: `admin` or `ops`.

Triggers an async workflow that uses Apollo to fetch job titles and OpenAI to expand and score them.

```bash
curl -X POST http://localhost:3000/api/v1/job-title-discovery/trigger \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "<projectId>",
    "companies": [
      {"companyName": "Stripe"},
      {"companyName": "Wise", "companyId": "<optional-existing-companyId>"}
    ],
    "geographyIsoCodes": ["US", "GB"]
  }'
```

Response: `{"accepted": true}` (202). The job runs asynchronously in the `job-title-discovery` queue.

---

### 4.7 Outreach

Auth: `admin` or `ops`.

Sends a message to an expert through any supported channel.

```bash
curl -X POST http://localhost:3000/api/v1/outreach/send \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "<projectId>",
    "expertId": "<expertId>",
    "channel": "EMAIL",
    "recipient": "expert@example.com",
    "body": "Hi, we would like to invite you to participate in our research project.",
    "overrideCooldown": false
  }'
```

**Channels:** `PHONE`, `EMAIL`, `LINKEDIN`, `WHATSAPP`, `RESPONDIO`, `SMS`, `IMESSAGE`, `LINE`, `WECHAT`, `VIBER`, `TELEGRAM`, `KAKAOTALK`, `VOICEMAIL`

**Body:** The `body` field is **optional**. If omitted, the system auto-composes the message:
- For experts already in the network (have outreach threads from other projects): a project-specific invitation.
- For new experts: a general signup invitation.

**Cooldown:** Experts have a 30-day cooldown between outreach attempts. Set `overrideCooldown: true` to bypass (use sparingly).

Response: `{"accepted": true, "jobId": "..."}` (202). The message is queued for delivery.

#### Preferred channel

If an expert has a `preferredChannel` set (determined from prior inbound replies), the system will use that channel instead of the one specified in the request — provided the project has the corresponding provider bound. The original requested channel is stored as a fallback.

#### Email region filtering

For the `EMAIL` channel, the system automatically filters email addresses by region rules. Experts in CA, GB, AU, and EU countries will only be contacted using professional email addresses — personal emails (e.g., Gmail, Yahoo) are filtered out.

#### Inbound reply handling

When an inbound reply is received (via webhook or manual recording through `handleInboundReply()`):

1. The expert's `preferredChannel` is updated to the channel the reply was received on.
2. The `OutreachThread` is marked as replied.
3. The lead status advances to `REPLIED`.
4. An `outreach.reply.received` realtime event is published to connected clients.

---

### 4.8 Screening

Auth: `admin` or `ops`.

#### List available outreach channels for a project

```bash
curl "http://localhost:3000/api/v1/projects/<projectId>/available-channels" \
  -H "Authorization: Bearer $TOKEN"
```

Returns an array of `{ channel, label }` objects for every outreach channel that has an active provider account bound to the project. Used by the frontend to populate the channel selector when dispatching screening questions.

#### Dispatch screening questions to an expert

```bash
curl -X POST http://localhost:3000/api/v1/screening/dispatch \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "<projectId>",
    "expertId": "<expertId>",
    "channel": "WHATSAPP"
  }'
```

Sends the project's screening questions to the expert via the specified `channel`. The `channel` field is **required** and must be one of the Prisma `Channel` enum values (e.g. `EMAIL`, `WHATSAPP`, `SMS`, `TELEGRAM`, etc.). On success the lead's status is automatically updated from `REPLIED` to `SCREENING`.

#### Record a screening response

```bash
curl -X POST http://localhost:3000/api/v1/screening/response \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "<projectId>",
    "expertId": "<expertId>",
    "questionId": "<questionId>",
    "responseText": "I have 8 years of experience in fintech."
  }'
```

#### List screening responses (admin)

```bash
curl "http://localhost:3000/api/v1/admin/screening/responses?projectId=<projectId>&status=PENDING,IN_PROGRESS" \
  -H "Authorization: Bearer $TOKEN"
```

Returns up to 300 responses. Each response includes the related `question` and `expert` objects. Filter by `projectId` and/or comma-separated `status` values.

#### Update a screening response (admin)

```bash
curl -X PATCH http://localhost:3000/api/v1/admin/screening/<responseId> \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "COMPLETE", "responseText": "Updated response text"}'
```

#### Trigger a follow-up reminder (admin)

```bash
curl -X POST http://localhost:3000/api/v1/admin/screening/<responseId>/follow-up \
  -H "Authorization: Bearer $TOKEN"
```

Sends a follow-up message to the expert via their preferred channel for any pending screening questions in the same project.

#### Escalate to phone call (admin)

```bash
curl -X POST http://localhost:3000/api/v1/admin/screening/<responseId>/escalate \
  -H "Authorization: Bearer $TOKEN"
```

Sets the response status to `ESCALATED` and creates a `PENDING` call task for a caller to follow up by phone.

---

### 4.9 Worker Actions

Auth: `admin` or `ops`.

Bulk operations that queue background jobs for leads. Results appear in real time on the Workers page.

#### Export not-exported leads to Supabase

```bash
curl -X POST http://localhost:3000/api/v1/admin/workers/export-leads \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"projectId": "<optional-projectId>"}'
```

Finds all leads past the enrichment stage (ENRICHED, OUTREACH_PENDING, CONTACTED, REPLIED, CONVERTED) that have not yet been exported (`supabaseExportedAt` is null) in projects with a Supabase provider bound. Queues a `supabase-sync` job for each. If `projectId` is provided, only that project's leads are exported.

Response: `{"queued": 22}`

#### Outreach enriched leads not yet contacted

```bash
curl -X POST http://localhost:3000/api/v1/admin/workers/outreach-leads \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"projectId": "<optional-projectId>"}'
```

Finds all ENRICHED leads (with no existing outreach thread) in ACTIVE projects that have an outreach template and at least one outreach channel configured. Resolves the message template, finds contact recipients, queues outreach jobs per available channel, and sets matching leads to `OUTREACH_PENDING`. If `projectId` is provided, only that project is processed.

Response: `{"queued": 15}`

#### Get queue statistics

```bash
curl http://localhost:3000/api/v1/admin/workers/queue-stats \
  -H "Authorization: Bearer $TOKEN"
```

Returns current BullMQ job counts (waiting, active, completed, failed, delayed) for every queue.

---

### 4.10 Documentation Generator

Auth: `admin` or `ops`.

Generates architecture summaries, runbooks, state machine docs, and environment checklists. Output is written to `docs/generated/`.

```bash
curl -X POST http://localhost:3000/api/v1/documentation/generate \
  -H "Authorization: Bearer $TOKEN"
```

Response: `{"accepted": true, "jobId": "..."}` (202).

---

### 4.11 Webhooks

Webhook endpoints do not use JWT auth; they have their own verification mechanisms.

#### Yay.com call webhooks

```
POST /webhooks/yay
```

**Verification:** HMAC signature via headers:
- `x-yay-signature` — HMAC-SHA256 of the raw body
- `x-yay-timestamp` — Unix timestamp (events older than 5 minutes are rejected)
- `x-yay-event-id` — Unique event ID (deduplicated)

**Event types processed:** `call.started`, `call.ringing`, `call.answered`, `call.ended`, `call.failed`, `call.recording_ready`

Events are deduplicated, persisted as raw call logs, and enqueued to the `yay-call-events` queue for processing through the call validation pipeline.

#### Sales Navigator webhooks

```
POST /webhooks/sales-nav
```

**Verification:** OAuth 2.0 Client Credentials flow. Credentials (Client ID + Client Secret) are stored as encrypted provider credentials in the provider account bound to the project. The webhook endpoint accepts either:
- `Authorization: Bearer <access_token>` — access token obtained via OAuth 2.0 Client Credentials from LinkedIn's token endpoint
- `x-sales-nav-client-id` — Client ID header (used to look up the bound provider account and validate the request)

Credentials are obtained from the [LinkedIn Developer Portal](https://www.linkedin.com/developers/) (App → Auth tab). The platform uses the OAuth 2.0 Client Credentials flow to obtain access tokens for webhook verification.

**Payload:** Contains a `projectId`, search URL, and an array of `leads` (name, company, title, LinkedIn URL, contact info). Leads are enqueued individually for ingestion and enrichment.

#### Inbound message webhooks

The platform accepts inbound messages from all outreach providers. When an expert replies, the webhook automatically:

1. Resolves the sender to an expert via `ExpertContact` lookup
2. Finds the matching outreach thread and records the inbound message
3. Updates the expert's preferred channel and moves leads to `REPLIED` status
4. Auto-matches the reply to any pending screening response for the expert

All inbound webhooks are idempotent (via `ProcessedWebhookEvents`). Configure each provider's dashboard to point to the URL shown below — replace `<providerAccountId>` with the UUID of your provider account.

**Twilio (SMS + Voicemail)**

```
POST /webhooks/twilio/<providerAccountId>
```

Verification: `x-twilio-signature` HMAC-SHA1 using the Twilio `authToken` stored in the provider account credentials. Twilio sends `application/x-www-form-urlencoded` form data. In the Twilio console, set the Messaging "A message comes in" webhook URL to this endpoint. Response format: TwiML `<Response/>`.

**SendGrid (Email — Inbound Parse)**

```
POST /webhooks/sendgrid/<providerAccountId>
```

Verification: HTTP Basic Auth using the optional `inboundParseVerificationKey` credential. In SendGrid, go to Settings → Inbound Parse, add a host/domain, and set the destination URL. SendGrid forwards the full email as `application/x-www-form-urlencoded` or JSON.

**2Chat (WhatsApp)**

```
POST /webhooks/2chat/<providerAccountId>
```

Verification: `X-User-API-Key` header compared against the stored `webhookSecret` (or `apiKey`). In the 2Chat dashboard, configure the inbound message webhook URL under your WhatsApp number settings.

**Respond.io**

```
POST /webhooks/respondio/<providerAccountId>
```

Verification: `Authorization: Bearer <apiKey>` header. In Respond.io, configure a webhook integration under Settings → Integrations and point it to this URL.

**Telegram**

```
POST /webhooks/telegram/<providerAccountId>
```

Verification: `X-Telegram-Bot-Api-Secret-Token` header compared against the optional `webhookSecretToken` credential. Register the webhook with Telegram using:

```bash
curl "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=https://<YOUR_HOST>/webhooks/telegram/<providerAccountId>&secret_token=<SECRET>"
```

**LINE**

```
POST /webhooks/line/<providerAccountId>
```

Verification: `x-line-signature` HMAC-SHA256 using the `channelSecret` credential. In the LINE Developers Console, set the webhook URL under your Messaging API channel settings.

**Viber**

```
POST /webhooks/viber/<providerAccountId>
```

Verification: `X-Viber-Content-Signature` HMAC-SHA256 using the Viber auth token (`apiKey`). Register via:

```bash
curl -X POST https://chatapi.viber.com/pa/set_webhook \
  -H "X-Viber-Auth-Token: <AUTH_TOKEN>" \
  -d '{"url":"https://<YOUR_HOST>/webhooks/viber/<providerAccountId>","event_types":["message"]}'
```

**KakaoTalk**

```
POST /webhooks/kakaotalk/<providerAccountId>
```

Verification: `Authorization: KakaoAK <apiKey>` header. In the Kakao Developers console, register a Chatbot skill webhook and set the endpoint URL.

**WeChat**

```
POST /webhooks/wechat/<providerAccountId>
GET  /webhooks/wechat/<providerAccountId>  (verification challenge)
```

Verification: SHA1 signature via `signature`, `timestamp`, `nonce` query parameters using the `verifyToken` credential. In the WeChat Official Account admin, configure the server URL and token under Basic Configuration.

---

### 4.12 OpenAPI Spec

```bash
curl http://localhost:3000/api/v1/openapi.json
```

Returns the full OpenAPI 3.1.0 specification. Import this into Postman or any API client for interactive exploration.

---

## 5. Background Processes

### 5.1 Worker Process

Start with `npm run dev:worker`. Runs 16 concurrent workers. Each worker emits real-time events (`worker.job.update`) via Redis pub/sub, which are forwarded to the frontend over Socket.io so the Workers page can display a live activity feed.

| Worker                  | Queue                  | Concurrency | Purpose                                     |
|-------------------------|------------------------|-------------|----------------------------------------------|
| Yay Call Events         | `yay-call-events`      | 20          | Forward Yay events to call validation        |
| Call Validation         | `call-validation`      | 15          | Validate calls, detect fraud                 |
| Lead Ingestion          | `lead-ingestion`       | 10          | Deduplicate leads, create expert records     |
| Screening               | `screening`            | 10          | Send screening follow-up reminders           |
| Call Allocation         | `call-allocation`      | 10          | Assign call tasks to callers                 |
| Outreach                | `outreach`             | 8           | Deliver messages via channel providers       |
| Enrichment              | `enrichment`           | 6           | Enrich leads with contact data               |
| Sales Nav Ingestion     | `sales-nav-ingestion`  | 5           | Process Sales Nav webhook payloads           |
| Ranking                 | `ranking`              | 5           | Compute expert priority scores               |
| Performance             | `performance`          | 5           | Recalculate caller performance metrics       |
| Job Title Discovery     | `job-title-discovery`  | 5           | Apollo + OpenAI title discovery              |
| Google Sheets Sync      | `google-sheets-sync`   | 4           | Sync data to Google Sheets                   |
| Supabase Sync           | `supabase-sync`        | 4           | Export enriched leads to Supabase            |
| Documentation           | `documentation`        | 2           | Generate documentation artifacts             |
| Dead Letter             | `dead-letter`          | 2           | Persist failed jobs for analysis             |

All workers support graceful shutdown on SIGTERM/SIGINT.

### 5.2 Scheduler Process

Start with `npm run dev:scheduler`. Runs two recurring cycles:

#### 60-second maintenance cycle

Non-overlapping. Handles operational housekeeping:

1. **Dead letter archival** — Archives `DeadLetterJob` records older than 30 days.
2. **Performance recalculation** — Enqueues a `performance.recalculate` job for every active caller.
3. **Call allocation** — Enqueues a `call-allocation.assign-current` job for every active caller.
4. **Screening follow-ups** — Finds pending/in-progress screening responses not updated in 15+ minutes and enqueues follow-up reminders.
5. **Signup chase retry** — For experts who received a signup link 24+ hours ago without completing signup, creates new PENDING call tasks (max 3 per expert per day).

#### 5-minute auto-sourcing loop

For every ACTIVE project below its target threshold:

1. **Queue enrichment** — Enqueues enrichment jobs for leads in `NEW` status (batch size 50).
2. **Queue outreach** — Enqueues outreach jobs for leads in `ENRICHED` status (batch size 30).
3. **Stall detection** — Detects stalled pipelines (no lead activity in 24 hours) and creates system alerts for operator review.

---

## 6. Queue Topology

All queues use BullMQ backed by Redis. Default retry policy: 5 attempts with exponential backoff starting at 1 second.

```text
API Request
  │
  ├─► sales-nav-ingestion ──► lead-ingestion ──► enrichment
  │                                                   │
  │                                                   ├──► outreach
  │                                                   └──► ranking
  │
  ├─► job-title-discovery
  ├─► outreach
  ├─► screening
  ├─► call-allocation
  ├─► documentation
  │
  └─► (webhook) yay-call-events ──► call-validation ──► performance
                                                          │
                                                          └──► call-allocation

Scheduler (60s cycle)
  │
  ├─► performance (recalculate per caller)
  ├─► call-allocation (assign tasks per caller)
  ├─► screening (follow-up stale responses)
  ├─► ranking (compute expert priority scores per project)
  └─► auto-sourcing (enrichment, outreach, Apollo)

All queues ──(on failure)──► dead-letter ──► PostgreSQL (dead_letter_jobs)
```

Jobs that exceed all retry attempts are captured in the **dead letter queue** and persisted to the `dead_letter_jobs` table. The scheduler archives records older than 30 days.

---

## 6b. Expert Ranking System

The ranking system determines which experts should be called first. The scheduler computes rankings every 60 seconds and persists them as `RankingSnapshot` rows.

### Scoring formula

All scores are **0-100**. The range is divided into four 25-point tiers. Within each tier, the project completion deficit determines the exact position.

```text
completionDeficit   = (1 - signedUpCount / targetThreshold) × 100   (0-100)
tierBase            = 75 (fresh reply) | 50 (signup chase) | 25 (callback chase) | 0 (base)
deficitPoints       = (completionDeficit / 100) × 17                (0-17)
contactBonus        = min(verifiedContacts, 4) / 4 × 5              (0-5)
attemptPenalty      = min(callAttempts, 6) / 6 × 3                  (0-3)
score               = tierBase + deficitPoints + max(0, contactBonus - attemptPenalty)   (0-100)
```

Three factors determine the score within each 25-point tier: project completion deficit (0-17 pts), number of verified contacts (0-5 pts bonus), and prior call attempts (0-3 pts penalty). This ensures experts on the same project still get distinct scores.

### Priority tiers (highest to lowest)

| Tier | Score range | Description |
|------|-------------|-------------|
| 1 — Fresh replies | 75-97 | Expert replied via email, SMS, WhatsApp, screening, etc. on a high-priority project |
| 2 — Signup chase | 50-72 | Expert expressed interest (`INTERESTED_SIGNUP_LINK_SENT`) but has not completed signup |
| 3 — Callback chase | 25-47 | Expert rejected (`RETRYABLE_REJECTION`) but profile warrants another attempt by a different caller |
| 4 — Base pool | 0-22 | Remaining callable experts, ordered by project completion deficit |

### Within-tier scoring

Three factors spread scores within each tier:
- **Project completion deficit** (0-17 pts): projects further from their target push experts higher
- **Verified contacts** (0-5 pts): experts with more verified contact channels rank higher (more reachable)
- **Call attempts** (0-3 pts penalty): experts already called multiple times without success are slightly deprioritised

Example for "Senior HR Latam" (3/20 = 15% complete, deficit = 85):
- Fresh reply, 3 verified contacts, 0 attempts: 75 + 14.45 + 3.75 = **93.2**
- Fresh reply, 1 contact, 2 attempts: 75 + 14.45 + 0.25 = **89.7**
- Base, 2 contacts, 0 attempts: 0 + 14.45 + 2.5 = **16.95**
- Base, 0 contacts, 5 attempts: 0 + 14.45 + 0 = **14.45**

### Scheduler cycle

Every 60 seconds, the scheduler:
1. Deletes stale snapshots (older than 1 hour)
2. Queries all active projects
3. For each project, finds experts with phone contacts (callable experts)
4. Determines boost flags per expert from outreach threads, screening responses, and call task outcomes
5. Enqueues `ranking.compute` jobs to the `ranking` queue
6. The ranking worker computes scores and persists `RankingSnapshot` rows
7. A `ranking.updated` WebSocket event notifies the admin frontend

### Admin page

The `/admin/ranking` page displays the live ranking table with:
- Project filter dropdown
- Project completion summary cards with progress bars
- Ranked expert table with score, boost badges, phone numbers, and human-readable reasons

---

## 7. Data Model

### Core entities and relationships

```text
Project ─┬─► Company ──► JobTitle
         ├─► SalesNavSearch ──► Lead ──► Expert ──► ExpertContact
         ├─► ScreeningQuestion ──► ScreeningResponse
         ├─► OutreachThread ──► OutreachMessage
         ├─► CallTask ──► CallLog
         ├─► RankingSnapshot
         ├─► CooldownLog
         └─► GoogleSheetExport

Caller ──► CallTask
       ──► CallLog
       ──► CallerPerformanceMetric
```

### Key entities

| Entity                    | Purpose                                                |
|---------------------------|--------------------------------------------------------|
| `Project`                 | Top-level sourcing campaign                            |
| `Company`                 | Target company attached to a project                   |
| `JobTitle`                | Discovered/normalized title with relevance score       |
| `SalesNavSearch`          | LinkedIn Sales Nav search URL                          |
| `Lead`                    | Raw lead from Sales Nav, linked to an Expert           |
| `Expert`                  | Deduplicated person with contact info                  |
| `ExpertContact`           | Email, phone, LinkedIn, or handle for an expert        |
| `EnrichmentAttempt`       | Record of each enrichment provider attempt             |
| `OutreachThread`          | Conversation thread with an expert on a channel        |
| `OutreachMessage`         | Individual message within a thread                     |
| `CooldownLog`             | Record of cooldown enforcement/override                |
| `ScreeningQuestion`       | Question template for a project                        |
| `ScreeningResponse`       | Expert's answer to a screening question                |
| `CallTask`                | Phone call task assigned to a caller                   |
| `CallLog`                 | Validated call record from Yay                         |
| `CallLogRaw`              | Raw Yay webhook event payload                          |
| `Caller`                  | Phone agent profile                                    |
| `CallerPerformanceMetric` | Rolling performance snapshot                           |
| `RankingSnapshot`         | Priority score for expert within a project             |
| `GoogleSheetExport`       | Record of a row sync to Google Sheets                  |
| `GoogleSheetRowMap`       | Maps entity → sheet tab + row number                   |
| `ProcessedWebhookEvent`   | Deduplication record for webhook events                |
| `DeadLetterJob`           | Failed queue job preserved for analysis                |
| `SystemEvent`             | Audit log entry                                        |

---

## 8. Lifecycle State Machines

### Lead status

```text
NEW → ENRICHING → ENRICHED → OUTREACH_PENDING → CONTACTED → REPLIED → SCREENING → CONVERTED
                                        \→ DISQUALIFIED
```

- **SCREENING** — The lead has been dispatched screening questions and is awaiting responses.

### Outreach thread status

```text
OPEN → CLOSED → ARCHIVED
OPEN → ARCHIVED
```

### Screening response status

```text
PENDING → IN_PROGRESS → COMPLETE
PENDING → ESCALATED
IN_PROGRESS → ESCALATED
```

### Call task status

```text
PENDING → ASSIGNED → DIALING → COMPLETED
PENDING → ASSIGNED → EXPIRED
PENDING → ASSIGNED → DIALING → CANCELLED
PENDING → ASSIGNED → DIALING → RESTRICTED
```

### Caller allocation status

```text
ACTIVE ↔ AT_RISK ↔ PAUSED_LOW_DIAL_RATE
ACTIVE → WARMUP_GRACE → ACTIVE
ACTIVE → RESTRICTED_FRAUD → SUSPENDED
ACTIVE → IDLE_NO_AVAILABLE_TASKS → ACTIVE
```

### Project status

```text
ACTIVE → COMPLETED
ACTIVE → PAUSED → ACTIVE
ACTIVE → ARCHIVED
PAUSED → ARCHIVED
```

---

## 9. Enrichment Pipeline

When a lead is ingested, the enrichment pipeline attempts to find verified contact information:

1. **Parallel phase** — Up to 5 providers queried simultaneously (selected by availability and past success).
2. **Evaluation** — Results ranked by confidence score. Target threshold: **≥ 0.7**.
3. **Fallback phase** — If no result meets the threshold, remaining providers are tried sequentially.
4. **Persistence** — Best result creates `ExpertContact` records (email, phone) on the expert. Lead status moves to `ENRICHED`.
5. **Google Sheets phone export** — When phone contacts are saved with `VERIFIED` status, a Google Sheets phone export job is automatically queued (if the project has a Google Sheets provider bound).

**Supported enrichment providers:** LeadMagic, Prospeo, Exa, RocketReach, Wiza, Forager, Zeliq, ContactOut, DataGM, PeopleDataLabs.

Each attempt is logged as an `EnrichmentAttempt` with provider, status, confidence score, and response payload.

**Region-aware rules:** Experts in Canada, GB, Australia, and all European countries require professional email addresses only (personal emails are filtered out).

### Auto-outreach behavior

When a lead reaches `ENRICHED` status, the system checks if the project has an outreach template and bound channels. If so:

1. Template variables (`{{FirstName}}`, `{{LastName}}`, `{{Country}}`, `{{JobTitle}}`, `{{CurrentCompany}}`) are resolved with actual lead/expert data.
2. If all variables used in the template have data, the outreach message is queued automatically.
3. If any variable is missing, outreach is skipped for that lead.

Outreach is therefore automatic after enrichment — no manual send is required when the project is configured with a template and healthy channels.

---

## 10. Channel Reference

The outreach system supports 13 messaging channels:

| Channel      | Normalized key | Provider env var           |
|-------------|----------------|----------------------------|
| Phone       | `phone`        | `TWILIO_API_KEY`           |
| Email       | `email`        | `EMAIL_PROVIDER_API_KEY`   |
| LinkedIn    | `linkedin`     | LinkedIn Sales Navigator provider credentials (`clientId`, `clientSecret`) |
| WhatsApp    | `whatsapp`     | `WHATSAPP_2CHAT_API_KEY`   |
| Respond.io  | `respondio`    | `RESPONDIO_API_KEY`        |
| SMS         | `sms`          | `TWILIO_API_KEY`           |
| iMessage    | `imessage`     | `TWILIO_API_KEY`           |
| LINE        | `line`         | `LINE_API_KEY`             |
| WeChat      | `wechat`       | `WECHAT_API_KEY`           |
| Viber       | `viber`        | `VIBER_API_KEY`            |
| Telegram    | `telegram`     | `TELEGRAM_BOT_TOKEN`       |
| KakaoTalk   | `kakaotalk`    | `KAKAOTALK_API_KEY`        |
| Voicemail   | `voicemail`    | `VOICEMAIL_DROP_API_KEY`   |

Channel names are normalized automatically (e.g., `kakao`, `kaokao` → `kakaotalk`).

---

## 11. Environment Variables

### Core runtime

| Variable    | Required | Default       | Description             |
|-------------|----------|---------------|-------------------------|
| `NODE_ENV`  | no       | `development` | Runtime environment     |
| `PORT`      | no       | `3000`        | HTTP server port        |
| `LOG_LEVEL` | no       | `info`        | Pino log level          |
| `EXTERNAL_APP_BASE_URL` | no | `http://localhost:3000` | Base URL used to build OAuth callback redirect URIs |

### Data stores

| Variable          | Required | Default                                                          | Description                |
|-------------------|----------|------------------------------------------------------------------|----------------------------|
| `DATABASE_URL`    | yes      | `postgresql://postgres:postgres@localhost:5432/expert_sourcing`   | PostgreSQL connection URL  |
| `REDIS_URL`       | yes      | `redis://localhost:6379`                                         | Redis connection URL       |
| `REDIS_NAMESPACE` | no       | `local`                                                          | Key prefix for isolation   |

### Authentication

| Variable                       | Required | Default                      | Description                     |
|--------------------------------|----------|------------------------------|---------------------------------|
| `JWT_ISSUER`                   | no       | `expert-sourcing-platform`   | Token issuer claim              |
| `JWT_AUDIENCE`                 | no       | `expert-sourcing-api`        | Token audience claim            |
| `JWT_SECRET`                   | yes      | —                            | Signing secret (min 32 chars)   |
| `JWT_ACCESS_TOKEN_TTL_SECONDS` | no       | `3600`                       | Token expiration in seconds     |

### AI

| Variable                            | Required | Default        | Description                         |
|-------------------------------------|----------|----------------|-------------------------------------|
| `OPENAI_API_KEY`                    | no       | —              | OpenAI API key for title scoring    |
| `OPENAI_MODEL`                      | no       | `gpt-4o-mini`  | Model to use                        |
| `OPENAI_CLASSIFICATION_TEMPERATURE` | no       | `0.2`          | Must be ≤ 0.2 for determinism      |

### Sourcing

| Variable                   | Required | Description                           |
|----------------------------|----------|---------------------------------------|
| `APOLLO_API_KEY`           | no       | Apollo.io API key                     |
| Sales Nav (OAuth)          | no       | Client ID + Client Secret stored as encrypted provider credentials (see Provider management). OAuth 2.0 Client Credentials flow to LinkedIn's token endpoint. Configure via Admin → Providers. |

### Enrichment providers

All optional. Configure only the providers you have API access to:

`LEADMAGIC_API_KEY`, `PROSPEO_API_KEY`, `EXA_API_KEY`, `ROCKETREACH_API_KEY`, `WIZA_API_KEY`, `FORAGER_API_KEY`, `ZELIQ_API_KEY`, `CONTACTOUT_API_KEY`, `DATAGM_API_KEY`, `PEOPLEDATALABS_API_KEY`

### Messaging channels

All optional. Configure only the channels you intend to use:

`EMAIL_PROVIDER_API_KEY`, `TWILIO_API_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `WHATSAPP_2CHAT_API_KEY`, `RESPONDIO_API_KEY`, `LINE_API_KEY`, `WECHAT_API_KEY`, `VIBER_API_KEY`, `TELEGRAM_BOT_TOKEN`, `KAKAOTALK_API_KEY`, `VOICEMAIL_DROP_API_KEY`

LinkedIn channel operations use the LinkedIn Sales Navigator provider credentials (Client ID + Client Secret) configured in provider accounts.

### Integrations

| Variable                           | Required | Description                       |
|------------------------------------|----------|-----------------------------------|
| `YAY_WEBHOOK_SECRET`               | yes      | HMAC secret for Yay webhooks      |
| `YAY_API_KEY`                      | no       | Yay platform API key              |
| `GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON` | no     | Service account JSON for Sheets   |
| `GOOGLE_SHEETS_SPREADSHEET_ID`     | no       | Target spreadsheet ID             |

---

## 12. Operational Recipes

### Full project lifecycle (end to end)

```bash
# 1. Create a project (provider binding happens here — in the web UI this is
#    the wizard's Step 2: Lead Sources selection)
curl -X POST http://localhost:3000/api/v1/projects \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "US Healthcare AI Experts",
    "targetThreshold": 30,
    "geographyIsoCodes": ["US"],
    "apolloProviderAccountId": "<provider-account-uuid>",
    "emailProviderAccountId": "<provider-account-uuid>",
    "leadmagicProviderAccountId": "<provider-account-uuid>",
    "googleSheetsProviderAccountId": "<provider-account-uuid>"
  }'
# Save the returned projectId

# 2. Attach target companies
curl -X POST http://localhost:3000/api/v1/projects/$PROJECT_ID/companies \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "companies": [
      {"name": "Epic Systems", "domain": "epic.com", "countryIso": "US"},
      {"name": "Cerner", "domain": "cerner.com", "countryIso": "US"}
    ]
  }'

# 3. Trigger job title discovery
curl -X POST http://localhost:3000/api/v1/job-title-discovery/trigger \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "'$PROJECT_ID'",
    "companies": [{"companyName": "Epic Systems"}, {"companyName": "Cerner"}],
    "geographyIsoCodes": ["US"]
  }'

# 4. Add screening questions
curl -X POST http://localhost:3000/api/v1/projects/$PROJECT_ID/screening-questions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Years of experience in healthcare IT?", "displayOrder": 1}'

# 5. Register a caller
curl -X POST http://localhost:3000/api/v1/callers \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "caller@example.com",
    "name": "Jane Dialer",
    "timezone": "America/Chicago",
    "languageCodes": ["en"],
    "regionIsoCodes": ["US"]
  }'

# 6. As a caller — get next task and submit outcome
curl http://localhost:3000/api/v1/call-tasks/current \
  -H "Authorization: Bearer $CALLER_TOKEN"

curl -X POST http://localhost:3000/api/v1/call-tasks/$TASK_ID/outcome \
  -H "Authorization: Bearer $CALLER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"outcome": "INTERESTED_SIGNUP_LINK_SENT"}'

# 7. Enrichment & outreach — handled by the auto-sourcing loop
# The scheduler automatically queues enrichment for NEW leads (batch 50) and
# outreach for ENRICHED leads (batch 30) every 5 minutes for active projects
# below their target threshold. No manual send required.
# Manual outreach is still available via POST /api/v1/outreach/send if needed.

# 8. Dispatch screening and record response
curl -X POST http://localhost:3000/api/v1/screening/dispatch \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"projectId": "'$PROJECT_ID'", "expertId": "'$EXPERT_ID'", "channel": "EMAIL"}'
```

### Monitor caller performance

```bash
curl http://localhost:3000/api/v1/callers/$CALLER_ID/performance/latest \
  -H "Authorization: Bearer $TOKEN"
```

Key metrics in the response:
- `rolling60MinuteDials` — dials in the last hour
- `rolling60MinuteConnections` — successful connections
- `shortCallsLastHour` — calls under 5 seconds (potential fraud indicator)
- `allocationStatus` — current status (ACTIVE, AT_RISK, PAUSED, etc.)
- `performanceScore` — computed score

### Inspect and requeue stalled tasks

```bash
# List assigned tasks that may be stuck
curl "http://localhost:3000/api/v1/call-tasks/operator/tasks?status=ASSIGNED&limit=50" \
  -H "Authorization: Bearer $TOKEN"

# Requeue a specific task
curl -X POST http://localhost:3000/api/v1/call-tasks/operator/tasks/$TASK_ID/requeue \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Caller unresponsive, reassigning"}'
```

---

## 13. Error Handling

### HTTP error responses

All errors return a consistent JSON envelope:

```json
{
  "error": {
    "code": "error_code",
    "message": "Human-readable description",
    "details": {}
  }
}
```

| Status | Code                | Cause                                        |
|--------|---------------------|----------------------------------------------|
| 400    | `invalid_payload`   | Request body failed Zod validation           |
| 401    | `unauthorized`      | Missing, malformed, or expired JWT           |
| 403    | `forbidden`         | Valid token but role lacks permission         |
| 404    | `not_found`         | Entity does not exist                        |
| 409    | `invalid_transition`| Invalid state machine transition attempted   |
| 429    | (rate limit)        | Exceeded 300 requests per 60 seconds         |
| 500    | `internal_error`    | Unexpected server error                      |

### Correlation IDs

Every request is tagged with a correlation ID. Pass your own via the `x-correlation-id` header or let the server generate one. This ID appears in:

- Response headers
- Server logs
- Queue job metadata
- System event records

Use correlation IDs to trace a request through the entire pipeline (API → queue → worker → database).

### Dead letter queue

Failed queue jobs (after 5 retry attempts) are captured in the `dead_letter_jobs` table with:

- Original queue name and job ID
- Full payload
- Error message and stack trace
- Timestamp

The scheduler automatically archives entries older than 30 days.

---

## 14. Troubleshooting

### Server won't start

- Check that PostgreSQL and Redis are running: `docker compose ps`
- Verify `DATABASE_URL` and `REDIS_URL` in `.env`
- Run migrations: `npm run db:migrate`
- Check `JWT_SECRET` is at least 32 characters

### `/system/ready` returns 500

PostgreSQL or Redis is unreachable. Verify with:

```bash
docker compose logs postgres
docker compose logs redis
```

### Workers not processing jobs

- Ensure the worker process is running (`npm run dev:worker`)
- Check Redis connectivity
- Look for errors in worker logs (structured JSON via pino)

### Webhooks returning errors

**Yay webhooks (signature failures):**
- Verify `YAY_WEBHOOK_SECRET` matches what Yay is sending
- Events older than 5 minutes are rejected; check clock sync

**Sales Nav webhooks:**
- Verify the project has a Sales Nav provider account bound with valid Client ID + Client Secret
- Ensure credentials are configured in the LinkedIn Developer Portal (App → Auth tab)
- The webhook accepts `Authorization: Bearer <token>` or `x-sales-nav-client-id` header; tokens are obtained via OAuth 2.0 Client Credentials flow

### Jobs stuck in queues

Check the BullMQ dashboard (if configured) or query Redis directly. The dead letter queue captures permanently failed jobs.

### Caller showing as PAUSED or RESTRICTED

Check performance metrics:

```bash
curl http://localhost:3000/api/v1/callers/$CALLER_ID/performance/latest \
  -H "Authorization: Bearer $TOKEN"
```

- `PAUSED_LOW_DIAL_RATE` — dial rate too low for 10+ minutes. Resume by making calls.
- `AT_RISK` — dial rate dropping. 5-minute warning before pause.
- `RESTRICTED_FRAUD` — short calls or timezone mismatches detected. Requires admin review.
- `WARMUP_GRACE` — 5-minute grace period after starting. Will auto-transition to ACTIVE.

---

## 15. Frontend Web UI

The platform includes a Next.js admin portal at `http://localhost:3001` (start with `npm run dev:frontend`). The frontend proxies API requests to the backend via a rewrite rule in `next.config.mjs`.

### Project creation wizard

Five-step guided flow for creating and configuring projects:

1. **Project Details** — Basics: name, description, target threshold, geography, target companies, and job titles.
2. **Lead Sources** — Select configured provider accounts for sourcing and enrichment (Apollo, Sales Nav, enrichment providers). Provider health is validated before binding.
3. **Export Destinations** — Select Google Sheets and/or Supabase accounts for export. Only accounts already configured on the Providers page are shown.
4. **Outreach** — Select healthy outreach channels and write a mandatory message template. The template supports variable insertion: `{{FirstName}}`, `{{LastName}}`, `{{Country}}`, `{{JobTitle}}`, `{{CurrentCompany}}`. Outreach is sent automatically after enrichment.
5. **Start Prospecting** — Completion screen with summary and links to view leads in real time.

### Leads pipeline

Project selection is mandatory — there is no "All projects" option. The first project is auto-selected when the page loads.

Displays leads for the selected project with real-time status updates via live polling and socket events. Leads are grouped by pipeline stage (`NEW` → `ENRICHING` → `ENRICHED` → `OUTREACH_PENDING` → `CONTACTED` → `REPLIED` → `SCREENING` → `CONVERTED`). Supports filtering, search, and bulk actions.

The table columns include **First Name**, **Last Name**, **Job Title**, **Current Company**, and **Country**. A **column visibility toggle** at the top of the table lets you show or hide columns. **Pagination** is shown both above and below the table, with a page size selector (25, 50, 100, 200).

The table includes an **Exported** column showing whether a lead has been exported to Google Sheets and/or Supabase. Hovering over "Yes" reveals a tooltip listing each destination with its export timestamp.

When no projects exist, an empty state directs the user to create one.

### Outreach page

Manual outreach has been removed from the frontend. The outreach page now only shows **thread history** — delivery status, channel used, and inbound reply content. Reply events update the view in real time via the `outreach.reply.received` event.

Outreach is configured in the project wizard (Step 4) and sent automatically after enrichment. See [Auto-outreach behavior](#auto-outreach-behavior) above.

### Screening page

Manages screening questions and expert responses. The page has three sections:

**Screening Questions** — Appears when a project is selected. Lets you create, edit, and delete screening questions for the project. Each question has a prompt text, display order, and required flag. Questions are ordered by display order and shown as an editable list with inline add/edit forms.

**Dispatch Screening** — Select a project, a lead (searchable dropdown filtered to REPLIED leads), and an outreach channel from the channels bound to the project. The channel selector dynamically loads available channels via `GET /projects/:id/available-channels`. On dispatch the system creates pending response records, delivers the questions, and automatically transitions the lead from REPLIED to SCREENING status.

**Screening Responses** — Filterable table showing all responses with status (Pending, In Progress, Complete, Escalated), response text, score, and channel. Each response supports actions: edit response text/status, send a follow-up reminder, or escalate to a phone call.

### Caller execution interface

Dedicated view for phone agents showing:

- Current assigned expert with full details (name, company, title, contact info).
- Call history and prior outreach threads across projects.
- Outcome submission buttons (`INTERESTED_SIGNUP_LINK_SENT`, `RETRYABLE_REJECTION`, `NEVER_CONTACT_AGAIN`).
- Auto-assignment of the next call task on outcome submission.

### Dashboard

Real-time operational dashboard with:

- Active projects and progress toward target thresholds.
- Lead pipeline distribution across stages.
- Caller performance summaries and allocation statuses.
- Queue depths and processing rates.

### Workers page

Real-time operations dashboard for monitoring background job processing. Accessible from the sidebar under "Workers" (`/admin/workers`).

**Queue Statistics** — Displays live job counts (waiting, active, completed, failed, delayed) for every BullMQ queue. Active queues are shown as cards with stat pills; idle queues appear as compact badges. Stats refresh automatically every 5 seconds.

**Live Event Feed** — A scrollable table showing worker job events as they happen. Each event shows queue name, job ID, status (active / completed / failed), duration, and timestamp. Failed jobs show an expandable error message. The feed can be filtered by queue, paused/resumed, and cleared.

**Bulk Actions** — Two action buttons for common batch operations:

1. **Export not-exported leads** — Queues `supabase-sync` jobs for all ENRICHED leads that have not been exported to Supabase yet. Optionally filter by project.
2. **Outreach enriched leads** — Queues outreach jobs for all ENRICHED leads (without an existing outreach thread) in ACTIVE projects with a configured message template and available channels. Optionally filter by project.

Both buttons show a loading state while processing and report the number of jobs queued. Results appear immediately in the live event feed above.

### Provider management

Lists all configured provider accounts with connection health checks. Supports adding new provider accounts, testing connectivity, and viewing usage metrics. Supabase can be bound as a destination provider so enriched leads are exported automatically into a configured table.

#### Supabase column mapping

When configuring a Supabase provider account, you can optionally specify the exact column names in your Supabase table for each exported field. This avoids the need to rename columns in your table to match the platform defaults. The platform inserts only these mapped fields into Supabase. The configurable column mappings are:

| Setting | Default column name | Description |
|---|---|---|
| `columnEmail` | `primary_email` | Lead's primary email address |
| `columnPhone` | `primary_phone` | Lead's primary phone number |
| `columnCountry` | `country_iso` | Lead's country (ISO code) |
| `columnCurrentCompany` | `company_name` | Lead's current company |
| `columnLinkedinUrl` | `linkedin_url` | Lead's LinkedIn profile URL |
| `columnJobTitle` | `job_title` | Lead's job title |

If a column mapping is left blank, the platform uses the default column name shown above.

### API keys and API docs

The admin UI now includes:

- `Admin -> API Keys` for create/list/revoke of personal platform API keys
- `Admin -> Help -> API Docs` for OpenAPI download, Postman collection download, and endpoint-group summaries

### Help center

Built-in guide pages with step-by-step provider setup instructions for each integration (Apollo, Sales Nav, enrichment providers, messaging channels, Yay, Google Sheets, Supabase).
