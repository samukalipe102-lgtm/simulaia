# 📧 Fluxo de e-mail — Outlook (oficial) → Gmail (apoio) → EduGestão (painel)

## Como funciona

| Etapa | Quem faz | Onde |
|---|---|---|
| 1. Aluno/responsável envia a solicitação | solicitante | **Outlook** `admsedugestao@outlook.com` |
| 2. Outlook encaminha automaticamente ao Gmail | **regra do Outlook** (configurada 1x) | nativo |
| 3. EduGestão mostra como processo | sistema | lê do **Gmail** `adminedugestao@gmail.com` |
| 4. Admin responde ao solicitante | **você, pelo Outlook** | resposta oficial sai do Outlook |
| 5. Cópia da resposta vai ao Gmail | **Cco/regra do Outlook** | arquivo |
| 6. Consultar / organizar / imprimir | sistema | painel EduGestão |

O EduGestão **lê do Gmail** (onde tudo chega) e **identifica o remetente ORIGINAL**
dentro do e-mail encaminhado — ou seja, o processo mostra o aluno/responsável
real, não o endereço do Outlook. **A IA nunca responde a ninguém.**

---

## ⚙️ Configuração no app (EduGestão)

Em **Configurações → Fluxo de e-mail**:
- E-mail oficial de atendimento (Outlook): `admsedugestao@outlook.com`
- E-mail de apoio/arquivo (Gmail conectado): `adminedugestao@gmail.com`
- Ative "Reconhecer solicitações encaminhadas" e "Reconhecer cópias de respostas".

E conecte a conta **Gmail** em **Integração Gmail** (OAuth).

---

## ⚙️ Configuração no Outlook (SUA parte — feita uma única vez)

O encaminhamento real é feito pelo próprio Outlook (nativo, confiável, sem risco
de loop). Escolha **uma** das opções:

### Opção 1 — Encaminhamento automático (mais simples)
1. Entre no Outlook (web): **Configurações (engrenagem) → Email → Encaminhamento**.
2. Marque **Habilitar encaminhamento**.
3. Encaminhar para: `adminedugestao@gmail.com`.
4. Marque **Manter uma cópia das mensagens encaminhadas**.
5. Salvar.

### Opção 2 — Regra de caixa de entrada (mais controle)
1. **Configurações → Email → Regras → Adicionar nova regra**.
2. Nome: "Encaminhar solicitações ao Gmail".
3. Condição: *Aplicar a todas as mensagens* (ou por remetente/assunto, se quiser filtrar).
4. Ação: **Encaminhar para** → `adminedugestao@gmail.com`.
5. Salvar.

### Cópia das respostas enviadas (para o Gmail arquivar)
Ao responder um aluno/responsável pelo Outlook, inclua `adminedugestao@gmail.com`
em **Cco** — assim a cópia da resposta chega ao Gmail e aparece no painel como
"cópia de resposta". (Alternativamente, crie uma regra para itens enviados, se a
sua conta Outlook permitir.)

---

## 🔁 Prevenção de loops e duplicação
- Não configure o Gmail para encaminhar de volta ao Outlook (evita ciclo).
- O EduGestão deduplica por identificador real da mensagem (não cria processos
  nem mensagens repetidas ao re-sincronizar).
- Encaminhadas são distinguidas de cópias de resposta no painel (📨 vs ↩️).

## 🔎 Como o sistema distingue
- **Solicitação encaminhada** (📨): e-mail "Enc:/Fwd:" cujo conteúdo original é do
  aluno/responsável → vira processo com o remetente real.
- **Cópia de resposta** (↩️): encaminhado cujo conteúdo é uma resposta (Re:) ou do
  próprio e-mail oficial → marcado como cópia de resposta.

## ⚠️ Observações honestas
- O app **não envia pelo Outlook** nem integra a Microsoft Graph — pelo seu fluxo,
  você responde manualmente no Outlook e o app apenas consulta/organiza. Isso é
  proposital (mais simples e robusto).
- O envio automático de e-mails administrativos (área **Automação**) usa o Gmail
  conectado e respeita limite diário e intervalo — e **não** responde solicitações.
- Para o app sincronizar com o navegador/computador fechado, hospede o backend
  (ver `DEPLOYMENT.md`).
