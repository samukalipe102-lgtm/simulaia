# Relatório de testes — Simula Escola IA

Este documento diferencia **testes executados**, **funcionalidades implementadas**
e **configurações externas pendentes** (que dependem de credenciais suas).

## Como reproduzir

```bash
cd server
npm install
npm test          # suíte unit/integração (node:test)
npm run test:e2e  # end-to-end contra a API HTTP real
```

---

## 1. Testes executados e aprovados ✅

### Suíte unit/integração — `npm test` → **24/24 aprovados**

Arquivos: `tests/unit.test.js`, `tests/gmail-flow.test.js`, `tests/api-auth.test.js`.

| Área | O que foi verificado | Status |
|------|----------------------|--------|
| Autenticação | Assinatura/verificação JWT; token inválido rejeitado | ✅ |
| Autenticação (HTTP) | Login correto retorna token; senha errada → 401; rota protegida bloqueia anônimo e aceita token válido | ✅ |
| Permissões | Middleware `requireAuth` protege rotas | ✅ |
| IA (geração) | Solicitação marcada como fictícia; assunto `[SIMULAÇÃO]`; usa serviço habilitado | ✅ |
| IA (acompanhamento) | Rascunho referencia a solicitação e é fictício | ✅ |
| Envio (mock Gmail) | `sendRequest` retorna e grava `threadId`/`messageId` reais; modo de teste força destinatário autorizado | ✅ |
| Identificação de respostas | `syncReplies` importa resposta inbound e marca `replied`; relaciona à thread correta | ✅ |
| Continuidade da conversa | Acompanhamento aprovado é enviado **na mesma thread** | ✅ |
| Aprovação de acompanhamento | Rascunho fica `pending`; só envia após aprovação; rejeição volta a `replied` | ✅ |
| Histórico persistente | Mensagens e status gravados no SQLite | ✅ |
| Prevenção de duplicidade | Mesmo assunto+destinatário recente é bloqueado; resposta não é importada duas vezes | ✅ |
| Automação (regras) | Pausada não envia; emergência bloqueia; limite diário; janela de horário | ✅ |
| Parada de emergência | Flag global interrompe automações ativas | ✅ |

### Suíte end-to-end — `npm run test:e2e` → **19/19 aprovados**

Arquivo: `tests/e2e-live.sh` (sobe o servidor real e usa HTTP).

Cobre: autenticação/permissões, geração fictícia, modo de teste e destinatário
autorizado, ciclo de automação (criar/ativar/pausar/retomar), `canSendNow`,
parada de emergência (aciona/bloqueia/libera), dashboard e log de atividade.

---

## 2. Funcionalidades implementadas (código completo e funcional)

- Interface completa: menu lateral, dashboard com indicadores e gráficos, tabelas,
  filtros, badges de status, layout responsivo e **todas as páginas do menu**.
- IA gera solicitações fictícias variadas (assunto, mensagem, perfil, data,
  categoria, identificador `SIM-AAAA-NNNN`, status), usando **somente** serviços
  habilitados e perfis fictícios.
- Integração **real** com Gmail via OAuth 2.0: URL de consentimento, callback,
  envio, leitura de threads, detecção de respostas, armazenamento dos IDs reais,
  renovação automática de token e tratamento de autorização expirada.
- Acompanhamentos **aguardam aprovação** por padrão; nada é enviado sem confirmação.
- Central de automação: máx./dia, intervalo, dias/horas, categorias, perfis,
  duração, destinatário autorizado, aprovação manual, tentativas em caso de erro,
  ativar/pausar/retomar e **parada de emergência**.
- **Agendador no servidor** (node-cron): tick de automação (1 min) e sync de
  respostas (2 min), independente do navegador.
- Dashboard/histórico com todos os status, últimas execuções, próxima execução,
  falhas recentes e página de detalhes com histórico cronológico.
- Banco persistente (SQLite), autenticação administrativa, controle de acesso e
  isolamento por conversa (cada solicitação = uma thread).
- Segredos somente no backend; limites de segurança, prevenção de duplicidade e
  registro de falhas.

---

## 3. Testes que dependem de configuração externa ⏳

Estes caminhos estão **implementados** e cobertos por testes com Gmail **mockado**,
mas a validação com o **Gmail real** depende das suas credenciais e autorização:

| Teste | O que falta | Como validar |
|-------|-------------|--------------|
| Conexão real com Gmail | `GOOGLE_CLIENT_ID`/`SECRET` + autorizar a conta | Página **Integração com Gmail** → Conectar → **Testar conexão** |
| Envio real de e-mail de teste | Gmail conectado + destinatário autorizado | **Solicitações** → Gerar → **Enviar** (chega na sua caixa) |
| Recebimento/identificação de resposta real | Responder pelo seu Gmail | **Conversas** → **Sincronizar respostas** (status vira *Respondida*) |
| Agendador com navegador fechado em produção | Deploy com processo always-on | Publicar conforme `DEPLOYMENT.md` e fechar o navegador |
| Expiração/renovação de autorização real | Token real expirando | O backend renova via `refresh_token`; se expirar sem ele, pede reconexão |

> **Não declaramos como "aprovados" os testes que exigem o Gmail real**, pois eles
> dependem das suas credenciais. O código e a lógica correspondentes estão
> implementados e validados com transporte simulado.

---

## 4. Resumo

| Categoria | Resultado |
|-----------|-----------|
| Testes unit/integração executados | **24/24 ✅** |
| Testes end-to-end executados | **19/19 ✅** |
| Funcionalidades implementadas | Completas (frontend, backend, DB, Gmail, agendador) |
| Pendências externas | Credenciais Google + hospedagem always-on |
