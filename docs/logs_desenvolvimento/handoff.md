# Handoff Log

## 2026-05-14
- Feature: adiciona lotes de prioridade para pedidos, adaptando a ideia do Fluxy para o BRAPE.
  - Fluxo: `DIRETORIA ADMINISTRATIVA` abre lote com valor disponivel; `DIRETORIA DE OBRAS` abre lote sem valor; selecao pode ser salva; envio passa para `AGUARDANDO_APROVACAO`; aprovacao da administrativa marca pedidos como prioridade aprovada.
  - Backend: novos modelos/tabelas `lotes_prioridade_pedidos`, `lotes_prioridade_pedidos_itens` e campos de prioridade em `pedidos`; API `/order-priority-batches`.
  - Frontend: nova tela `Prioridades`, filtros por busca/obra/selecionados, preservacao de selecionados ao filtrar/limpar, badges de prioridade nas listas de pedidos.
  - Files: `backend/prisma/schema.prisma`, `backend/prisma/migrations/20260514000100_order_priority_batches/migration.sql`, `backend/src/index.ts`, `frontend/App.tsx`, `frontend/apiClient.ts`, `frontend/types.ts`, `frontend/components/OrderPriorityBatchesModule.tsx`, `frontend/components/GlobalOrdersModule.tsx`, `frontend/components/OrdersModule.tsx`, `docs/regras_negocio/pedidos.md`
  - Risk: requer aplicar migration e garantir que os setores estejam cadastrados exatamente como `DIRETORIA ADMINISTRATIVA` e `DIRETORIA DE OBRAS`.

## 2026-04-17
- Fix: preserve `sectorStatus` during order upserts when the payload does not include `sectorStatus`.
  - Why: the `PUT /projects/:projectId/orders/:orderId` flow can run after setting sector status and would wipe it (treated missing as `null`), causing "need to change twice".
  - Implementation: in `upsertScopedOrder`, distinguish "field absent" vs "explicit clear" using `hasOwnProperty`, compute `requestedSectorStatus` and `nextSectorStatus`, and persist `nextSectorStatus`.
  - Files: `backend/src/index.ts`

- Safety: keep `PENDENTE` treated as universal sector status (no need to be configured in sector statuses).
  - Files: `backend/src/index.ts`

## Notes
- Frontend sets sector status via PATCH route (pencil modal). The main order status (legacy/yellow) is being phased out; prefer `sectorStatus` in UI.
