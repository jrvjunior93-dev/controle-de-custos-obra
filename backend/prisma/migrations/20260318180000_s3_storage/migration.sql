ALTER TABLE `custos_anexos`
  MODIFY `dados` LONGTEXT NULL,
  ADD COLUMN `provedor_armazenamento` VARCHAR(191) NULL,
  ADD COLUMN `bucket_armazenamento` VARCHAR(191) NULL,
  ADD COLUMN `chave_armazenamento` VARCHAR(191) NULL;

ALTER TABLE `parcelas_anexos`
  MODIFY `dados` LONGTEXT NULL,
  ADD COLUMN `provedor_armazenamento` VARCHAR(191) NULL,
  ADD COLUMN `bucket_armazenamento` VARCHAR(191) NULL,
  ADD COLUMN `chave_armazenamento` VARCHAR(191) NULL;

ALTER TABLE `pedidos_anexos`
  MODIFY `dados` LONGTEXT NULL,
  ADD COLUMN `provedor_armazenamento` VARCHAR(191) NULL,
  ADD COLUMN `bucket_armazenamento` VARCHAR(191) NULL,
  ADD COLUMN `chave_armazenamento` VARCHAR(191) NULL;

ALTER TABLE `pedidos_mensagens_anexos`
  MODIFY `dados` LONGTEXT NULL,
  ADD COLUMN `provedor_armazenamento` VARCHAR(191) NULL,
  ADD COLUMN `bucket_armazenamento` VARCHAR(191) NULL,
  ADD COLUMN `chave_armazenamento` VARCHAR(191) NULL;
