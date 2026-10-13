# 🚀 Guia rápido — a sua parte fácil

Eu já deixei o sistema pronto, testado e com tudo automatizado. Aqui ficam só os
passos que **só você** consegue fazer (envolvem a sua conta Google e alguns
cliques). Siga na ordem.

---

## Parte 1 — Rodar o sistema (escolha UMA opção)

### Opção A — Docker (mais fácil, 1 comando)

Pré-requisito: ter o **Docker** instalado.

```bash
bash setup.sh                     # cria o .env e gera o JWT_SECRET sozinho
docker compose up -d --build      # sobe backend + frontend
```

Abra: **http://localhost:8080** e faça login com o e-mail/senha que você digitou.

Para parar: `docker compose down`  ·  Para ver logs: `docker compose logs -f`

### Opção B — Sem Docker (manual)

```bash
bash setup.sh                     # cria o .env e gera o JWT_SECRET sozinho

# terminal 1 (backend)
cd server && npm install && npm run seed && npm start

# terminal 2 (frontend)
cd client && npm install && npm run dev
```

Abra: **http://localhost:5173**

---

## Parte 2 — Conectar o Gmail (Google Cloud)

Isso libera o envio e o recebimento real de e-mails. É só seguir clicando.

1. Entre em **https://console.cloud.google.com** com a conta que vai enviar os e-mails.
2. Em cima, **crie um projeto** (ou selecione um). Nome livre, ex.: "Simula Escola".
3. Menu → **APIs e serviços → Biblioteca** → busque **"Gmail API"** → clique em **Ativar**.
4. Menu → **APIs e serviços → Tela de permissão OAuth**:
   - Tipo de usuário: **Externo** → Criar.
   - Preencha nome do app e e-mails de contato (pode ser o seu).
   - Em **Usuários de teste**, clique em **Adicionar** e coloque o **seu próprio Gmail**.
     (Isso deixa o app funcionando em modo de teste, sem precisar de verificação do Google.)
5. Menu → **APIs e serviços → Credenciais → Criar credenciais → ID do cliente OAuth**:
   - Tipo: **Aplicativo da Web**.
   - Em **URIs de redirecionamento autorizados**, clique em **Adicionar URI** e cole **exatamente**:
     - Local (Docker): `http://localhost:4000/api/gmail/oauth/callback`
     - Local (manual): `http://localhost:4000/api/gmail/oauth/callback`
     - Produção: `https://SEU-DOMINIO/api/gmail/oauth/callback`
   - Criar. O Google mostra o **Client ID** e o **Client Secret**.
6. Cole esses dois valores no arquivo **`server/.env`**:
   ```
   GOOGLE_CLIENT_ID=...        (o valor copiado)
   GOOGLE_CLIENT_SECRET=...    (o valor copiado)
   ```
   > Se usou o `setup.sh`, você já pôde colar na hora. Senão, edite o `.env` e
   > reinicie o backend (`docker compose up -d` de novo, ou pare/inicie o `npm start`).

---

## Parte 3 — Usar o sistema

1. **Configurações e segurança**: confirme que o **Modo de teste** está ligado e que
   o **Destinatário autorizado** é o seu Gmail. (Em modo de teste, só envia para você.)
2. **Integração com Gmail**: clique em **Conectar conta Gmail**, autorize na janela do
   Google. O status deve virar ✅ conectado. Clique em **Testar conexão**.
3. **Solicitações escolares**: clique em **Gerar solicitação (IA)** e depois **Enviar**.
   O e-mail fictício chega na sua caixa.
4. Responda esse e-mail **pelo seu próprio Gmail**.
5. Volte em **Conversas** (ou na solicitação) e clique em **Sincronizar respostas**.
   O status vira **Respondida** e sua resposta aparece no histórico.
6. Em **Solicitações → (abrir uma respondida)** clique em **Gerar acompanhamento (IA)**.
   Ele fica **aguardando aprovação** — nada é enviado sem você clicar em **Aprovar e enviar**.
7. **Automações**: crie uma automação, defina limites e clique em **Ativar**. O
   agendador do servidor cuida do resto (inclusive com o navegador fechado, se o
   backend estiver hospedado — veja `DEPLOYMENT.md`).

---

## Dúvidas comuns

- **"redirect_uri_mismatch"** ao conectar o Gmail → o URI no Google Cloud não é
  idêntico ao usado pelo app. No desktop, cadastre exatamente
  `http://127.0.0.1:4137/api/gmail/oauth/callback`.
- **"Erro 403: org_internal — só pode ser usado dentro da organização"** → a tela
  de consentimento OAuth foi criada como **Interna**. Vá em **Tela de permissão
  OAuth** e **mude o tipo para Externo** (botão “Tornar externo”), depois adicione
  seu e-mail em **Usuários de teste**. Se não existir a opção de tornar externo
  (projeto dentro de uma organização Workspace), crie o projeto OAuth usando uma
  **conta Gmail comum** (não-Workspace) e refaça as credenciais.
- **"Acesso bloqueado / app não verificado"** → confirme que você se adicionou em
  **Usuários de teste** na tela de consentimento.
- **Não recebi o e-mail** → confira o **Destinatário autorizado** em Configurações e
  se o Gmail está conectado (página Integração com Gmail).

Qualquer passo que travar, me chama que eu resolvo. 😉
