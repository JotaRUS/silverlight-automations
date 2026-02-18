# Setup Guide

## 1) Install dependencies

```bash
npm install
```

## 2) Configure environment

Copy the example file and fill real credentials:

```bash
cp .env.example .env
```

## 3) Start dependencies

```bash
docker compose up -d postgres redis
```

## 4) Run migrations

```bash
npm run db:migrate
```

## 5) Start application processes

API:

```bash
npm run dev
```

Worker:

```bash
npm run dev:worker
```

Scheduler:

```bash
npm run dev:scheduler
```

## 6) Validate baseline quality gates

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## 7) Run integration suite (requires live Postgres/Redis)

```bash
npm run test:integration
```
