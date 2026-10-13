# Guia de publicação — Simula Escola IA

O agendador precisa de um **processo de servidor sempre ativo** para executar as
automações com o navegador fechado. Portanto, hospede o **backend** em uma
infraestrutura com processo persistente. O **frontend** é estático e pode ir para
qualquer CDN/host de estáticos.

---

## 1. Build do frontend

```bash
cd client
npm install
npm run build        # gera client/dist (arquivos estáticos)
```

Sirva `client/dist` em um host estático (Netlify, Vercel, Cloudflare Pages,
Nginx, S3+CloudFront). Configure o build para apontar as chamadas `/api` ao
domínio do backend (via proxy/reescrita ou variável de ambiente de build).

> Em produção, aponte `/api/*` para o backend (ex.: reescrita no host estático
> ou um proxy reverso Nginx na frente de ambos).

---

## 2. Backend com processo persistente

O backend **deve** rodar continuamente. Opções:

### Opção A — Docker (recomendado)

```dockerfile
# server/Dockerfile
FROM node:22-slim
WORKDIR /app
COPY server/package*.json ./
RUN npm ci --omit=dev
COPY server/ .
RUN mkdir -p data
ENV NODE_ENV=production
EXPOSE 4000
CMD ["node", "src/index.js"]
```

```bash
docker build -t simula-escola-ia -f server/Dockerfile .
docker run -d --restart=always -p 4000:4000 \
  --env-file server/.env \
  -v simula_data:/app/data \
  simula-escola-ia
```

O volume `simula_data` preserva o banco SQLite entre reinícios. O
`--restart=always` garante que o processo (e o agendador) retorne após quedas.

### Opção B — systemd (VM Linux)

```ini
# /etc/systemd/system/simula.service
[Unit]
Description=Simula Escola IA
After=network.target

[Service]
WorkingDirectory=/opt/simula/server
EnvironmentFile=/opt/simula/server/.env
ExecStart=/usr/bin/node src/index.js
Restart=always
User=simula

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now simula
```

### Opção C — PM2

```bash
cd server && pm2 start src/index.js --name simula && pm2 save && pm2 startup
```

### Plataformas gerenciadas

Render, Railway, Fly.io, AWS ECS/Fargate, Azure Container Apps e Google Cloud
Run (com instância mínima ≥ 1 / *always-on*) funcionam bem. **Evite** plataformas
"serverless" que suspendem o processo entre requisições — o agendador precisa de
um worker contínuo.

---

## 3. Banco de dados

- Padrão: **SQLite** (arquivo em `server/data/`). Simples e persistente; use um
  **volume/disco persistente** no host.
- Escala maior: migre para **PostgreSQL**. O acesso a dados está isolado em
  `server/src/db` e nos `services/`; troque o driver mantendo as mesmas queries.
- Faça **backup** do arquivo `.db` (ou dumps do Postgres) regularmente.

---

## 4. Variáveis de ambiente em produção

- Defina **todas** as variáveis do `.env.example` no gerenciador de segredos do
  host (não comite `.env`).
- Gere um `JWT_SECRET` forte:
  `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.
- `GOOGLE_REDIRECT_URI` deve usar o **domínio público HTTPS** e estar cadastrado
  no Google Cloud (URIs de redirecionamento autorizados).
- `CLIENT_ORIGIN` deve conter a origem pública do frontend.
- Comece com `TEST_MODE=true` e `AUTHORIZED_RECIPIENT` apontando para a sua
  caixa, até validar o fluxo completo.

---

## 5. Google Cloud / Gmail

- Para uso além dos *usuários de teste*, publique a tela de consentimento OAuth
  (pode exigir verificação do Google dependendo dos escopos).
- Os escopos `gmail.send` / `gmail.readonly` / `gmail.modify` são sensíveis; o
  Google pode solicitar verificação para apps publicados a usuários externos.
- A Gmail API não cobra dentro das cotas padrão; monitore limites de uso.

---

## 6. Custos externos possíveis

| Item | Custo |
|------|-------|
| Gmail API | Sem custo adicional dentro das cotas padrão |
| OpenAI (LLM opcional) | Pago por uso — opcional; vazio = gerador offline |
| Hospedagem do backend | Depende do provedor (worker always-on) |
| Host estático do frontend | Normalmente gratuito/baixo custo |

---

## 7. Checklist de produção

- [ ] `JWT_SECRET` forte e único.
- [ ] Senha do admin alterada após o primeiro login.
- [ ] HTTPS no backend e no frontend.
- [ ] `GOOGLE_REDIRECT_URI` público cadastrado no Google Cloud.
- [ ] Volume/disco persistente para o banco.
- [ ] Processo com reinício automático (Docker `--restart`, systemd, PM2).
- [ ] Backups do banco.
- [ ] `TEST_MODE=true` até validar; destinatário autorizado definido.
- [ ] `.env` fora do controle de versão.
