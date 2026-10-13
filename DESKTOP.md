# 🖥️ Simula Escola IA — Aplicativo de Desktop (Windows)

Versão em **executável do Windows** (via Electron). Você dá duplo-clique, o app
abre numa janela própria (sem terminal) e o servidor interno — API, banco e
**agendador** — roda por dentro automaticamente.

> ⚠️ **Importante:** no modo desktop, os e-mails são enviados **enquanto o app
> estiver aberto** (pode ficar minimizado). Se você **fechar o app ou desligar o
> PC**, o agendador para. Para envio contínuo 24h mesmo com tudo desligado, use o
> deploy em nuvem (veja [`DEPLOYMENT.md`](./DEPLOYMENT.md)).

---

## Como obter o instalador (sem precisar compilar) ⭐

O repositório tem um workflow que gera o `.exe` **no GitHub**, numa máquina
Windows — você não precisa de Windows para "montar", só para usar.

**Opção 1 — Gerar sob demanda:**
1. No GitHub, vá em **Actions → "Build Desktop (Windows .exe)" → Run workflow**.
2. Quando terminar, baixe o instalador em **Artifacts** (`simula-escola-ia-windows`).

**Opção 2 — Gerar via tag (cria um Release):**
```bash
git tag v1.0.0
git push origin v1.0.0
```
O workflow builda e anexa o instalador ao **Release** `v1.0.0` do repositório.

O resultado inclui:
- `Simula Escola IA Setup x.y.z.exe` — **instalador** (cria atalho no menu e na área de trabalho).
- `Simula Escola IA x.y.z.exe` — versão **portátil** (roda sem instalar).

---

## Compilar localmente (opcional — requer Windows)

```bash
# 1) frontend
cd client && npm ci && npm run build

# 2) backend (dependências de produção)
cd ../server && npm ci --omit=dev

# 3) desktop
cd ../desktop && npm ci

# 4) recompila módulos nativos (better-sqlite3) para o Electron
npx electron-rebuild -m ../server

# 5) gera o instalador (sai em desktop/release/)
npm run dist
```

Para rodar em modo desenvolvimento (sem empacotar), com o frontend já buildado:
```bash
cd desktop && npm start
```

---

## Como usar o app

1. Abra o **Simula Escola IA** (atalho na área de trabalho / menu Iniciar).
2. Tela de login — use as credenciais padrão na 1ª vez:
   - **E-mail:** `admin@simulaescola.local`
   - **Senha:** `simula123`
   - Troque a senha depois em **Configurações e segurança → Alterar senha**.
3. **Configurações:** confirme o modo de teste e informe o **destinatário autorizado**
   (o Gmail que vai receber os e-mails de teste).
4. **Integração com Gmail:** cole o **Client ID** e o **Client Secret** do Google
   direto na interface (não precisa editar arquivo), clique em **Salvar credenciais**
   e depois em **Conectar conta Gmail**.
5. Use normalmente: gerar solicitações, enviar, sincronizar respostas, aprovar
   acompanhamentos e configurar automações.

### Redirect URI no Google Cloud (modo desktop)
Nas credenciais OAuth do Google, adicione em *URIs de redirecionamento autorizados*:
```
http://127.0.0.1:4137/api/gmail/oauth/callback
```
(É a porta fixa do servidor interno do app.)

### Tela de consentimento = Externo (evita o erro 403: org_internal)
Em **Tela de permissão OAuth**, o tipo de usuário deve ser **Externo**. Se estiver
como *Interno*, o Google bloqueia contas Gmail comuns com o erro
`403: org_internal`. Mude para **Externo** e adicione seu e-mail em
*Usuários de teste*. Se não houver a opção de tornar externo (projeto dentro de
uma organização Workspace), crie o projeto OAuth em uma **conta Gmail comum**.

---

## Onde ficam os dados

Tudo é salvo numa pasta gravável do seu usuário (fora do executável):

```
%APPDATA%\Simula Escola IA\data\
├── .env          (configuração local + JWT gerado automaticamente)
└── simula.db     (banco SQLite com solicitações, conversas, automações)
```

No app, menu **Ajuda → Abrir pasta de dados** leva direto a essa pasta.
Faça backup do `simula.db` se quiser preservar o histórico.

---

## Perguntas comuns

- **O app precisa de internet?** Sim, para o Gmail/OAuth. O gerador de IA
  funciona offline (sem custo); o LLM opcional exige internet e chave.
- **Posso usar sem conectar o Gmail?** Sim — você pode gerar solicitações
  fictícias e explorar o sistema; o envio real exige o Gmail conectado.
- **Antivírus reclamou do .exe não assinado.** Instaladores sem assinatura de
  código podem gerar aviso do SmartScreen. É esperado; para distribuição ampla,
  considere um certificado de *code signing* (pago).
