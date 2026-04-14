# Done index

Mark deliverables as completed here so we don't repeat work. One entry per deliverable; include date and brief description.

---

## Format

- **YYYY-MM-DD**: Short description of what was completed.

---

## Entries

<!-- Add new entries at the top -->

- **2026-04-14**: Frontend: root `app/layout.tsx` is server-only; `AuthProvider` / React Query / Toaster moved to `app/(app)/layout.tsx` so `/_global-error` build prerender avoids `useContext` null. `npm run build` uses `NODE_ENV=production` to silence Next non-standard NODE_ENV warning.
- **2026-04-14**: Frontend: `/admin/help/providers/[providerSlug]` uses `dynamic = 'force-dynamic'` so `next build` does not prerender it under client admin layout (fixes `useState` / prerender error on provider guides e.g. datagma).
- **2026-04-14**: `FIRST_DEPLOYMENT_AND_MAINTENANCE.md`: PM2 tip — `pm2 start all` when multi-process state is bad; `--update-env` after `.env` edits.
- **2026-04-14**: Frontend dev: `next dev --webpack -p 3001` so `/api/v1` rewrites proxy reliably; README notes API must run on :3000 for login.
- **2026-04-14**: `FIRST_DEPLOYMENT_AND_MAINTENANCE.md`: added nano/vim steps for editing `.env` on Ubuntu.
- **2026-04-14**: Deployment doc: PM2 API entry corrected to `dist/app/server.js` (matches `package.json` / `tsc` output; `dist/api/` was stale).
- **2026-04-01**: Supply chain review: no `axios`, `plain-crypto-js`, or vulnerable axios versions (`1.14.1`, `0.30.4`) in lockfiles or repo; no remediation pin required for this codebase.
- **2025-03-25**: Screening dispatch: resolve `ExpertContact` by `LINKEDIN` type when channel is `LINKEDIN` (was incorrectly using `PHONE`). LinkedIn send path uses OAuth on Sales Nav provider + Messages API, not session cookie.
- **2025-03-25**: Dispatch Screening empty state: “Add screening questions” button selects project, closes panel, scrolls to `#screening-questions-section`, opens add-question form via `autoOpenAddSignal`.
- **2025-03-25**: Restored initial outreach message template on new project wizard when at least one outreach channel is selected; persisted via `updateProject` as `outreachMessageTemplate` (aligned with project edit page).
