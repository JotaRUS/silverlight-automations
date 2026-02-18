# Developer Handover Guide

## Codebase layout

- `src/app` - process bootstrap and lifecycle
- `src/api` - HTTP routes
- `src/modules` - domain orchestration
- `src/integrations` - provider adapter boundary
- `src/queues` - queue producers/workers
- `src/db` - repositories and transaction policies
- `prisma` - schema and migrations
- `docs` - operational and architecture documentation

## Operational policies implemented

- Canonical channel normalization (`kakaotalk`)
- Deterministic UTC clock abstraction
- Serializable/advisory-lock helpers for identity writes
- DLQ archival strategy
- Redis namespace prefixing per environment
- HMAC + idempotent Yay webhook processing
- Caller-only call task execution endpoints with role-enforced operator workflows
- Tab-aware Google Sheets export with append/update row mapping
- OpenAPI runtime endpoint (`/api/v1/openapi.json`) and generated docs artifacts

## Current implementation status

- API, workers, scheduler, Prisma schema, and queue topology are implemented.
- Unit and route-level suites are green (`npm test`).
- Integration suites are implemented under `tests/integration`, but require a running PostgreSQL/Redis environment.

## Operational runbook pointers

- `docs/setup.md` - local bootstrap
- `docs/deployment.md` - docker compose deployment
- `docs/env-reference.md` - required configuration keys
- `docs/state-machines.md` - lifecycle transition references
