# AGENT

## Objetivo
Documentar a logica de funcionamento do sistema, orientar o setup local com MySQL e backend local, e descrever o deploy em nuvem com Vercel (frontend), backend + RDS (MySQL) e integracao com IA.

## Visao Geral do Sistema Atual
- Frontend: React + Vite + TypeScript.
- Persistencia atual: Supabase (tabelas `projects`, `users_data`, `settings`) + fallback em `localStorage`.
- IA: Gemini (via `@google/genai`) para extracao de dados de PDF/Imagem/Planilha.
- Sem backend proprio no projeto (tudo client-side hoje).

## Modulos Principais (Frontend)
- Login e sessao: `App.tsx`, `Login.tsx`.
- Obras (Projetos): `ProjectList.tsx` e `ProjectDetail.tsx`.
- Orcamento: `BudgetModule.tsx` (upload e extracao via IA).
- Custos: `CostModule.tsx` (upload de comprovantes via IA).
- Parcelas: `InstallmentsModule.tsx` (boletos, pagamento e baixa de custo).
- Pedidos: `OrdersModule.tsx` e `GlobalOrdersModule.tsx`.
- Arquivos: `AttachmentsModule.tsx` (download e zip).
- Consolidacao: `ConsolidationModule.tsx` (dashboards e graficos).
- Config Global: `SpecificationDoc.tsx`.

## Como Funciona Hoje
1. O app carrega usuarios, projetos e configuracoes do Supabase.
2. Se nao conseguir, usa dados locais (`localStorage`).
3. Admin tem acesso total; membros vao direto para pedidos.
4. Custos, orcamento e boletos podem ser importados com IA (Gemini).
5. Anexos sao armazenados como Base64 dentro do JSON do projeto.

## Caminho para Backend + MySQL (Recomendado)
A migracao para MySQL exige criar um backend (Node/Express, NestJS ou Fastify) e mover a persistencia e IA para o servidor.
Motivos:
- Proteger chaves de API (Gemini) e credenciais do banco.
- Melhor controle de autenticacao e permissao.
- Escalar anexos usando storage (S3, R2 ou Supabase Storage).

### Proposta de Stack Backend
- Node.js + TypeScript
- ORM: Prisma ou Drizzle
- MySQL local e RDS na nuvem
- JWT para autenticacao

### Entidades (esqueleto)
- users
- projects
- budgets
- costs
- installments
- orders
- order_messages
- attachments
- settings

## Setup Local com MySQL (Inicial)
### Opcao A: Docker
1. Subir MySQL:
   - `docker run --name csc-mysql -e MYSQL_ROOT_PASSWORD=senha -e MYSQL_DATABASE=csc -p 3306:3306 -d mysql:8`
2. Criar usuario e schema no DB `csc`.

### Opcao B: Instalacao local
1. Instalar MySQL 8.
2. Criar database `csc`.
3. Criar usuario com acesso total ao schema.

## Backend Local (exemplo)
1. Criar pasta `server/` com API REST.
2. Endpoints principais:
   - `POST /auth/login`
   - `GET /projects`
   - `POST /projects`
   - `PUT /projects/:id`
   - `DELETE /projects/:id`
   - `POST /budget/import`
   - `POST /costs/import`
   - `POST /installments/import`
3. Mover chamadas de IA para backend:
   - Frontend envia o arquivo
   - Backend chama Gemini e retorna dados estruturados

## Variaveis de Ambiente (Local)
Frontend:
- `VITE_API_URL=http://localhost:4000`

Backend:
- `DATABASE_URL=mysql://user:pass@localhost:3306/csc`
- `GEMINI_API_KEY=...`
- `JWT_SECRET=...`

## Deploy em Producao
### Frontend (Vercel)
- Build com Vite.
- Configurar env `VITE_API_URL` apontando para o backend em producao.

### Backend (Node)
- Hospedar em um servidor separado (Render, Fly.io, Railway, AWS ECS ou EC2).
- Conectar ao RDS MySQL.
- Usar RDS Proxy se rodar em serverless para evitar excesso de conexoes.

### Banco (RDS MySQL)
- Criar instancia MySQL.
- Aplicar migrations.
- Definir regras de seguranca (VPC, SG).

### IA (Gemini)
- Chave armazenada apenas no backend.
- Frontend nunca expor a chave.

## Observacoes Importantes
- Hoje a chave do Supabase e o endpoint estao hardcoded no frontend. Em producao, isso deve virar env ou migrar tudo para o backend.
- Anexos em Base64 no banco podem crescer rapidamente. Sugestao: armazenar em object storage e salvar apenas URL no MySQL.

## Proximos Passos
1. Criar backend inicial e migrar o `dbService` para chamar API.
2. Definir schema MySQL e migrations.
3. Mover Gemini para backend.
4. Configurar deploy (Vercel + Backend + RDS).
