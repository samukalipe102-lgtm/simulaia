# Simula Escola IA

Aplicação web **independente** para gerar solicitações escolares **fictícias**,
enviá-las e acompanhá-las por e-mail via **Gmail API (OAuth 2.0)**, identificar
respostas reais e executar **automações controladas no servidor** — funcionando
mesmo com o navegador fechado.

> ⚠️ **Ambiente de simulação.** Todas as solicitações e perfis são fictícios.
> O sistema não cria alunos reais nem usa a identidade de pessoas reais. Nenhum
> documento real é emitido ou entregue automaticamente.

---

## Arquitetura

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 18 + Vite + Tailwind CSS + Recharts |
| Backend | Node.js + Express |
| Banco de dados | SQLite (better-sqlite3), persistente |
| Agendador | node-cron no processo do servidor (independente do navegador) |
| E-mail | Gmail API (`googleapis`) com OAuth 2.0 |
| Autenticação | JWT + bcrypt (acesso administrativo) |
| IA | Gerador por templates (offline) + opção LLM (OpenAI) |

```
simula-escola-ia/
├── server/            # Backend Express + SQLite + agendador
│   ├── src/
│   │   ├── routes/    # auth, services, profiles, requests, automations, gmail, settings, reports
│   │   ├── services/  # gmail, requests (conversas), automation (regras de envio)
│   │   ├── jobs/      # scheduler (node-cron)
│   │   ├── ai/        # gerador de solicitações
│   │   ├── db/        # schema + conexão + seed
│   │   └── middleware/# autenticação JWT
│   └── tests/         # testes unit/integração + e2e-live.sh
└── client/            # Frontend React
    └── src/pages/     # Dashboard, Solicitações, Conversas, Automações, Serviços,
                       # Perfis, Relatórios, Gmail, Configurações
```

---

## 🤖 Modo totalmente automático

Após uma **configuração inicial única** e a conexão do Gmail, o sistema gera,
envia, acompanha e encerra solicitações simuladas **automaticamente** no
servidor. Sua única tarefa diária é **responder pelo Gmail**. Veja o guia
completo em **[`AUTOMACAO.md`](./AUTOMACAO.md)**.

## Formas de usar

| Formato | Para quê | Guia |
|---------|----------|------|
| 🖥️ **App de desktop (Windows .exe)** | Rodar no PC com duplo-clique, sem terminal | [`DESKTOP.md`](./DESKTOP.md) |
| ☁️ **Nuvem (Render / Docker)** | Rodar 24h com o PC desligado (agendador sempre ativo) | [`DEPLOYMENT.md`](./DEPLOYMENT.md) |
| 💻 **Local (dev)** | Desenvolvimento | abaixo |

> O agendador só envia e-mails enquanto houver um processo rodando: no app de
> desktop, enquanto ele estiver aberto; na nuvem, o tempo todo.

## Começando — jeito fácil

```bash
bash setup.sh                   # cria o server/.env e gera o JWT_SECRET sozinho
docker compose up -d --build    # sobe backend + frontend; acesse http://localhost:8080
```

Passo a passo com cliques (incluindo o Google Cloud) em **[`GUIA_RAPIDO.md`](./GUIA_RAPIDO.md)**.

## Começando (desenvolvimento manual)

### 1. Backend

```bash
cd server
npm install
cp .env.example .env      # edite com seus valores
npm run seed              # cria serviços e perfis fictícios iniciais
npm start                 # inicia API + agendador em http://localhost:4000
```

O primeiro start cria o administrador inicial a partir de `ADMIN_EMAIL` /
`ADMIN_PASSWORD`. **Altere a senha após o primeiro login** (Configurações).

### 2. Frontend

```bash
cd client
npm install
npm run dev               # http://localhost:5173 (proxy /api -> :4000)
```

Acesse `http://localhost:5173`, faça login e configure:
1. **Configurações** → ative o modo de teste e informe o **destinatário autorizado**.
2. **Integração com Gmail** → conecte sua conta (requer credenciais Google — veja abaixo).
3. **Serviços** / **Perfis** → ajuste o que a IA pode usar.
4. **Automações** → crie e ative uma automação.

