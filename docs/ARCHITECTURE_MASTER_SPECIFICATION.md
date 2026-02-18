# Expert Sourcing Automation Platform

## Architecture Master Specification

This repository implements a deterministic, queue-driven automation platform for expert sourcing and outreach.

### Core guarantees

- Strict TypeScript mode.
- Express API with JWT auth and role guards.
- PostgreSQL persistence via Prisma.
- Redis-backed BullMQ orchestration with queue separation.
- Idempotent webhook ingestion and processing ledger.
- Deterministic clock abstraction for all time-based policies.
- Structured event logging with correlation IDs.
- Canonical channel normalization (`kakaotalk`).

### Runtime topology

- `api` process: HTTP ingress, validation, auth, webhooks.
- `worker` process: async call-event processing and background jobs.
- `scheduler` process: recurring maintenance and enforcement jobs.
- `postgres` and `redis` infrastructure services.

### Data model scope

Implemented schema includes:

- projects, companies, job_titles, sales_nav_searches, leads
- experts, expert_contacts, enrichment_attempts
- cooldown_logs, outreach_threads, outreach_messages
- screening_questions, screening_responses
- call_tasks, call_logs, call_logs_raw
- callers, caller_performance_metrics
- ranking_snapshots
- google_sheet_exports, google_sheet_row_map
- system_events
- dead_letter_jobs
- processed_webhook_events

### Integration boundary

Domain modules never call providers directly; external systems are accessed through `src/integrations/*` adapters.

### Concurrency and idempotency policy

- Identity-sensitive writes are serialized via advisory-lock + serializable transaction helpers.
- Webhook duplication is blocked through `processed_webhook_events` unique `eventId`.
- Queue and webhook handlers are correlation-aware for full traceability.
