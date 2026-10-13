# Guia de publicação — Simula Escola IA

O agendador precisa de um **processo de servidor sempre ativo** para executar as
automações com o navegador fechado. Portanto, hospede o **backend** em uma
infraestrutura com processo persistente.

> 💡 **Modo recomendado — serviço único.** O backend já serve o frontend buildado
> (quando `CLIENT_DIST` aponta para `client/dist`). Assim você publica **um único
> serviço web** — sem CORS, sem proxy separado. É o que o `render.yaml` faz.

---

## 0. Deploy mais fácil — Render (Blueprint pronto) ⭐

O repositório já inclui um **`render.yaml`** que cria tudo automaticamente.

1. Crie uma conta em **https://dashboard.render.com**.
2. **New → Blueprint** → conecte o repositório `samukalipe102-lgtm/simulaia`.
3. O Render lê o `render.yaml` e cria o serviço web (com disco persistente para o
   SQLite e `JWT_SECRET` gerado automaticamente).
4. Preencha as **variáveis de ambiente** marcadas como segredo no painel:
   - `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `AUTHORIZED_RECIPIENT`
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
5. Clique em **Apply** e aguarde o primeiro deploy. Anote a URL pública, algo como
   `https://simula-escola-ia.onrender.com`.
6. **Ajuste 2 variáveis com a URL pública** (e salve → redeploy automático):
   - `GOOGLE_REDIRECT_URI = https://SEU-APP.onrender.com/api/gmail/oauth/callback`
   - `CLIENT_ORIGIN = https://SEU-APP.onrender.com`
7. No **Google Cloud Console**, adicione essa mesma redirect URI em
   *URIs de redirecionamento autorizados* do seu OAuth Client.
8. Acesse a URL pública, faça login e conecte o Gmail. ✅

> O plano `starter` mantém o processo sempre ativo (o plano gratuito do Render
> hiberna após inatividade, o que pausaria o agendador). Para o agendador rodar
> 24h de verdade, use um plano com processo persistente.

Outras plataformas equivalentes (todas com o mesmo princípio de serviço único e
processo always-on): **Railway**, **Fly.io**, **Google Cloud Run** (instância
mínima ≥ 1). Veja a seção 2 para Docker/VM.

---

## 1. Build do frontend (deploy separado, opcional)

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

### Opção A — Docker Compose (backend + frontend)

O repositório já traz `server/Dockerfile`, `client/Dockerfile`,
`client/nginx.conf` e `docker-compose.yml`. Para subir tudo:

```bash
bash setup.sh                   # cria o server/.env (gera JWT_SECRET)
docker compose up -d --build    # backend + frontend; acesse http://localhost:8080
```

- O volume `simula_data` preserva o banco SQLite entre reinícios.
- `restart: always` garante que o processo (e o agendador) retorne após quedas.
- O Nginx do frontend faz proxy de `/api` para o backend.

Para rodar só o backend em modo **serviço único** (ele mesmo serve o frontend):

```bash
cd client && npm ci && npm run build          # gera client/dist
cd ../server
docker build -t simula-escola-ia .
docker run -d --restart=always -p 4000:4000 \
  --env-file .env \
  -e CLIENT_DIST=/app/client-dist \
  -v simula_data:/app/data \
  -v "$(pwd)/../client/dist":/app/client-dist:ro \
  simula-escola-ia
# acesse http://localhost:4000
```

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
