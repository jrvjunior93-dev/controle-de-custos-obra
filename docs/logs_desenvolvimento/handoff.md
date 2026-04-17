# Handoff Log

## 2026-04-17
- Fix: preserve `sectorStatus` during order upserts when the payload does not include `sectorStatus`.
  - Why: the `PUT /projects/:projectId/orders/:orderId` flow can run after setting sector status and would wipe it (treated missing as `null`), causing "need to change twice".
  - Implementation: in `upsertScopedOrder`, distinguish "field absent" vs "explicit clear" using `hasOwnProperty`, compute `requestedSectorStatus` and `nextSectorStatus`, and persist `nextSectorStatus`.
  - Files: `backend/src/index.ts`

- Safety: keep `PENDENTE` treated as universal sector status (no need to be configured in sector statuses).
  - Files: `backend/src/index.ts`

## Notes
- Frontend sets sector status via PATCH route (pencil modal). The main order status (legacy/yellow) is being phased out; prefer `sectorStatus` in UI.

