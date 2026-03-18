-- CreateTable
CREATE TABLE `usuarios` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(191) NOT NULL,
    `senha_hash` VARCHAR(191) NOT NULL,
    `nome` VARCHAR(191) NOT NULL,
    `perfil` ENUM('SUPERADMIN', 'ADMIN', 'ADMIN_OBRA', 'MEMBRO') NOT NULL,
    `gestor_id` INTEGER NULL,
    `ativo` BOOLEAN NOT NULL DEFAULT true,
    `criado_em` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `atualizado_em` DATETIME(3) NOT NULL,

    UNIQUE INDEX `usuarios_email_key`(`email`),
    INDEX `usuarios_perfil_ativo_idx`(`perfil`, `ativo`),
    INDEX `usuarios_gestor_id_idx`(`gestor_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `usuarios_obras` (
    `usuario_id` INTEGER NOT NULL,
    `obra_id` INTEGER NOT NULL,
    `criado_em` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `usuarios_obras_obra_id_idx`(`obra_id`),
    PRIMARY KEY (`usuario_id`, `obra_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `obras` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nome` VARCHAR(191) NOT NULL,
    `localizacao` VARCHAR(191) NOT NULL,
    `data_inicio` DATETIME(3) NOT NULL,
    `observacoes` TEXT NULL,
    `criado_em` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `atualizado_em` DATETIME(3) NOT NULL,

    INDEX `obras_nome_idx`(`nome`),
    INDEX `obras_data_inicio_idx`(`data_inicio`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `itens_macro` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `obra_id` INTEGER NOT NULL,
    `descricao` VARCHAR(191) NOT NULL,
    `valor_orcado` DECIMAL(15, 2) NOT NULL,
    `criado_em` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `atualizado_em` DATETIME(3) NOT NULL,

    INDEX `itens_macro_obra_id_idx`(`obra_id`),
    INDEX `itens_macro_descricao_idx`(`descricao`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `custos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `obra_id` INTEGER NOT NULL,
    `item_macro_id` INTEGER NOT NULL,
    `descricao` VARCHAR(191) NOT NULL,
    `detalhe_item` TEXT NULL,
    `unidade` VARCHAR(191) NOT NULL,
    `quantidade` DECIMAL(15, 3) NOT NULL,
    `valor_unitario` DECIMAL(15, 2) NOT NULL,
    `valor_total` DECIMAL(15, 2) NOT NULL,
    `data_ocorrencia` DATETIME(3) NOT NULL,
    `data_lancamento` DATETIME(3) NOT NULL,
    `criado_em` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `atualizado_em` DATETIME(3) NOT NULL,

    INDEX `custos_obra_id_idx`(`obra_id`),
    INDEX `custos_item_macro_id_idx`(`item_macro_id`),
    INDEX `custos_data_ocorrencia_idx`(`data_ocorrencia`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `custos_anexos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `custo_id` INTEGER NOT NULL,
    `tipo` ENUM('REQUEST', 'COMPLETION', 'ATTACHMENT', 'PAYMENT_PROOF', 'MESSAGE', 'COST_DOCUMENT') NOT NULL DEFAULT 'COST_DOCUMENT',
    `nome` VARCHAR(191) NOT NULL,
    `nome_original` VARCHAR(191) NULL,
    `dados` LONGTEXT NOT NULL,
    `tipo_mime` VARCHAR(191) NOT NULL,
    `tamanho` INTEGER NOT NULL,
    `enviado_em` DATETIME(3) NOT NULL,

    INDEX `custos_anexos_custo_id_idx`(`custo_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `parcelas` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `obra_id` INTEGER NOT NULL,
    `item_macro_id` INTEGER NOT NULL,
    `fornecedor` VARCHAR(191) NOT NULL,
    `descricao` TEXT NOT NULL,
    `valor_total` DECIMAL(15, 2) NOT NULL,
    `numero_parcela` INTEGER NOT NULL,
    `total_parcelas` INTEGER NOT NULL,
    `data_vencimento` DATETIME(3) NOT NULL,
    `valor` DECIMAL(15, 2) NOT NULL,
    `linha_digitavel` VARCHAR(191) NULL,
    `status` ENUM('PENDING', 'PAID') NOT NULL DEFAULT 'PENDING',
    `criado_em` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `atualizado_em` DATETIME(3) NOT NULL,

    INDEX `parcelas_obra_id_idx`(`obra_id`),
    INDEX `parcelas_item_macro_id_idx`(`item_macro_id`),
    INDEX `parcelas_data_vencimento_idx`(`data_vencimento`),
    INDEX `parcelas_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `parcelas_anexos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `parcela_id` INTEGER NOT NULL,
    `tipo` ENUM('REQUEST', 'COMPLETION', 'ATTACHMENT', 'PAYMENT_PROOF', 'MESSAGE', 'COST_DOCUMENT') NOT NULL,
    `nome` VARCHAR(191) NOT NULL,
    `nome_original` VARCHAR(191) NULL,
    `dados` LONGTEXT NOT NULL,
    `tipo_mime` VARCHAR(191) NOT NULL,
    `tamanho` INTEGER NOT NULL,
    `enviado_em` DATETIME(3) NOT NULL,

    INDEX `parcelas_anexos_parcela_id_idx`(`parcela_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tipos_pedido` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nome` VARCHAR(191) NOT NULL,
    `ordem` INTEGER NOT NULL DEFAULT 0,
    `ativo` BOOLEAN NOT NULL DEFAULT true,
    `criado_em` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `atualizado_em` DATETIME(3) NOT NULL,

    UNIQUE INDEX `tipos_pedido_nome_key`(`nome`),
    INDEX `tipos_pedido_ordem_ativo_idx`(`ordem`, `ativo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pedidos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `obra_id` INTEGER NOT NULL,
    `tipo_pedido_id` INTEGER NOT NULL,
    `item_macro_id` INTEGER NOT NULL,
    `solicitante_usuario_id` INTEGER NOT NULL,
    `responsavel_usuario_id` INTEGER NULL,
    `titulo` VARCHAR(191) NOT NULL,
    `descricao` TEXT NOT NULL,
    `data_prevista` DATETIME(3) NOT NULL,
    `status` ENUM('PENDENTE', 'EM_ANALISE', 'AGUARDANDO_INFORMACAO', 'CONCLUIDO', 'CANCELADO') NOT NULL DEFAULT 'PENDENTE',
    `observacao_conclusao` TEXT NULL,
    `motivo_cancelamento` TEXT NULL,
    `valor_solicitado` DECIMAL(15, 2) NULL,
    `criado_em` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `atualizado_em` DATETIME(3) NOT NULL,

    INDEX `pedidos_obra_id_idx`(`obra_id`),
    INDEX `pedidos_tipo_pedido_id_idx`(`tipo_pedido_id`),
    INDEX `pedidos_item_macro_id_idx`(`item_macro_id`),
    INDEX `pedidos_solicitante_usuario_id_idx`(`solicitante_usuario_id`),
    INDEX `pedidos_responsavel_usuario_id_idx`(`responsavel_usuario_id`),
    INDEX `pedidos_status_idx`(`status`),
    INDEX `pedidos_data_prevista_idx`(`data_prevista`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pedidos_anexos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `pedido_id` INTEGER NOT NULL,
    `tipo` ENUM('REQUEST', 'COMPLETION', 'ATTACHMENT', 'PAYMENT_PROOF', 'MESSAGE', 'COST_DOCUMENT') NOT NULL,
    `nome` VARCHAR(191) NOT NULL,
    `nome_original` VARCHAR(191) NULL,
    `dados` LONGTEXT NOT NULL,
    `tipo_mime` VARCHAR(191) NOT NULL,
    `tamanho` INTEGER NOT NULL,
    `enviado_em` DATETIME(3) NOT NULL,

    INDEX `pedidos_anexos_pedido_id_idx`(`pedido_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pedidos_mensagens` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `pedido_id` INTEGER NOT NULL,
    `usuario_id` INTEGER NULL,
    `conteudo` LONGTEXT NOT NULL,
    `sistema` BOOLEAN NOT NULL DEFAULT false,
    `criado_em` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `pedidos_mensagens_pedido_id_idx`(`pedido_id`),
    INDEX `pedidos_mensagens_usuario_id_idx`(`usuario_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pedidos_mensagens_anexos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `mensagem_pedido_id` INTEGER NOT NULL,
    `tipo` ENUM('REQUEST', 'COMPLETION', 'ATTACHMENT', 'PAYMENT_PROOF', 'MESSAGE', 'COST_DOCUMENT') NOT NULL DEFAULT 'MESSAGE',
    `nome` VARCHAR(191) NOT NULL,
    `nome_original` VARCHAR(191) NULL,
    `dados` LONGTEXT NOT NULL,
    `tipo_mime` VARCHAR(191) NOT NULL,
    `tamanho` INTEGER NOT NULL,
    `enviado_em` DATETIME(3) NOT NULL,

    INDEX `pedidos_mensagens_anexos_mensagem_pedido_id_idx`(`mensagem_pedido_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `usuarios` ADD CONSTRAINT `usuarios_gestor_id_fkey` FOREIGN KEY (`gestor_id`) REFERENCES `usuarios`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `usuarios_obras` ADD CONSTRAINT `usuarios_obras_usuario_id_fkey` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `usuarios_obras` ADD CONSTRAINT `usuarios_obras_obra_id_fkey` FOREIGN KEY (`obra_id`) REFERENCES `obras`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `itens_macro` ADD CONSTRAINT `itens_macro_obra_id_fkey` FOREIGN KEY (`obra_id`) REFERENCES `obras`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `custos` ADD CONSTRAINT `custos_obra_id_fkey` FOREIGN KEY (`obra_id`) REFERENCES `obras`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `custos` ADD CONSTRAINT `custos_item_macro_id_fkey` FOREIGN KEY (`item_macro_id`) REFERENCES `itens_macro`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `custos_anexos` ADD CONSTRAINT `custos_anexos_custo_id_fkey` FOREIGN KEY (`custo_id`) REFERENCES `custos`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `parcelas` ADD CONSTRAINT `parcelas_obra_id_fkey` FOREIGN KEY (`obra_id`) REFERENCES `obras`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `parcelas` ADD CONSTRAINT `parcelas_item_macro_id_fkey` FOREIGN KEY (`item_macro_id`) REFERENCES `itens_macro`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `parcelas_anexos` ADD CONSTRAINT `parcelas_anexos_parcela_id_fkey` FOREIGN KEY (`parcela_id`) REFERENCES `parcelas`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pedidos` ADD CONSTRAINT `pedidos_obra_id_fkey` FOREIGN KEY (`obra_id`) REFERENCES `obras`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pedidos` ADD CONSTRAINT `pedidos_tipo_pedido_id_fkey` FOREIGN KEY (`tipo_pedido_id`) REFERENCES `tipos_pedido`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pedidos` ADD CONSTRAINT `pedidos_item_macro_id_fkey` FOREIGN KEY (`item_macro_id`) REFERENCES `itens_macro`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pedidos` ADD CONSTRAINT `pedidos_solicitante_usuario_id_fkey` FOREIGN KEY (`solicitante_usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pedidos` ADD CONSTRAINT `pedidos_responsavel_usuario_id_fkey` FOREIGN KEY (`responsavel_usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pedidos_anexos` ADD CONSTRAINT `pedidos_anexos_pedido_id_fkey` FOREIGN KEY (`pedido_id`) REFERENCES `pedidos`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pedidos_mensagens` ADD CONSTRAINT `pedidos_mensagens_pedido_id_fkey` FOREIGN KEY (`pedido_id`) REFERENCES `pedidos`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pedidos_mensagens` ADD CONSTRAINT `pedidos_mensagens_usuario_id_fkey` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pedidos_mensagens_anexos` ADD CONSTRAINT `pedidos_mensagens_anexos_mensagem_pedido_id_fkey` FOREIGN KEY (`mensagem_pedido_id`) REFERENCES `pedidos_mensagens`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

