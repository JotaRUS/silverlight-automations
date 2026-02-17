# Expert Sourcing Automation Platform

Deterministic, queue-driven expert sourcing and outreach backend.

## Quick start

1. `cp .env.example .env`
2. `npm install`
3. `docker compose up -d postgres redis`
4. `npm run db:migrate`
5. Start processes:
   - API: `npm run dev`
   - Worker: `npm run dev:worker`
   - Scheduler: `npm run dev:scheduler`

## Validation commands

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`

## API specification

- Runtime endpoint: `GET /api/v1/openapi.json`
