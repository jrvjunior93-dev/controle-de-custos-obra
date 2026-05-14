CREATE TABLE `lotes_prioridade_pedidos` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `tipo` ENUM('DIRETORIA_ADMINISTRATIVA', 'DIRETORIA_OBRAS') NOT NULL,
  `status` ENUM('ABERTO', 'AGUARDANDO_APROVACAO', 'APROVADO', 'RECUSADO', 'CANCELADO') NOT NULL DEFAULT 'ABERTO',
  `setor_origem` VARCHAR(191) NOT NULL,
  `setor_destino` VARCHAR(191) NOT NULL,
  `valor_disponivel` DECIMAL(15, 2) NULL,
  `valor_selecionado` DECIMAL(15, 2) NOT NULL DEFAULT 0,
  `observacao` TEXT NULL,
  `motivo_recusa` TEXT NULL,
  `criado_por_usuario_id` INTEGER NOT NULL,
  `enviado_por_usuario_id` INTEGER NULL,
  `enviado_em` DATETIME(3) NULL,
  `aprovado_por_usuario_id` INTEGER NULL,
  `aprovado_em` DATETIME(3) NULL,
  `recusado_por_usuario_id` INTEGER NULL,
  `recusado_em` DATETIME(3) NULL,
  `cancelado_por_usuario_id` INTEGER NULL,
  `cancelado_em` DATETIME(3) NULL,
  `criado_em` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `atualizado_em` DATETIME(3) NOT NULL,

  INDEX `lotes_prioridade_pedidos_status_criado_em_idx`(`status`, `criado_em`),
  INDEX `lotes_prioridade_pedidos_tipo_status_idx`(`tipo`, `status`),
  INDEX `lotes_prioridade_pedidos_criado_por_usuario_id_idx`(`criado_por_usuario_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `lotes_prioridade_pedidos_itens` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `lote_id` INTEGER NOT NULL,
  `pedido_id` INTEGER NOT NULL,
  `valor_selecionado` DECIMAL(15, 2) NOT NULL DEFAULT 0,
  `selecionado_por_usuario_id` INTEGER NULL,
  `selecionado_em` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `lotes_prioridade_pedidos_itens_lote_id_pedido_id_key`(`lote_id`, `pedido_id`),
  INDEX `lotes_prioridade_pedidos_itens_pedido_id_idx`(`pedido_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `pedidos`
  ADD COLUMN `prioridade_aprovada` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `prioridade_aprovada_em` DATETIME(3) NULL,
  ADD COLUMN `prioridade_lote_id` INTEGER NULL,
  ADD INDEX `pedidos_prioridade_aprovada_idx`(`prioridade_aprovada`),
  ADD INDEX `pedidos_prioridade_lote_id_idx`(`prioridade_lote_id`);

ALTER TABLE `lotes_prioridade_pedidos`
  ADD CONSTRAINT `lotes_prioridade_pedidos_criado_por_usuario_id_fkey`
  FOREIGN KEY (`criado_por_usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `lotes_prioridade_pedidos_enviado_por_usuario_id_fkey`
  FOREIGN KEY (`enviado_por_usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `lotes_prioridade_pedidos_aprovado_por_usuario_id_fkey`
  FOREIGN KEY (`aprovado_por_usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `lotes_prioridade_pedidos_recusado_por_usuario_id_fkey`
  FOREIGN KEY (`recusado_por_usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `lotes_prioridade_pedidos_cancelado_por_usuario_id_fkey`
  FOREIGN KEY (`cancelado_por_usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `lotes_prioridade_pedidos_itens`
  ADD CONSTRAINT `lotes_prioridade_pedidos_itens_lote_id_fkey`
  FOREIGN KEY (`lote_id`) REFERENCES `lotes_prioridade_pedidos`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `lotes_prioridade_pedidos_itens_pedido_id_fkey`
  FOREIGN KEY (`pedido_id`) REFERENCES `pedidos`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `lotes_prioridade_pedidos_itens_selecionado_por_usuario_id_fkey`
  FOREIGN KEY (`selecionado_por_usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `pedidos`
  ADD CONSTRAINT `pedidos_prioridade_lote_id_fkey`
  FOREIGN KEY (`prioridade_lote_id`) REFERENCES `lotes_prioridade_pedidos`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
