# Handoff Log

## 2026-05-15
- Change: amplia acompanhamento de lotes de prioridade para o setor financeiro.
  - Usuarios do setor `FINANCEIRO` passam a acessar a tela `Prioridades`, com permissao de visualizacao dos lotes e sem acoes de selecao/aprovacao.
  - Menu passa a exibir badge vermelho em `Prioridades` contando lotes criados, enviados, aprovados, recusados ou cancelados desde a ultima visualizacao do usuario.
  - Files: `backend/src/index.ts`, `frontend/App.tsx`, `frontend/types.ts`, `docs/regras_negocio/pedidos.md`
  - Risk: baixo/medio; acesso novo e de leitura para financeiro, com polling leve de lotes visiveis no menu.

## 2026-05-14
- Fix: corrige selecao visual na lista filtrada de prioridade diretoria.
  - A uniao entre pedidos filtrados e pedidos ja selecionados passa a preservar a ordem retornada pelo filtro, anexando selecionados ausentes apenas no final.
  - Evita que um pedido recem-marcado salte para o topo da tabela e aparente selecionar outro pedido acima.
  - Atualiza regra de negocio documentando autosave, preservacao de ordem visual e bloqueio de pedidos `PAGO`.
  - Files: `frontend/components/OrderPriorityBatchesModule.tsx`, `docs/regras_negocio/pedidos.md`
  - Risk: baixo; alteracao restrita a ordenacao local da lista exibida e ao texto documental.

- Fix: ajusta prioridade diretoria para nao trabalhar com pedidos ja pagos.
  - Pedidos com status setorial `PAGO` deixam de aparecer na busca/lista de elegiveis, nao podem ser salvos na selecao e tambem sao bloqueados no envio/aprovacao do lote.
  - Selecao na tela de prioridades agora e persistida automaticamente ao marcar/desmarcar o pedido, mantendo itens selecionados ao trocar filtro de obra mesmo sem acionar o botao salvar.
  - Files: `backend/src/index.ts`, `frontend/components/OrderPriorityBatchesModule.tsx`
  - Risk: lotes abertos que ja tenham item salvo e posteriormente marcado como `PAGO` precisam ter a selecao revisada antes de enviar/aprovar.

- Feature: adiciona lotes de prioridade para pedidos, adaptando a ideia do Fluxy para o BRAPE.
  - Fluxo: `DIRETORIA ADMINISTRATIVA` abre lote com valor disponivel; `DIRETORIA DE OBRAS` abre lote sem valor; selecao pode ser salva; envio passa para `AGUARDANDO_APROVACAO`; aprovacao da administrativa marca pedidos como prioridade aprovada.
  - Backend: novos modelos/tabelas `lotes_prioridade_pedidos`, `lotes_prioridade_pedidos_itens` e campos de prioridade em `pedidos`; API `/order-priority-batches`.
  - Frontend: nova tela `Prioridades`, filtros por busca/obra/selecionados, preservacao de selecionados ao filtrar/limpar, badges de prioridade nas listas de pedidos.
  - Files: `backend/prisma/schema.prisma`, `backend/prisma/migrations/20260514000100_order_priority_batches/migration.sql`, `backend/src/index.ts`, `frontend/App.tsx`, `frontend/apiClient.ts`, `frontend/types.ts`, `frontend/components/OrderPriorityBatchesModule.tsx`, `frontend/components/GlobalOrdersModule.tsx`, `frontend/components/OrdersModule.tsx`, `docs/regras_negocio/pedidos.md`
  - Risk: requer aplicar migration e garantir que os setores estejam cadastrados exatamente como `DIRETORIA ADMINISTRATIVA` e `DIRETORIA DE OBRAS`.

- Adjustment: adiciona atalho `Prioridade financeiro` na Central de Pedidos para usuarios do setor `DIRETORIA DE OBRAS`.
  - Fluxo: usuario seleciona pedidos, aciona o botao, o sistema cria lote `DIRETORIA_OBRAS`, salva a selecao e envia para aprovacao da `DIRETORIA ADMINISTRATIVA`.
  - Visibilidade: membros do setor `FINANCEIRO` passam a enxergar pedidos com `prioridade_aprovada`, mesmo quando o pedido nao esta no setor atual deles.
  - Files: `frontend/components/GlobalOrdersModule.tsx`, `backend/src/index.ts`

