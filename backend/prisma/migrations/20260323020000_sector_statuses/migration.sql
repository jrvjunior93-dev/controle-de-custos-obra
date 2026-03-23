ALTER TABLE `pedidos`
  ADD COLUMN `status_setorial` VARCHAR(191) NULL;

CREATE TABLE `setores_status_pedido` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `setor_id` INTEGER NOT NULL,
  `nome` VARCHAR(191) NOT NULL,
  `ordem` INTEGER NOT NULL DEFAULT 0,
  `ativo` BOOLEAN NOT NULL DEFAULT true,
  `criado_em` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `atualizado_em` DATETIME(3) NOT NULL,
  UNIQUE INDEX `setores_status_pedido_setor_id_nome_key`(`setor_id`, `nome`),
  INDEX `setores_status_pedido_setor_id_ordem_ativo_idx`(`setor_id`, `ordem`, `ativo`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `setores_status_pedido`
  ADD CONSTRAINT `setores_status_pedido_setor_id_fkey`
  FOREIGN KEY (`setor_id`) REFERENCES `setores`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;