---

## Variáveis de ambiente (backend `.env`)

| Variável | Descrição |
|----------|-----------|
| `PORT` | Porta do backend (padrão 4000) |
| `CLIENT_ORIGIN` | Origem(ns) do frontend permitidas no CORS |
| `JWT_SECRET` | Segredo para assinar sessões (string longa e aleatória) |
| `JWT_EXPIRES_IN` | Validade do token (ex.: `12h`) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Admin inicial (criado no primeiro start) |
| `DATABASE_FILE` | Caminho do arquivo SQLite |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Credenciais OAuth (Google Cloud) |
| `GOOGLE_REDIRECT_URI` | URI de callback — deve bater com o Google Cloud |
| `TEST_MODE` | `true` = envia só para `AUTHORIZED_RECIPIENT` |
| `AUTHORIZED_RECIPIENT` | Única caixa autorizada em modo de teste |
| `OPENAI_API_KEY` / `OPENAI_MODEL` | Opcional: enriquece a geração com LLM |

> 🔐 Segredos (tokens OAuth, `JWT_SECRET`) ficam **somente no backend**
> (arquivo `.env` e banco). Nunca são enviados ao navegador nem versionados.

---

## Configurar o Gmail (Google Cloud) — passo a passo

1. Acesse o **Google Cloud Console** e crie/selecione um projeto.
2. Em **APIs e serviços → Biblioteca**, ative a **Gmail API**.
3. Em **Tela de consentimento OAuth**: tipo *Externo*; adicione seu e-mail como
   *usuário de teste* (mantém o app em modo de teste, sem verificação do Google).
4. Em **Credenciais → Criar credenciais → ID do cliente OAuth**: tipo
   *Aplicativo da Web*.
5. Em **URIs de redirecionamento autorizados**, adicione **exatamente** o valor
   de `GOOGLE_REDIRECT_URI`
   (ex.: `http://localhost:4000/api/gmail/oauth/callback`; em produção use o
   domínio público HTTPS).
6. Copie **Client ID** e **Client Secret** para o `.env`.
7. Escopos solicitados: `gmail.send`, `gmail.readonly`, `gmail.modify`,
   `userinfo.email`.

**Custos:** a Gmail API não tem custo adicional dentro das cotas padrão do
Google. O LLM opcional (OpenAI) é cobrado por uso — deixe `OPENAI_API_KEY` vazio
para operar 100% offline com o gerador por templates.

---

## Fluxo de funcionamento

1. A **IA** gera uma solicitação fictícia usando apenas serviços habilitados e
   perfis fictícios (assunto, mensagem, categoria, perfil, data, ID e status).
2. O e-mail é enviado pela **Gmail API**; o sistema armazena os **identificadores
   reais** (`threadId`, `messageId`).
3. Você responde pelo **seu próprio Gmail**. O agendador sincroniza as threads,
   detecta a resposta e atualiza o histórico.
4. A IA gera um **acompanhamento contextual** que fica **aguardando aprovação**.
   Nada é enviado sem sua confirmação.
5. O **agendador no servidor** respeita limites diários, intervalos, dias/horas,
   duração, destinatário autorizado, tentativas e a **parada de emergência**.

---

## Segurança embutida

- Modo de teste: envia **somente** para o destinatário autorizado.
- Acompanhamentos exigem **aprovação manual** antes do envio.
- Prevenção de duplicidade de envios.
- Registro de falhas e auditoria (Relatórios).
- Parada de emergência interrompe todas as automações.
- Tokens OAuth e segredos somente no backend.

---

## Testes

```bash
cd server
npm test          # 24 testes unit/integração (inclui fluxo Gmail mockado)
npm run test:e2e  # 19 verificações end-to-end contra a API real (sem Gmail real)
```

Veja o relatório completo de testes em [`TESTES.md`](./TESTES.md).

---

## Publicação

Consulte [`DEPLOYMENT.md`](./DEPLOYMENT.md). O ambiente de desenvolvimento **não**
é a hospedagem definitiva: para manter o agendador rodando com o navegador
fechado, publique o backend em uma infraestrutura com processo persistente
(container/VM/serviço gerenciado).
