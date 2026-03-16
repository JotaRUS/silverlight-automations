# Expert Sourcing Automation Platform

## Architecture Master Specification

This repository implements a deterministic, queue-driven automation platform for expert sourcing and outreach. The system ingests leads from external sources, enriches contact data via multiple providers, executes multi-channel outreach, manages phone-call campaigns, and tracks expert signup progress — all orchestrated through BullMQ queues backed by Redis and persisted in PostgreSQL via Prisma.

---

## Core Guarantees

- **Strict TypeScript** — `strict: true` across the entire codebase; no `any` leakage.
- **Express API** with cookie-based JWT auth, CSRF protection, and role-based guards (`admin`, `caller`).
- **PostgreSQL persistence** via Prisma ORM with advisory-lock + serializable transaction helpers for identity-sensitive writes.
- **Redis-backed BullMQ orchestration** — 14 named queues with dead-letter routing and correlation-aware job processing.
- **Idempotent webhook ingestion** via `processed_webhook_events` unique `eventId` constraint.
- **Deterministic clock abstraction** (`src/core/time/clock.ts`) — all time-based policies use the injectable clock, enabling deterministic testing.
- **Structured event logging** with pino; every log entry carries a `correlationId`.
- **Canonical channel normalization** — channel names are lowercased enums (`KAKAOTALK`, `WHATSAPP`, etc.).
- **AES-256-GCM credential encryption** — provider secrets encrypted at rest, decrypted on-demand via `PROVIDER_ENCRYPTION_SECRET`.

---

## Runtime Topology

| Process | Port | Command | Role |
|---|---|---|---|
| `api` | 3000 | `npm run dev` | HTTP ingress: REST endpoints, validation, auth, webhook receivers, CRUD |
| `worker` | — | `npm run dev:worker` | 14 BullMQ workers processing async jobs in parallel |
| `scheduler` | — | `npm run dev:scheduler` | 60-second maintenance loop + 5-minute auto-sourcing loop |
| `frontend` | 3001 | `cd frontend && npm run dev` | Next.js 14 admin portal (proxies `/api/v1/*` to backend) |
| `postgres` | 5432 | `docker compose up -d postgres` | PostgreSQL 15 — primary data store |
| `redis` | 6379 | `docker compose up -d redis` | Redis 7 — BullMQ job broker and queue state |

### Process details

**`api` process** — Express server handling all HTTP traffic. Responsibilities:
- REST routes under `/api/v1/*` organized by domain module
- JWT cookie auth with CSRF token enforcement on mutating requests
- Webhook endpoints for Yay call events, Sales Navigator, and provider callbacks
- Request validation via Zod schemas
- CORS and proxy configuration for frontend dev

**`worker` process** — Spawns 14 BullMQ `Worker` instances, one per queue. Each worker uses `withWorkerContext` for correlation propagation and `withDeadLetter` for automatic failure routing. Workers are stateless and horizontally scalable.

**`scheduler` process** — Single-instance loop with two cadences:
1. **Maintenance cycle** (every 60 seconds): dead-letter archival, caller performance recalculation, call-allocation refresh, screening follow-ups, and signup-chase task creation.
2. **Auto-sourcing loop** (every 5 minutes): pipeline advancement for active projects (see below).

---

## Queue Architecture

14 named queues defined in `src/queues/definitions/queueNames.ts`:

| Queue | Job types | Purpose |
|---|---|---|
| `job-title-discovery` | Job title resolution | Resolve/normalize expert job titles |
| `sales-nav-ingestion` | Lead batch import | Ingest leads from Sales Navigator webhooks |
| `lead-ingestion` | Lead processing | Normalize and deduplicate incoming leads |
| `enrichment` | `enrichment.run` | Multi-provider contact data enrichment |
| `outreach` | `outreach.send` | Multi-channel message dispatch |
| `screening` | `screening.followup` | Expert screening question flow |
| `call-allocation` | `call-allocation.assign-current` | Match callers to call tasks |
| `call-validation` | Call outcome validation | Validate call duration, detect fraud |
| `performance` | `performance.recalculate` | Caller performance metric snapshots |
| `ranking` | Expert ranking | Priority scoring for expert pipeline |
| `google-sheets-sync` | `phone-export`, tab sync | Export data to Google Sheets |
| `documentation` | Doc generation | Auto-generate system documentation |
| `yay-call-events` | `yay.call-event` | Process inbound Yay telephony events |
| `dead-letter` | `dead-letter.archival` | Failed job persistence and archival |

