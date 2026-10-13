# 🏫 EduGestão Atendimento — Central de acompanhamento (reforma v2)

Mudança de filosofia: o sistema deixa de **gerar/responder** solicitações e passa
a ser uma **central de acompanhamento** de solicitações recebidas por e-mail.

> **Regra principal:** todas as solicitações chegam por e-mail. O aplicativo
> serve para **visualizar, organizar e acompanhar** os processos e para
> configurar a automação de **envios administrativos**. O administrador responde
> **pessoalmente pelo Gmail**. O sistema **nunca** responde automaticamente a
> alunos ou responsáveis.

## O que mudou
- **Sem IA respondendo**: removido do fluxo o envio automático de respostas e a
  geração de solicitações. O agendador agora só (1) **sincroniza a caixa** e (2)
  processa a **fila administrativa**.
- **E-mail → processo**: cada e-mail recebido vira um processo com protocolo
  (`EDU-ANO-NNNN`), remetente, assunto, conteúdo, data, anexos e histórico.
- **Respostas manuais** enviadas pelo Gmail são sincronizadas e associadas ao
  processo; o status só vira **Respondido** quando há uma mensagem realmente
  enviada (nunca por rascunho).
- **Menu enxuto**: Dashboard · Processos escolares · Caixa de entrada · Respostas
  enviadas · Documentos · Automação · Configurações.

## Automação administrativa (fila)
Tela dedicada **apenas** a envios administrativos autorizados — **não** responde
solicitações. Recursos:
- Limite diário, intervalo em minutos (aplicado **no backend**: um envio por vez,
  nunca todos de uma vez), horário inicial/final, dias da semana.
- Ativar / pausar / retomar sem reiniciar o app.
- Fila com itens pendentes, processados e com falha; contador diário
  (enviados / limite / restantes); histórico (destinatário, data, status).
- Tentativas controladas, **prevenção de duplicidade** (dedupe_key) e pausa
  automática ao atingir o limite diário (retoma no próximo dia permitido).
- Persistente: continua após reinício; o envio depende de o servidor estar ativo.

## Endpoints novos (todos autenticados)
| Método | Rota | Função |
|---|---|---|
| POST | `/api/central/sync` | Sincroniza a caixa de entrada |
| GET | `/api/central/processes[?status&q&from&to]` | Lista/pesquisa processos |
| GET | `/api/central/processes/:id` | Processo + mensagens + anexos |
| PUT | `/api/central/processes/:id/status` | Ajuste manual de status |
| GET | `/api/central/inbox` | Mensagens recebidas |
| GET | `/api/central/sent` | Respostas enviadas (confirmadas) |
| GET | `/api/central/documents` | Anexos por processo |
| GET | `/api/central/attachments/:id/download` | Baixa anexo (sob demanda no Gmail) |
| GET/PUT | `/api/central/admin-automation` | Config + fila + estatísticas |
| POST | `/api/central/admin-automation/{activate\|pause\|resume}` | Controle |
| POST | `/api/central/admin-automation/enqueue` | Enfileira e-mail administrativo |

## Anexos e documentos
Metadados dos anexos são registrados por processo; o conteúdo é buscado **sob
demanda** no Gmail no momento do download (sem armazenar arquivos fictícios).
Downloads só são oferecidos quando há identificadores reais do Gmail.

## Segurança/LGPD
- Tokens OAuth e segredos ficam **apenas no backend** (secret nunca volta ao
  navegador). Acesso por autenticação administrativa.
- Nenhuma resposta automática a mensagens recebidas; envios automáticos só da
  fila administrativa, ao destinatário autorizado.
- Parada de emergência bloqueia os envios administrativos.

## Testes — 114 verificações, todas verdes
```bash
cd server
npm test            # 52 unit/integração (inclui 9 da central)
npm run test:e2e    # 21 e2e
npm run test:central# 15 e2e da central (processos, caixa, fila admin, limites)
npm run test:edu    # 14
npm run test:single # 5
```
A suíte da central cobre: e-mail→processo sem auto-resposta, idempotência,
resposta manual marcando "Respondido", anexos, e a fila administrativa (limite
diário, intervalo, dedupe, pausa, emergência).

## Dependências externas (você)
- **Gmail** conectado via OAuth (ver `GUIA_RAPIDO.md`/`DESKTOP.md`).
- **Hospedagem contínua** para sincronizar e processar a fila com o app fechado
  (ver `DEPLOYMENT.md`). Notificações push do Gmail (Pub/Sub) são opcionais;
  hoje usa polling confiável com dedupe e recuperação.
