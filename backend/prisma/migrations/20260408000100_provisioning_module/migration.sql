ALTER TABLE `usuarios`
  ADD COLUMN `pode_acessar_provisionamento` TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN `pode_criar_provisionamento` TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN `pode_aprovar_provisionamento` TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN `pode_dashboard_provisionamento` TINYINT(1) NOT NULL DEFAULT 0;

CREATE TABLE `provisionamento_categorias` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `nome` VARCHAR(191) NOT NULL,
  `descricao` TEXT NULL,
  `ordem` INT NOT NULL DEFAULT 0,
  `ativo` TINYINT(1) NOT NULL DEFAULT 1,
  `criado_em` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `atualizado_em` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `provisionamento_categorias_nome_key`(`nome`),
  INDEX `provisionamento_categorias_ordem_ativo_idx`(`ordem`, `ativo`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `provisionamento_sequencias` (
  `obra_id` INT NOT NULL,
  `ultimo_numero` INT NOT NULL DEFAULT 0,
  `criado_em` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `atualizado_em` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`obra_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `provisionamentos` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `obra_id` INT NOT NULL,
  `categoria_id` INT NOT NULL,
  `codigo` VARCHAR(191) NOT NULL,
  `titulo` VARCHAR(191) NOT NULL,
  `descricao` TEXT NOT NULL,
  `fornecedor` VARCHAR(191) NULL,
  `data_prevista` DATETIME(3) NOT NULL,
  `valor_previsto` DECIMAL(15, 2) NOT NULL,
  `status` ENUM('RASCUNHO', 'PREVISTO', 'EM_ANALISE', 'APROVADO', 'CANCELADO', 'REALIZADO') NOT NULL DEFAULT 'PREVISTO',
  `comentario` TEXT NULL,
  `criado_por_usuario_id` INT NOT NULL,
  `atualizado_por_usuario_id` INT NULL,
  `aprovado_por_usuario_id` INT NULL,
  `aprovado_em` DATETIME(3) NULL,
  `cancelado_por_usuario_id` INT NULL,
  `cancelado_em` DATETIME(3) NULL,
  `realizado_em` DATETIME(3) NULL,
  `criado_em` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `atualizado_em` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `provisionamentos_codigo_key`(`codigo`),
  INDEX `provisionamentos_obra_id_data_prevista_idx`(`obra_id`, `data_prevista`),
  INDEX `provisionamentos_categoria_id_data_prevista_idx`(`categoria_id`, `data_prevista`),
  INDEX `provisionamentos_status_data_prevista_idx`(`status`, `data_prevista`),
  INDEX `provisionamentos_criado_por_usuario_id_criado_em_idx`(`criado_por_usuario_id`, `criado_em`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `provisionamentos_historico` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `provisionamento_id` INT NOT NULL,
  `usuario_id` INT NULL,
  `acao` VARCHAR(191) NOT NULL,
  `descricao` TEXT NOT NULL,
  `status_anterior` ENUM('RASCUNHO', 'PREVISTO', 'EM_ANALISE', 'APROVADO', 'CANCELADO', 'REALIZADO') NULL,
  `status_novo` ENUM('RASCUNHO', 'PREVISTO', 'EM_ANALISE', 'APROVADO', 'CANCELADO', 'REALIZADO') NULL,
  `criado_em` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `provisionamentos_historico_provisionamento_id_criado_em_idx`(`provisionamento_id`, `criado_em`),
  INDEX `provisionamentos_historico_usuario_id_idx`(`usuario_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `provisionamentos_anexos` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `provisionamento_id` INT NOT NULL,
  `historico_id` INT NULL,
  `tipo` ENUM('REQUEST', 'COMPLETION', 'ATTACHMENT', 'PAYMENT_PROOF', 'MESSAGE', 'COST_DOCUMENT', 'PROVISIONING_ATTACHMENT', 'PROVISIONING_HISTORY_ATTACHMENT', 'PROVISIONING_APPROVAL_ATTACHMENT') NOT NULL DEFAULT 'PROVISIONING_ATTACHMENT',
  `nome` VARCHAR(191) NOT NULL,
  `nome_original` VARCHAR(191) NULL,
  `dados` LONGTEXT NULL,
  `provedor_armazenamento` VARCHAR(191) NULL,
  `bucket_armazenamento` VARCHAR(191) NULL,
  `chave_armazenamento` VARCHAR(191) NULL,
  `tipo_mime` VARCHAR(191) NOT NULL,
  `tamanho` INT NOT NULL,
  `usuario_id` INT NOT NULL,
  `enviado_em` DATETIME(3) NOT NULL,
  INDEX `provisionamentos_anexos_provisionamento_id_enviado_em_idx`(`provisionamento_id`, `enviado_em`),
  INDEX `provisionamentos_anexos_historico_id_idx`(`historico_id`),
  INDEX `provisionamentos_anexos_usuario_id_idx`(`usuario_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `provisionamento_sequencias`
  ADD CONSTRAINT `provisionamento_sequencias_obra_id_fkey`
  FOREIGN KEY (`obra_id`) REFERENCES `obras`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `provisionamentos`
  ADD CONSTRAINT `provisionamentos_obra_id_fkey`
  FOREIGN KEY (`obra_id`) REFERENCES `obras`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `provisionamentos_categoria_id_fkey`
  FOREIGN KEY (`categoria_id`) REFERENCES `provisionamento_categorias`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `provisionamentos_criado_por_usuario_id_fkey`
  FOREIGN KEY (`criado_por_usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `provisionamentos_atualizado_por_usuario_id_fkey`
  FOREIGN KEY (`atualizado_por_usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `provisionamentos_aprovado_por_usuario_id_fkey`
  FOREIGN KEY (`aprovado_por_usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `provisionamentos_cancelado_por_usuario_id_fkey`
  FOREIGN KEY (`cancelado_por_usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `provisionamentos_historico`
  ADD CONSTRAINT `provisionamentos_historico_provisionamento_id_fkey`
  FOREIGN KEY (`provisionamento_id`) REFERENCES `provisionamentos`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `provisionamentos_historico_usuario_id_fkey`
  FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `provisionamentos_anexos`
  ADD CONSTRAINT `provisionamentos_anexos_provisionamento_id_fkey`
  FOREIGN KEY (`provisionamento_id`) REFERENCES `provisionamentos`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `provisionamentos_anexos_historico_id_fkey`
  FOREIGN KEY (`historico_id`) REFERENCES `provisionamentos_historico`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `provisionamentos_anexos_usuario_id_fkey`
  FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO `provisionamento_categorias` (`nome`, `descricao`, `ordem`, `ativo`)
VALUES
  ('DESPESA OPERACIONAL', 'Categoria inicial do modulo de provisionamento.', 0, 1),
  ('CONTRATO', 'Categoria inicial do modulo de provisionamento.', 1, 1),
  ('FORNECEDOR', 'Categoria inicial do modulo de provisionamento.', 2, 1)
ON DUPLICATE KEY UPDATE
  `descricao` = VALUES(`descricao`),
  `ordem` = VALUES(`ordem`),
  `ativo` = VALUES(`ativo`);
