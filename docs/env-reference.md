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

## URLs (OAuth / admin)

- `EXTERNAL_APP_BASE_URL` — Public origin of the deployed app (e.g. `https://silverlight-automations.example` or `http://localhost:3000`). Used by auth helpers and to **derive** the Sales Navigator LinkedIn redirect when the variable below is omitted.
- `LINKEDIN_OAUTH_REDIRECT_URI` — **Optional.** Full URL for `GET /api/v1/providers/linkedin/oauth/callback`. Must match **exactly** what is registered under LinkedIn app → **Authorized redirect URLs**. If unset, defaults to `{EXTERNAL_APP_BASE_URL}/api/v1/providers/linkedin/oauth/callback`.

On staging/production, set `EXTERNAL_APP_BASE_URL` to your public HTTPS origin (same host nginx forwards to the API). You only need `LINKEDIN_OAUTH_REDIRECT_URI` if the callback URL differs from that default (e.g. API on a separate subdomain).

## AI

- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_CLASSIFICATION_TEMPERATURE` (must remain `<= 0.2`)

## Provider credential encryption

- `PROVIDER_ENCRYPTION_SECRET` (AES-256-GCM master secret for decrypting `provider_accounts.credentials_json`)

## Provider credentials

Provider integration secrets are now stored in the database (`ProviderAccount.credentialsJson`) and are
encrypted at rest. They are no longer loaded from environment variables.
