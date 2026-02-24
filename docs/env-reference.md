# Environment Variables Reference

## Core runtime

- `NODE_ENV` (`development` | `test` | `production`)
- `PORT`
- `LOG_LEVEL`

## Data stores

- `DATABASE_URL`
- `REDIS_URL`
- `REDIS_NAMESPACE`

## Auth

- `JWT_ISSUER`
- `JWT_AUDIENCE`
- `JWT_SECRET`
- `JWT_ACCESS_TOKEN_TTL_SECONDS`

## AI

- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_CLASSIFICATION_TEMPERATURE` (must remain `<= 0.2`)

## Provider credential encryption

- `PROVIDER_ENCRYPTION_SECRET` (AES-256-GCM master secret for decrypting `provider_accounts.credentials_json`)

## Provider credentials

Provider integration secrets are now stored in the database (`ProviderAccount.credentialsJson`) and are
encrypted at rest. They are no longer loaded from environment variables.
