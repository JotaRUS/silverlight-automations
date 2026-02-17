# Deployment (Docker Compose)

## Build and run full stack

```bash
docker compose up --build -d
```

Services:

- `api` -> Express API
- `worker` -> BullMQ processors
- `scheduler` -> recurring maintenance jobs
- `postgres` -> PostgreSQL 15
- `redis` -> Redis 7

## Run migrations after deployment

```bash
docker compose exec api npm run db:migrate
```

## Basic health check

```bash
curl http://localhost:3000/api/v1/system/health
```
