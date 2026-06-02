CREATE TABLE `pedidos_usuarios_acesso` (
  `pedido_id` INTEGER NOT NULL,
  `usuario_id` INTEGER NOT NULL,
  `concedido_por_usuario_id` INTEGER NULL,
  `mensagem_id` INTEGER NULL,
  `concedido_em` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`pedido_id`, `usuario_id`),
  INDEX `pedidos_usuarios_acesso_usuario_id_idx`(`usuario_id`),
  INDEX `pedidos_usuarios_acesso_mensagem_id_idx`(`mensagem_id`)
);

ALTER TABLE `pedidos_usuarios_acesso`
  ADD CONSTRAINT `pedidos_usuarios_acesso_pedido_id_fkey`
  FOREIGN KEY (`pedido_id`) REFERENCES `pedidos`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `pedidos_usuarios_acesso_usuario_id_fkey`
  FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `pedidos_usuarios_acesso_concedido_por_usuario_id_fkey`
  FOREIGN KEY (`concedido_por_usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `pedidos_usuarios_acesso_mensagem_id_fkey`
  FOREIGN KEY (`mensagem_id`) REFERENCES `pedidos_mensagens`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