### Dead-letter policy

Every worker wraps its processor with `registerDeadLetterHandler()`. On failure, the job envelope (original queue name, payload, error, timestamp) is routed to the `dead-letter` queue. Dead-letter jobs are persisted to the `dead_letter_jobs` table and archived after a configurable retention period by the scheduler.

### Job idempotency

Jobs use deterministic IDs via `buildJobId(prefix, ...segments)`. BullMQ deduplicates by job ID within the queue, preventing double-processing in auto-sourcing batches and scheduler cycles.

---

## Auto-Sourcing Loop

**Cadence**: Every 5 minutes (`AUTO_SOURCING.INTERVAL_MS = 300000`), triggered within the scheduler maintenance cycle.

**Purpose**: Automatically advance the sourcing pipeline for projects that haven't met their expert signup targets.

### Algorithm

1. **Fetch eligible projects** — all projects where `status = 'ACTIVE'` and `signedUpCount < targetThreshold`.
2. **Queue enrichment** — for each project, find up to `ENRICHMENT_BATCH_SIZE` (50) leads with `status = 'NEW'` and queue `enrichment.run` jobs. Job ID: `enrichment:{leadId}:{timeSlice}`.
3. **Queue outreach** — for each project, find up to `OUTREACH_BATCH_SIZE` (30) leads with `status = 'ENRICHED'` and a linked `expertId`, skip if an outreach thread already exists, find the best verified contact, and queue `outreach.send` jobs. Lead status advances to `OUTREACH_PENDING`. Job ID: `outreach:{projectId}:{expertId}:{timeSlice}`.
4. **Detect stalled pipelines** — if a project has zero leads in the active pipeline (`NEW`, `ENRICHING`, `ENRICHED`, `OUTREACH_PENDING`), no leads created in the last 24 hours, but still has active Sales Nav searches, create a `system_event` with `message: 'auto_sourcing_pipeline_stalled'`.

### Constants (`src/config/constants.ts`)

| Constant | Value |
|---|---|
| `AUTO_SOURCING.INTERVAL_MS` | `300000` (5 minutes) |
| `AUTO_SOURCING.ENRICHMENT_BATCH_SIZE` | `50` |
| `AUTO_SOURCING.OUTREACH_BATCH_SIZE` | `30` |
| `AUTO_SOURCING.STALE_PIPELINE_HOURS` | `24` |

---

## Outreach Intelligence

### Message differentiation

When sending outreach, the system checks whether the expert has outreach threads from **other** projects via `checkIsExistingNetworkExpert(expertId, projectId)`.

- **Existing network expert** (`isExistingNetworkExpert = true`) → project-specific invitation: *"We have a new project that matches your expertise..."*
- **New expert** (`isExistingNetworkExpert = false`) → general signup invitation with platform introduction.

The `isExistingNetworkExpert` flag is stored in message `metadata` for analytics.

### Preferred channel auto-update

When an expert replies on any channel, `handleInboundReply()`:
1. Records the inbound message on the thread.
2. Marks the thread status as replied.
3. Sets `expert.preferredChannel` to the reply channel (if different from current).
4. Advances all associated leads to `REPLIED` status.

### Reply-based channel continuation

Before sending, `resolveEffectiveChannel(projectId, expertId, requestedChannel)`:
1. Looks up `expert.preferredChannel`.
2. If set and differs from the requested channel, checks if the project has a provider account bound for the preferred channel via `isChannelAvailableForProject()`.
3. If available → overrides to preferred channel. If not → falls back to requested channel.