- Audit/Fix: revisa botoes de acao de pedidos para evitar tela desatualizada apos falha ou retorno canonico da API.
  - Central de Pedidos: encaminhamento em massa, exclusao, reabertura, valor, apropriacao e encaminhamento agora aguardam persistencia, substituem pelo pedido retornado pela API quando aplicavel e fazem rollback em erro.
  - Pedidos da obra: apropriacao, encaminhamento e reabertura passam a tratar erro de persistencia com alerta em vez de falha silenciosa.
  - Files: `frontend/components/GlobalOrdersModule.tsx`, `frontend/components/OrdersModule.tsx`

- Fix: reforca sincronizacao visual apos alterar status setorial do pedido.
  - App passa a normalizar/substituir o pedido salvo usando o estado atual de projetos, evitando usar snapshot antigo no primeiro PATCH.
  - Central de Pedidos tambem substitui imediatamente o pedido local pelo retorno do endpoint de status setorial.
  - Files: `frontend/App.tsx`, `frontend/components/GlobalOrdersModule.tsx`

- Change: remove fluxo legado de tratamento por status principal de pedidos.
  - Interface deixa de oferecer concluir, cancelar e reabrir pedido; o fluxo operacional passa a ser comentario, anexo, encaminhamento e status setorial.
  - Regras de tela e backend deixam de bloquear comentario, anexo, status setorial e lotes de prioridade por `CONCLUIDO`/`CANCELADO` legado.
  - O campo `status` principal continua no modelo por compatibilidade, mas nao guia mais a operacao atual.
  - Files: `frontend/components/OrdersModule.tsx`, `frontend/components/GlobalOrdersModule.tsx`, `frontend/components/ProjectDetail.tsx`, `backend/src/index.ts`

- Fix: recarrega projetos/pedidos ao fechar o modal de pedido.
  - Ao fechar o modal na aba Pedidos ou na Central de Pedidos, a tela busca novamente `/projects` e atualiza os pedidos visiveis.
  - Objetivo: status setorial alterado aparece na lista sem exigir refresh manual do navegador.
  - Files: `frontend/App.tsx`, `frontend/components/ProjectDetail.tsx`, `frontend/components/OrdersModule.tsx`, `frontend/components/GlobalOrdersModule.tsx`

- Change: custos executados passam a ser derivados exclusivamente de pedidos com status setorial `PAGO`.
  - Nova fonte visual: `project.orders` filtrado por `sectorStatus === PAGO`; a tabela manual `costs` permanece no banco apenas como legado/auditoria.
  - Tela Custos, dashboard/resumo, lista de obras e relatorios internos passam a usar pedidos pagos.
  - Remove dos modais de pedido a opcao manual de vincular pedido ao custo da obra.
  - Files: `frontend/utils/orderCosts.ts`, `frontend/components/CostModule.tsx`, `frontend/components/ConsolidationModule.tsx`, `frontend/components/ProjectDetail.tsx`, `frontend/components/ProjectList.tsx`, `frontend/components/OrdersModule.tsx`, `frontend/components/GlobalOrdersModule.tsx`

## 2026-04-17
- Fix: preserve `sectorStatus` during order upserts when the payload does not include `sectorStatus`.
  - Why: the `PUT /projects/:projectId/orders/:orderId` flow can run after setting sector status and would wipe it (treated missing as `null`), causing "need to change twice".
  - Implementation: in `upsertScopedOrder`, distinguish "field absent" vs "explicit clear" using `hasOwnProperty`, compute `requestedSectorStatus` and `nextSectorStatus`, and persist `nextSectorStatus`.
  - Files: `backend/src/index.ts`

- Safety: keep `PENDENTE` treated as universal sector status (no need to be configured in sector statuses).
  - Files: `backend/src/index.ts`

## Notes
- Frontend sets sector status via PATCH route (pencil modal). The main order status (legacy/yellow) is being phased out; prefer `sectorStatus` in UI.
