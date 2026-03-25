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

- **Topic**: New project wizard outreach template.
- **What we learned**: Reuse `TEMPLATE_VARIABLES`, textarea + `insertVariable` pattern from `app/admin/projects/[id]/page.tsx`; save `outreachMessageTemplate` in the same `updateProject` call as provider bindings after `createProject`.
