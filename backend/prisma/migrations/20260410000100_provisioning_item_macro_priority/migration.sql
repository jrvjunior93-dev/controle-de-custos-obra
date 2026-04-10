ALTER TABLE provisionamentos
  ADD COLUMN item_macro VARCHAR(191) NULL,
  ADD COLUMN prioridade VARCHAR(50) NULL;

UPDATE provisionamentos
SET item_macro = COALESCE(NULLIF(item_macro, ''), NULLIF(titulo, ''), 'GERAL');

ALTER TABLE provisionamentos
  MODIFY COLUMN item_macro VARCHAR(191) NOT NULL;