This ensures experts are always contacted on the channel they last responded on, when possible.

### Email region filtering

For privacy-regulated regions (CA, GB, AU, and all EU countries), only **professional** emails are used for outreach. Personal emails are filtered out.

- Implementation: `selectEmailsForOutreach(countryIso, candidateEmails)` in `src/modules/outreach/channelSelection.ts`
- Region rules: `requiresProfessionalEmailOnly()` in `src/config/regionRules.ts`
- Applies to all outreach send flows automatically.

### Channel-to-provider mapping

| Channel | Provider Type |
|---|---|
| `PHONE` | `YAY` |
| `EMAIL` | `EMAIL_PROVIDER` |
| `LINKEDIN` | `LINKEDIN` |
| `WHATSAPP` | `WHATSAPP_2CHAT` |
| `RESPONDIO` | `RESPONDIO` |
| `SMS` | `TWILIO` |
| `IMESSAGE` | `TWILIO` |
| `LINE` | `LINE` |
| `WECHAT` | `WECHAT` |
| `VIBER` | `VIBER` |
| `TELEGRAM` | `TELEGRAM` |
| `KAKAOTALK` | `KAKAOTALK` |
| `VOICEMAIL` | `VOICEMAIL_DROP` |

---

## Google Sheets Auto-Export

### Phone number export

When phone numbers are verified during enrichment, a `google-sheets-sync.phone-export` job is automatically queued.

- **Guard**: export only fires if the project has a `googleSheetsProviderAccountId` bound.
- **Deduplication**: `buildJobId('gsheets-phone-export', expertId, phone)`.
- **Tab**: `PHONE_EXPORT` with columns: `expertId`, `fullName`, `countryIso`, `phone`, `phoneLabel`, `verificationStatus`, `projectId`.

### Tab mapping (`src/modules/google-sheets-sync/googleSheetsTabMapping.ts`)

9 tabs with structured column mappings:

| Tab | Key columns |
|---|---|
| `PROJECT_OVERVIEW` | projectId, projectName, status, targetThreshold, signedUpCount, completionPercentage, priority |
| `LEADS_PIPELINE` | leadId, projectId, fullName, jobTitle, companyName, countryIso, status |
| `ENRICHMENT_LOG` | attemptId, leadId, provider, status, confidenceScore, errorMessage |
| `OUTREACH_STATUS` | threadId, projectId, expertId, channel, threadStatus, lastMessageAt, replied |
| `CALL_ACTIVITY` | callId, callTaskId, projectId, callerId, expertId, durationSeconds, validated, fraudFlag |
| `SCREENING_PROGRESS` | responseId, projectId, questionId, expertId, status, qualified, score |
| `CALLER_PERFORMANCE` | metricId, callerId, allocationStatus, rolling60MinuteDials, rolling60MinuteValidConnections |
| `PHONE_EXPORT` | expertId, fullName, countryIso, phone, phoneLabel, verificationStatus, projectId |
| `SYSTEM_ERRORS` | eventId, category, entityType, entityId, message, correlationId |

---

## Caller Execution Interface

### Task assignment — `fetchOrAssignCurrentTask(callerId)`

Returns the caller's current assigned task or assigns the next best match. The response includes deep relations:

- **Expert**: `fullName`, `countryIso`, `timezone`, `languageCodes`, `currentRole`, `currentCompany`
- **Expert contacts**: all non-deleted contacts, ordered by `isPrimary`
- **Expert call logs**: last 20 with outcomes
- **Expert outreach threads**: last 10 with up to 5 messages each
- **Project**: `name` and `geographyIsoCodes`

### Matching algorithm

Tasks are assigned within a serializable transaction:
1. Check for existing `ASSIGNED` or `DIALING` tasks for the caller.
2. If none, find the highest-priority `PENDING` task where:
   - Expert's `countryIso` matches caller's `regionIsoCodes`
   - Expert's `languageCodes` overlap with caller's `languageCodes`
   - Expert's `timezone` matches caller's or is null
   - Task is within its execution window (or has no window)
