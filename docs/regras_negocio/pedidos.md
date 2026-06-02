# Pedidos

## Papel do módulo

O módulo de pedidos concentra:

- abertura de solicitações
- circulação entre setores
- registro de comentários
- anexos
- status principal
- status setorial
- vínculo opcional com custo da obra

## Estrutura do pedido

Cada pedido possui, entre outros campos:

- obra
- tipo de pedido
- item macro de apropriação
- setor atual
- setores com acesso
- código do pedido
- código externo opcional
- título
- descrição
- data prevista
- status
- status setorial
- solicitante
- responsável
- valor solicitado
- anexos da solicitação
- mensagens com anexos

## Status principal

- `PENDENTE`
- `EM_ANALISE`
- `AGUARDANDO_INFORMACAO`
- `CONCLUIDO`
- `CANCELADO`

## Status setorial

Além do status principal, o pedido pode ter `status setorial`, configurado por setor.

## Criação do pedido

Regras funcionais consolidadas:

- `Tipo do Pedido` inicia vazio
- `Descrição` é opcional
- `Anexos` são opcionais
- `Valor` e `Apropriação` são obrigatórios para tipos normais
- para tipo `OUTROS`, `Valor` e `Apropriação` podem ficar vazios

## Encaminhamento por setor

O pedido pode ser encaminhado para outro setor.

Regra atual:

- o setor que recebe ganha acesso
- o setor anterior não perde acesso
- o histórico do pedido permanece íntegro
- todos os setores envolvidos continuam podendo interagir por comentários e anexos

## Interações livres

O tratamento do pedido ocorre por:

- comentários livres
- anexos nas mensagens
- menções a usuários do sistema dentro do comentário

Notificações:

- quando um usuario comenta em um pedido, os demais usuarios que conseguem acessar o pedido veem um badge vermelho no menu `Pedidos`
- comentarios feitos pelo proprio usuario e mensagens automaticas do sistema nao entram no contador
- usuarios do setor `FINANCEIRO` tambem recebem a notificacao quando o pedido estiver visivel para eles, incluindo pedidos com prioridade aprovada
- ao abrir a tela `Pedidos` ou os detalhes de uma obra/pedido, as notificacoes de comentario sao marcadas como vistas

Menções:

- o botão `Mencionar` no comentário lista usuários ativos do sistema
- ao enviar comentário com usuário mencionado, o sistema registra acesso direto daquele usuário ao pedido
- usuários mencionados passam a conseguir abrir o pedido e interagir por comentários/anexos, mesmo se não estivessem no setor ou na obra original
- o acesso por menção é restrito ao pedido mencionado; não libera todos os pedidos da obra

## Vínculo com custo da obra

Fluxo atual:

- existe uma caixa `Vincular valor ao custo da obra`
- ao salvar marcada, o valor do pedido é vinculado ao custo da obra
- ao salvar desmarcada, a vinculação é removida

Regras adicionais:

- se o pedido for reaberto, o custo vinculado deve ser removido
- reabertura e nova conclusão não podem duplicar custo

## Reabertura

`SUPERADMIN` e `ADMIN` podem reabrir pedidos:

- `CONCLUIDO`
- `CANCELADO`

## Lotes de prioridade da diretoria

O sistema possui uma tela `Prioridades Diretoria` para usuarios dos setores:

- `DIRETORIA ADMINISTRATIVA`
- `DIRETORIA DE OBRAS`
- `FINANCEIRO`

Fluxos:

- a `DIRETORIA ADMINISTRATIVA` pode abrir lote para a `DIRETORIA DE OBRAS` informando `valor disponivel`
- a `DIRETORIA DE OBRAS` pode abrir lote para a `DIRETORIA ADMINISTRATIVA` sem valor definido
- somente usuarios da `DIRETORIA DE OBRAS` podem selecionar, remover, salvar e enviar pedidos nos lotes abertos
- a `DIRETORIA ADMINISTRATIVA` nao altera a selecao de pedidos; sua responsabilidade e criar lote com valor disponivel, aprovar, recusar ou cancelar
- usuarios do setor `FINANCEIRO` podem acessar a tela para acompanhar todos os lotes, independente de quem criou, sem permissao para selecionar, enviar, aprovar, recusar ou cancelar
- o menu exibe um badge vermelho em `Prioridades` quando ha lotes criados, enviados, aprovados, recusados ou cancelados depois da ultima visualizacao do usuario
- a selecao de pedidos em lote aberto e salva automaticamente ao marcar/desmarcar, permitindo navegacao e retomada posterior
- filtros de busca, obra e selecionados nao removem pedidos ja selecionados nem devem reordenar visualmente o pedido recem-marcado para outra posicao
- pedidos com status setorial `PAGO` nao podem ser listados, salvos, enviados ou aprovados em lote de prioridade
- se um pedido ja selecionado virar `PAGO` enquanto o lote ainda esta aberto, ele permanece visivel no lote apenas para remocao e sai automaticamente no proximo salvamento da selecao
- lotes enviados entram em `AGUARDANDO_APROVACAO`
- somente a `DIRETORIA ADMINISTRATIVA` aprova, recusa ou cancela lotes aguardando aprovacao
- somente na aprovacao os pedidos recebem `prioridade_aprovada`

Status do lote:

- `ABERTO`
- `AGUARDANDO_APROVACAO`
- `APROVADO`
- `RECUSADO`
- `CANCELADO`

## Importação e exportação

### Importação em massa

- disponível apenas para `SUPERADMIN`

### Exportação em Excel

- suporta exportação de pedidos selecionados

## Histórico do pedido

O histórico deve registrar:

- mensagens livres
- anexos enviados
- alterações de valor
- alteração de apropriação
- encaminhamento entre setores
- mudança de status setorial
- reabertura

Regra visual atual:

- mensagens mais recentes em cima
- mensagens mais antigas embaixo
