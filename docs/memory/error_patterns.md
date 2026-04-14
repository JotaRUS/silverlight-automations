# Error patterns

When a confusion or mistake occurs, record it here with the fix so we don't repeat the same errors.

---

## Format

- **Pattern**: What went wrong (confusion, wrong assumption, bug).
- **Fix**: What fixed it or how to avoid it next time.
- **When**: Optional date or context.

---

## Entries

<!-- Add new entries at the top -->

- **Pattern**: PM2 shows `ZodError` for `JWT_SECRET` “too_small” while `.env` on disk has a long secret.
- **Fix**: `dotenv` previously did not override existing `process.env` keys; a stale/empty `JWT_SECRET` from the shell or service manager could win. `loadEnv({ override: true })` in `src/config/env.ts` makes `.env` authoritative. Verify with `env | grep JWT` and `pm2 restart all --update-env`.
- **When**: 2026-04 (Ubuntu PM2).