3. Assign the task with a 15-minute execution window.
4. If no matching task exists, set caller to `IDLE_NO_AVAILABLE_TASKS`.

### Caller UI

- Expert info displayed prominently (name, role, company, country, timezone)
- Call history timeline from call logs
- Outreach context from recent threads and messages
- 3 outcome buttons for call disposition

### Performance enforcement (`src/config/constants.ts`)

| Rule | Value |
|---|---|
| Minimum dials per hour | `30` |
| Minimum call duration (fraud detection) | `5 seconds` |
| Warmup grace period | `5 minutes` |
| At-risk threshold | `5 minutes` below target |
| Pause threshold | `10 minutes` below target |
| Signup chase retry interval | `24 hours` |
| Max daily signup-chase call attempts | `3` |

### Caller allocation statuses

`ACTIVE` → `WARMUP_GRACE` → `AT_RISK` → `PAUSED_LOW_DIAL_RATE` → `IDLE_NO_AVAILABLE_TASKS`

---

## Provider Account System

### 25 provider types in 4 categories

**Lead Sourcing**
- `APOLLO` — Apollo.io lead search
- `SALES_NAV_WEBHOOK` — LinkedIn Sales Navigator (OAuth 2.0 Client Credentials — Client ID + Client Secret)

**Data Enrichment** (10 providers)
- `LEADMAGIC`, `PROSPEO`, `EXA`, `ROCKETREACH`, `WIZA`, `FORAGER`, `ZELIQ`, `CONTACTOUT`, `DATAGM`, `PEOPLEDATALABS`

**Outreach Channels** (11 providers)
- `LINKEDIN` (legacy messaging token provider), `EMAIL_PROVIDER`, `TWILIO`, `WHATSAPP_2CHAT`, `RESPONDIO`, `LINE`, `WECHAT`, `VIBER`, `TELEGRAM`, `KAKAOTALK`, `VOICEMAIL_DROP`

**Calling & Operations**
- `YAY` — Yay telephony platform for call execution
- `GOOGLE_SHEETS` — Google Sheets export integration

### Credential management

- Credentials validated against per-type Zod schemas (`src/core/providers/providerCredentialSchemas.ts`).
- Encrypted with AES-256-GCM at rest using `PROVIDER_ENCRYPTION_SECRET`.
- Decrypted on-demand when the integration adapter needs to make an API call.
- Health check endpoint available for connection testing per account.

### Project binding

- Provider accounts are bound to projects via per-type foreign keys on the `project` table (e.g., `apolloProviderAccountId`, `leadmagicProviderAccountId`, etc.).
- One account per provider type per project.
- Mapping defined in `PROVIDER_TYPE_TO_PROJECT_BINDING_FIELD` (`src/core/providers/providerTypes.ts`).

### Integration boundary

Domain modules **never** call providers directly. All external system access goes through `src/integrations/*` adapters. This keeps domain logic provider-agnostic and testable with simple adapter mocks.

---

## Project Wizard

3-step frontend wizard for project creation:

1. **Project Details** — name, geography, target threshold, priority, and other metadata.
2. **Lead Sources** — displays all active provider accounts as a matrix of checkboxes grouped by category (Lead Sourcing, Data Enrichment, Outreach Channels, Calling & Operations). Only accounts with saved credentials are shown. One account per provider type can be bound.
3. **Start Prospecting** — confirms setup and activates the project.

On save, the wizard PATCHes the project record with all selected provider account IDs, setting the corresponding per-type foreign keys.

---

## Data Model Scope

Implemented schema (Prisma) includes:

