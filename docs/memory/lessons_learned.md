# Lessons learned

Record new learnings here so the same insights can be reused and we save tokens.

---

## Format

- **Topic**: One-line title.
- **What we learned**: Short description.
- **When**: Optional date or context.

---

## Entries

<!-- Add new entries at the top -->

- **Topic**: Next.js 16 local login `Request failed (404)`.
- **What we learned**: The admin UI calls `/api/v1/*` on the Next origin; `next.config.mjs` rewrites to `BACKEND_ORIGIN` (default `localhost:3000`). If the Express API is not running, or Turbopack dev mishandles rewrites, the client sees 404-style failures. Fix: run `npm run dev` (API) alongside `npm run dev:frontend`; use `next dev --webpack` for the frontend dev script if rewrites misbehave.
- **When**: 2026-04.

- **Topic**: PM2 production start path.
- **What we learned**: After `npm run build`, the API runs from `dist/app/server.js` (`npm start`). Do not use `dist/api/server.js`; keep deployment docs aligned with `package.json`.
- **When**: Physical Ubuntu deploy, 2026-04.

- **Topic**: New project wizard outreach template.
- **What we learned**: Reuse `TEMPLATE_VARIABLES`, textarea + `insertVariable` pattern from `app/admin/projects/[id]/page.tsx`; save `outreachMessageTemplate` in the same `updateProject` call as provider bindings after `createProject`.
