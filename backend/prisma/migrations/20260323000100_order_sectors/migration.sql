CREATE TABLE `setores` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `nome` VARCHAR(191) NOT NULL,
  `ativo` BOOLEAN NOT NULL DEFAULT true,
  `criado_em` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `atualizado_em` DATETIME(3) NOT NULL,
  UNIQUE INDEX `setores_nome_key`(`nome`),
  INDEX `setores_nome_ativo_idx`(`nome`, `ativo`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `usuarios`
  ADD COLUMN `setor_id` INTEGER NULL;

ALTER TABLE `pedidos`
  ADD COLUMN `setor_atual_id` INTEGER NULL;

CREATE TABLE `pedidos_setores_acesso` (
  `pedido_id` INTEGER NOT NULL,
  `setor_id` INTEGER NOT NULL,
  `criado_em` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `pedidos_setores_acesso_setor_id_idx`(`setor_id`),
  PRIMARY KEY (`pedido_id`, `setor_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `usuarios`
  ADD INDEX `usuarios_setor_id_idx`(`setor_id`);

ALTER TABLE `pedidos`
  ADD INDEX `pedidos_setor_atual_id_idx`(`setor_atual_id`);

ALTER TABLE `usuarios`
  ADD CONSTRAINT `usuarios_setor_id_fkey`
  FOREIGN KEY (`setor_id`) REFERENCES `setores`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `pedidos`
  ADD CONSTRAINT `pedidos_setor_atual_id_fkey`
  FOREIGN KEY (`setor_atual_id`) REFERENCES `setores`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `pedidos_setores_acesso`
  ADD CONSTRAINT `pedidos_setores_acesso_pedido_id_fkey`
  FOREIGN KEY (`pedido_id`) REFERENCES `pedidos`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `pedidos_setores_acesso`
  ADD CONSTRAINT `pedidos_setores_acesso_setor_id_fkey`
  FOREIGN KEY (`setor_id`) REFERENCES `setores`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;
