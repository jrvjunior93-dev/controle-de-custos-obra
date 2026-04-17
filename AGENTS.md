# Collaboration Notes (Codex / Multi-Agent)

This repo is in production. Prefer small, safe changes and always validate with `build` before pushing.

## Structure
- `backend/` Node + Express + Prisma (MySQL RDS)
- `frontend/` Vite + React SPA
- Storage: S3 is used for attachments. Signed URLs are generated at access time.

## Key Flows
- Orders create/update: `PUT /projects/:projectId/orders/:orderId`
- Order sector status: `PATCH /projects/:projectId/orders/:orderId/sector-status`
- Order messages: `POST /projects/:projectId/orders/:orderId/messages`

## Known Pitfalls
- `Order.id` is `Int` in DB. Frontend creates a UUID locally and then replaces it after persistence.
- Never delete S3 objects automatically from normal flows.
- Avoid optimistic UI that can overwrite server state with stale snapshots.

## Local Validation
- Backend: `npm.cmd --prefix backend run build:prod`
- Frontend: `npm.cmd --prefix frontend run build`

## Handoff Log
Keep a running log at `docs/logs_desenvolvimento/handoff.md` (date, change, files, risk).

