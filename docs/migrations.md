# Database Migration Guide

## Generate Prisma client

```bash
npm run prisma:generate
```

## Apply migrations in production-style environments

```bash
npm run db:migrate
```

## Create a new migration during development

```bash
npm run db:migrate:dev -- --name <migration_name>
```

## Notes

- Migrations are committed under `prisma/migrations`.
- Initial migration was generated from the full schema datamodel and includes all required tables.