| Table | Purpose |
|---|---|
| `projects` | Sourcing projects with target thresholds and provider bindings |
| `companies` | Company entities linked to experts |
| `job_titles` | Normalized job title reference data |
| `sales_nav_searches` | Sales Navigator search configurations per project |
| `leads` | Lead pipeline: `NEW` → `ENRICHING` → `ENRICHED` → `OUTREACH_PENDING` → `REPLIED` → `SCREENING` → `CONVERTED` |
| `experts` | Deduplicated expert profiles with `preferredChannel` |
| `expert_contacts` | Multi-type contact records (email, phone, social) with verification status |
| `enrichment_attempts` | Per-lead, per-provider enrichment audit trail |
| `cooldown_logs` | 30-day outreach cooldown enforcement per expert |
| `outreach_threads` | Per-project, per-expert outreach conversation threads |
| `outreach_messages` | Individual messages within threads with delivery status |
| `screening_questions` | Project-specific qualification questions |
| `screening_responses` | Expert answers with scoring and qualification status |
| `call_tasks` | Call queue items with priority scoring and execution windows |
| `call_logs` | Validated call records with duration and outcome |
| `call_logs_raw` | Raw telephony event data before validation |
| `callers` | Caller profiles with region/language matching and allocation status |
| `caller_performance_metrics` | Rolling performance snapshots (dials/hour, valid connections) |
| `ranking_snapshots` | Point-in-time expert ranking data |
| `google_sheet_exports` | Export job tracking |
| `google_sheet_row_map` | Row-level deduplication for sheet sync |
| `provider_accounts` | Encrypted credentials and activation state per provider |
| `system_events` | Structured system alerts and audit events |
| `dead_letter_jobs` | Failed job archive with source queue and error detail |
| `processed_webhook_events` | Idempotency guard for webhook ingestion |

---

## Concurrency and Idempotency Policy

- **Serializable transactions** — identity-sensitive writes (task assignment, expert deduplication, lead status transitions) use `withSerializableTransaction()` with Prisma advisory locks.
- **Webhook deduplication** — every webhook is checked against `processed_webhook_events` by unique `eventId` before processing. Duplicate events are silently dropped.
- **Queue job deduplication** — deterministic job IDs via `buildJobId()` prevent double-enqueuing within the same time slice. Used extensively in auto-sourcing and scheduler cycles.
- **Cooldown enforcement** — 30-day cooldown window per expert across projects, enforced via `cooldown_logs` before outreach dispatch.
- **Correlation propagation** — every queue job and webhook handler receives and propagates a `correlationId` for end-to-end traceability across async boundaries.
- **Yay webhook freshness** — call events older than `YAY_WEBHOOK.MAX_EVENT_AGE_MS` (5 minutes) are rejected.

---

## Scheduler Maintenance Cycle (60 seconds)

Each tick performs:

1. **Dead-letter archival** — purge dead-letter records older than retention threshold.
2. **Performance recalculation** — enqueue `performance.recalculate` for every active caller.
3. **Call allocation refresh** — enqueue `call-allocation.assign-current` for every active caller.
4. **Screening follow-ups** — find stale screening responses (>15 min without update) and queue follow-ups.
5. **Signup chase** — for completed calls with outcome `INTERESTED_SIGNUP_LINK_SENT` and no activity in 24 hours, create new call tasks (max 3 per expert per day).
6. **Auto-sourcing** (every 5th tick) — run the auto-sourcing loop if 5 minutes have elapsed.

---

## Auth & Security

- **JWT** stored in `HttpOnly` + `Secure` + `SameSite=Strict` cookies.
- **CSRF** token required on all mutating requests (`POST`, `PUT`, `PATCH`, `DELETE`) via `x-csrf-token` header.
- **Roles**: `admin` (full access), `caller` (own tasks and call logs only).
- **Login**: `POST /api/v1/auth/login` → `Set-Cookie: access_token=...`
- **CSRF fetch**: `GET /api/v1/auth/csrf` → `{"csrfToken":"..."}`
- **Provider secrets**: AES-256-GCM encrypted in `provider_accounts.encryptedCredentials`, keyed by `PROVIDER_ENCRYPTION_SECRET` env var (minimum 32 characters).
