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
   - Frontend: `npm run dev:frontend`

## Validation commands

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run test:integration` (requires running PostgreSQL/Redis)
- `npm run build`

## API specification

- Runtime endpoint: `GET /api/v1/openapi.json`
- Downloadable Postman collection: `GET /api/v1/docs/postman-collection`
- Documentation generation endpoint: `POST /api/v1/documentation/generate`

## External access

- The web app uses cookie-based auth.
- External tools should use a personal API key created from `Admin -> API Keys`.
- API keys can be sent as `Authorization: Bearer <key>` or `x-api-key: <key>`.

## New admin surfaces

- `Admin -> Providers` supports `SUPABASE` as a destination provider for enriched lead exports.
- `Admin -> Projects` supports searchable full-world country selection plus stored company and job-title filters.
- `Admin -> Help -> API Docs` links to the OpenAPI contract and Postman collection download.
