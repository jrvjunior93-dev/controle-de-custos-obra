ALTER TABLE `custos`
  ADD COLUMN `origem_pedido_id` INT NULL,
  ADD COLUMN `origem_parcela_id` INT NULL;

CREATE INDEX `custos_origem_pedido_id_idx` ON `custos`(`origem_pedido_id`);
CREATE INDEX `custos_origem_parcela_id_idx` ON `custos`(`origem_parcela_id`);

UPDATE `custos` c
JOIN `pedidos` p
  ON p.`obra_id` = c.`obra_id`
 AND p.`item_macro_id` = c.`item_macro_id`
 AND c.`descricao` = CONCAT('[PEDIDO] ', p.`titulo`)
 AND (
      c.`detalhe_item` = p.`descricao`
      OR (c.`detalhe_item` IS NULL AND p.`descricao` IS NULL)
     )
 AND (
      p.`valor_solicitado` IS NOT NULL
      AND c.`valor_total` = p.`valor_solicitado`
      AND c.`valor_unitario` = p.`valor_solicitado`
     )
SET c.`origem_pedido_id` = p.`id`
WHERE c.`origem_pedido_id` IS NULL;

UPDATE `custos` c
JOIN `parcelas` i
  ON i.`obra_id` = c.`obra_id`
 AND i.`item_macro_id` = c.`item_macro_id`
 AND c.`descricao` = i.`fornecedor`
 AND c.`detalhe_item` = CONCAT(i.`descricao`, ' (Parc ', i.`numero_parcela`, '/', i.`total_parcelas`, ')')
 AND c.`valor_total` = i.`valor`
 AND c.`valor_unitario` = i.`valor`
SET c.`origem_parcela_id` = i.`id`
WHERE c.`origem_parcela_id` IS NULL;
