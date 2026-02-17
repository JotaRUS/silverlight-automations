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

## Immediate next implementation tracks

- Expand module endpoints (projects, sales nav intake, screening CRUD)
- Complete enrichment provider adapters
- Complete outreach channel adapters
- Implement ranking and call-allocation workers
- Implement Google Sheets sync jobs and exporters
