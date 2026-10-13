# 🤖 Modo totalmente automático — Simula Escola IA

Depois de uma **configuração inicial única** e da **autorização do Gmail**, o
sistema opera sozinho no servidor. Sua única tarefa diária é **responder aos
e-mails no seu Gmail** — o resto acontece automaticamente.

---

## O ciclo automático de ponta a ponta

1. A IA **gera** uma solicitação escolar fictícia (categoria permitida, perfil
   fictício), identificada como simulação.
2. O sistema **envia** ao endereço autorizado (modo de teste).
3. O agendador **monitora** o Gmail e importa as respostas, relacionando cada
   mensagem à conversa (thread) correta — sem duplicar.
4. Quando você responde pelo Gmail, a IA **classifica** sua resposta:
   - `resolvida` → encerra a conversa automaticamente;
   - `aguardando informação` / `precisa de acompanhamento` → prepara a próxima
     mensagem;
   - `encerrada` → fecha a conversa;
   - `precisa de intervenção` → marca para você revisar.
5. Se o **envio automático de acompanhamentos** estiver autorizado, a IA
   **envia** a próxima mensagem dentro das regras (limite por conversa, horários,
   intervalos). Caso contrário, deixa o rascunho **aguardando sua aprovação**.
6. O ciclo continua até a **conclusão**, o **limite de acompanhamentos** ou uma
   **condição de interrupção**.

Tudo isso roda em **serviços de backend + agendador persistente** — não depende
de nenhuma página aberta.

---

## Configuração inicial única (uma vez só)

No app, abra **Configuração inicial** (menu lateral 🪄) e preencha em um só passo:

- Destinatário autorizado (seu Gmail de teste);
- Categorias de serviços permitidas (perfis e serviços são **gerados
  automaticamente** a partir de modelos internos — sem cadastro manual);
- Limite e intervalo de envios, horários e dias;
- Duração da simulação;
- Limite de mensagens de acompanhamento por conversa;
- Intervalo de checagem de respostas;
- Modo automático (ligar) e autorização de envio automático de acompanhamentos.

Em seguida, em **Integração com Gmail**, informe o Client ID/Secret e **conecte a
conta** (OAuth real). A automação só envia depois do Gmail conectado.

> **Segurança por padrão:** o envio automático de acompanhamentos começa
> **desligado**. A IA prepara os acompanhamentos e você aprova os primeiros;
> depois dos testes, ligue o envio automático no Dashboard ou nas Automações.

---

## Controles no Dashboard

O painel vira uma **central de monitoramento** com atualização automática
(sem recarregar):

- **Indicador de estado:** “Automação ativa”, “Aguardando autorização”,
  “Aguardando Gmail”, “Pausada”, “Configuração pendente” ou “Com erro”.
- Estado do agendador, última sincronização, última decisão de conversas e
  próxima execução.
- Solicitações criadas/enviadas, respostas identificadas, conversas em
  andamento/concluídas, aguardando aprovação, que precisam de intervenção e
  erros.
- Botões: ligar/desligar modo automático, autorizar envio automático de
  acompanhamentos e **parada de emergência**.

---

## Regras de segurança (persistentes)

- Em **modo de teste**, envia **somente** ao destinatário autorizado — a IA
  nunca escolhe destinatários externos.
- O **envio automático** só ocorre após autorização explícita do administrador.
- Limites por dia, intervalo, horários, dias, duração, tentativas e **máximo de
  acompanhamentos por conversa**.
- **Parada de emergência** bloqueia imediatamente novas tarefas e envios
  (inclusive o processamento de conversas), preservando o histórico; depois é
  possível **liberar** e retomar.
- Prevenção de duplicidades no envio e na importação de respostas.
- Tokens e segredos ficam **apenas no backend**.

---

## Persistência e reinicialização

- Todo o estado (solicitações, mensagens, classificações, contadores de
  acompanhamento, configurações) fica no **banco SQLite persistente**.
- Ao reiniciar o servidor, o agendador recomeça e **retoma** o monitoramento e o
  processamento das conversas abertas — nada essencial depende de uma página.
- O monitoramento usa **consulta periódica** (polling) com intervalo
  configurável, respeitando os limites da Gmail API. (Notificações push do Gmail
  podem ser adicionadas em infraestrutura compatível; ver observações abaixo.)

---

## Para rodar 24h de verdade

O ciclo automático exige um **processo sempre ativo**:

- **App de desktop:** funciona enquanto o app estiver aberto (ver `DESKTOP.md`).
- **Nuvem (recomendado p/ 24h):** publique o backend em infraestrutura always-on
  (Render/Docker/VM) — ver `DEPLOYMENT.md`. Com o PC desligado, só a nuvem
  mantém o ciclo rodando.

---

## Notas sobre notificações push do Gmail (opcional, futuro)

O requisito pede **preferência** por push quando a infraestrutura suportar. O
push do Gmail (`users.watch`) exige **Google Cloud Pub/Sub** e um endpoint HTTPS
público para receber as notificações, além de **renovação periódica** do `watch`
(expira em ~7 dias) e um **sync de segurança** por polling. Hoje o sistema usa
**polling confiável** (configurável, com dedupe e retomada), que atende ao
critério de funcionar com o navegador fechado e após reinícios. A opção push
pode ser habilitada em produção com Pub/Sub; o polling permanece como mecanismo
de segurança.
