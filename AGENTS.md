# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Expert Sourcing Automation Platform — a queue-driven expert sourcing/outreach backend (Express + Prisma + BullMQ) with a Next.js 14 admin frontend. See `README.md` for quick-start commands.

### Architecture

| Service | Port | Command |
|---|---|---|
| Backend API | 3000 | `npm run dev` |
| Backend Workers | — | `npm run dev:worker` |
| Backend Scheduler | — | `npm run dev:scheduler` |
| Frontend (Next.js) | 3001 | `cd frontend && npm run dev` |
| PostgreSQL 15 | 5432 | `docker compose up -d postgres` |
| Redis 7 | 6379 | `docker compose up -d redis` |

### Starting services

1. Start Docker daemon: `sudo dockerd &>/tmp/dockerd.log &` (wait ~3s)
2. Start infra: `docker compose up -d postgres redis`
3. Run migrations: `npx prisma migrate deploy`
4. Start API: `npm run dev` (background or separate terminal)
5. Start workers: `npm run dev:worker` (background or separate terminal)
6. Optionally start frontend: `cd frontend && npm run dev`

### Validation commands

Per `README.md`: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. Frontend lint: `cd frontend && npm run lint`. Frontend tests: `cd frontend && npm test`.

### Auth for API testing

The API uses cookie-based JWT auth. To call protected endpoints:
1. `POST /api/v1/auth/login` with `{"userId":"admin-user","role":"admin"}` — returns `Set-Cookie: access_token=...`
2. `GET /api/v1/auth/csrf` with the cookie — returns `{"csrfToken":"..."}` 
3. Pass both cookie and `x-csrf-token` header on mutating requests (POST/PUT/PATCH/DELETE).

### Gotchas

- Docker runs inside a Firecracker VM; you need `fuse-overlayfs` storage driver and `iptables-legacy`. See daemon config at `/etc/docker/daemon.json`.
- The `.env` file must exist with valid `JWT_SECRET` and `PROVIDER_ENCRYPTION_SECRET` (32+ chars). Copy from `.env.example` and replace the placeholder values.
- `frontend/next.config.mjs` rewrites `/api/v1/*` to the Express API (`BACKEND_ORIGIN`, default `http://localhost:3000`). **Start `npm run dev` (API) before using the UI** or login may show `Request failed (404)`. Frontend dev uses `next dev --webpack` so rewrites work reliably under Next.js 16.
- Integration tests (`npm run test:integration`) require live PostgreSQL and Redis.

### Step 3 — Update memory (end of task)

To avoid repeating work and save tokens, at the end of tasks update `docs/memory/` when relevant: `done_index.md` (mark deliverable done), `lessons_learned.md`, `error_patterns.md`, `open_questions.md`, `backlog.md` (remove completed, reprioritize). See `docs/memory/README.md`.
