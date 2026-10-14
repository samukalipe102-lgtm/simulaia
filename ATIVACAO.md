# ⚡ Ativar e testar o envio de e-mails (EduGestão)

## O fluxo correto (esclarecido)
A **IA/automação gera as solicitações** e as **envia para o Outlook oficial**
(`admsedugestao@outlook.com`). Você **responde manualmente pelo Outlook**. O
Gmail (`adminedugestao@gmail.com`) é a conta **conectada** que o sistema usa para
**enviar** essas solicitações e para arquivar.

> Resumindo os papéis:
> - **Gmail** = conta conectada (OAuth) que o sistema usa para **enviar**.
> - **Outlook** = **destino** das solicitações e onde você **responde**.

## Botão "ATIVAR E TESTAR ENVIO DE E-MAILS" (Dashboard)
Executa verificações **reais** no backend e só liga a IA quando tudo está ok:
1. Credenciais do Gmail presentes.
2. **Conexão real** com o Gmail (chama a API) — envio autorizado.
3. Destino das solicitações (Outlook) definido.
4. Serviços habilitados.
5. Sem parada de emergência.

Estados verdadeiros por etapa: `ok`, `não conectado`, `autenticação necessária`,
`permissão insuficiente`, `falha no envio`. Se faltar algo, o painel diz **o que
é** e **como corrigir** — e **não** liga a IA.

Há também **"Enviar e-mail de teste"**: envia uma mensagem real para o endereço
que você escolher e mostra o resultado (lembrando que "o provedor aceitou" não
garante entrega — confirme na caixa do destinatário).

## Por que não estava chegando no Outlook (causa raiz)
1. **O Gmail não estava conectado via OAuth** → nada era enviado. Conecte em
   **Integração Gmail** (resolvendo `redirect_uri_mismatch` e `org_internal`,
   conforme `GUIA_RAPIDO.md`).
2. **O destino não apontava para o Outlook.** Agora o padrão é o Outlook oficial
   (`official_email`), ajustável em **Configurações → Fluxo de e-mail**.

## Passo a passo para começar
1. **Integração Gmail** → conectar a conta `adminedugestao@gmail.com`.
2. **Configurações → Fluxo de e-mail** → confirmar o Outlook oficial
   `admsedugestao@outlook.com` como destino.
3. **Dashboard** → **ATIVAR E TESTAR ENVIO DE E-MAILS** → resolver eventuais
   pendências apontadas.
4. Opcional: **Enviar e-mail de teste** para a sua própria caixa e confirmar.
5. Com tudo ok, a IA passa a gerar e enviar as solicitações ao Outlook conforme
   as regras das automações (limite diário, intervalo, dias/horas).

## Observações honestas
- O app envia **pelo Gmail** (conta conectada) **para** o Outlook. Ele **não**
  envia "pelo Outlook" nem integra a Microsoft — pelo seu fluxo, isso não é
  necessário (você responde no Outlook manualmente).
- Para funcionar com o computador desligado, hospede o backend (`DEPLOYMENT.md`).
- Nome do app agora é **EduGestão** (título, login, janela, instalador/atalho).
