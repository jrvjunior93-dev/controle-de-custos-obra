# Controle de Custos CSC - BRAPE

## Status

Base preparada para build e inicializacao de producao com:

- frontend buildado via Vite
- backend buildado em TypeScript
- Prisma com migration baseline formal
- CORS configuravel por ambiente
- health check com validacao do banco

## Variaveis obrigatorias

Backend:

- `DATABASE_URL`
- `NODE_ENV`
- `JWT_SECRET`
- `CORS_ALLOWED_ORIGINS`
- `SUPERADMIN_EMAIL`
- `SUPERADMIN_PASSWORD`
- `SUPERADMIN_NAME`

Frontend:

- `VITE_API_URL`

S3:

- `AWS_REGION`
- `AWS_S3_BUCKET`
- `AWS_S3_PREFIX` (opcional, padrao `csc`)
- `AWS_S3_SIGNED_URL_TTL_SECONDS` (opcional, padrao `3600`)

## Build de producao

Na raiz:

```powershell
npm.cmd run build:prod
```

## Start de producao

Na raiz:

```powershell
npm.cmd run start:prod
```

Ou direto no backend:

```powershell
npm.cmd run start:prepare
npm.cmd run build:prod
npm.cmd run start
```

## Checklist de deploy

1. MySQL acessivel e `DATABASE_URL` valido.
2. `NODE_ENV=production`.
3. `JWT_SECRET` definido com valor forte.
4. `CORS_ALLOWED_ORIGINS` apontando para o dominio do frontend.
5. `SUPERADMIN_EMAIL` e `SUPERADMIN_PASSWORD` definidos explicitamente.
6. Rodar `npm.cmd run build:prod`.
7. Rodar `npm.cmd run start:prod`.
8. Validar `GET /health`.

## Deploy recomendado

### Frontend na Vercel

- Projeto raiz: `frontend`
- Configuracao: `frontend/vercel.json`
- Variavel obrigatoria: `VITE_API_URL`
- Node suportado: `>=20 <23`

Subdominio sugerido:

- `custos.seudominio.com` para o frontend

### Backend na EC2

- Backend: `backend`
- PM2: `backend/ecosystem.config.cjs`
- Exemplo `systemd`: `backend/deploy/csc-backend.service.example`

Fluxo sugerido na EC2:

```bash
npm install
npm run start:prepare
npm run build:prod
pm2 start ecosystem.config.cjs
```

### Banco no RDS

- Use usuario proprio da aplicacao, nao `root`
- Restrinja o acesso do RDS ao security group da EC2
- Mantenha backup automatico habilitado
- Aponte `DATABASE_URL` para o endpoint privado do RDS

### Anexos no S3

- O sistema agora salva anexos no S3 quando `AWS_REGION` e `AWS_S3_BUCKET` estiverem configurados
- Sem essas variaveis, o backend faz fallback para o armazenamento atual em banco
- Em producao, prefira IAM Role na EC2 em vez de chaves estaticas

### DNS sugerido

- frontend Vercel: `custos.seudominio.com`
- backend EC2/Nginx: `api.seudominio.com`

Backend:

- `CORS_ALLOWED_ORIGINS=https://custos.seudominio.com`

Frontend:

- `VITE_API_URL=https://api.seudominio.com`

## Observacoes

- O importador de planilhas ainda depende de `xlsx`, que hoje possui advisory sem correcao publicada. Como mitigacao, o sistema limita importacoes a 10 MB e o uso deve ficar restrito a arquivos confiaveis.
- Os chunks maiores do frontend (`html2pdf` e planilhas) estao fora do carregamento inicial e sao carregados sob demanda.
