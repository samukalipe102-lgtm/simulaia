# 🏫 EduGestão — Plataforma de Atendimento Escolar

Esta atualização evolui o Simula Escola IA para a identidade **EduGestão**, com
central de e-mails, dados escolares, processos administrativos, assinaturas
institucionais e atualização em tempo real — construída **sobre** o sistema
existente (automação, Gmail OAuth, agendador e segurança preservados).

---

## O que foi implementado nesta atualização

### Identidade institucional (EduGestão)
- Nome **EduGestão**, e-mail institucional **adminedugestao@gmail.com**, setor
  padrão **Atendimento Escolar** (configuráveis em *Assinaturas*).
- **Assinaturas por setor** (Atendimento, Secretaria, Coordenação, Direção),
  aplicadas automaticamente aos envios **sem duplicar**. Nenhum campo vazio ou
  marcador de preenchimento é incluído.

### Alunos e responsáveis (61 pares)
- Importação **idempotente** dos 61 pares aluno—responsável, preservando a
  grafia e os vínculos. Reexecutar **não duplica**; retorna um resumo
  (inseridos / atualizados / inalterados / conflitos).
- Responsáveis compartilhados são reutilizados (ex.: “Fernando Rodrigues”
  vinculado a 3 alunos).
- Nenhum e-mail/telefone/endereço/matrícula é inventado. Dados protegidos por
  autenticação. Cadastrar **não** dispara mensagens a essas pessoas.

### Processos escolares
- Catálogo de 12 processos (declaração de matrícula/frequência, histórico,
  boletim, correção cadastral, atualização de contatos, transferência,
  calendário/horários, dúvidas de avaliações, documentais, encaminhamentos à
  secretaria/coordenação). Cada um com requisitos, etapas, setor responsável,
  prazo (SLA), modelo de resposta e critérios de conclusão.

### Central de e-mails + tempo real
- Dashboard como central de monitoramento com **SSE (Server-Sent Events)**:
  atualiza sozinho ao receber eventos do servidor (sincronização, novas
  respostas, envios), com **fallback de polling** e carimbo de “última
  atualização”. Indica *Tempo real* vs *Atualização automática*.
- A IA classifica as respostas e conduz as conversas automaticamente (recurso
  já existente, preservado) — ver `AUTOMACAO.md`.

### Novas telas
- **Alunos e responsáveis**, **Processos escolares**, **Assinaturas** (com edição
  da identidade institucional), além do menu/branding EduGestão.

---

## Endpoints novos (todos autenticados, exceto o SSE que usa token na query)

| Método | Rota | Função |
|-------:|------|--------|
| GET  | `/api/edugestao/students` | Lista alunos + contagem |
| POST | `/api/edugestao/students/import` | Importa os 61 pares (idempotente) |
| GET/PUT | `/api/edugestao/processes[/:id]` | Catálogo de processos |
| GET/PUT | `/api/edugestao/signatures[/:id]` | Assinaturas institucionais |
| GET/PUT | `/api/edugestao/institution` | Identidade EduGestão |
| GET | `/api/events?token=...` | Stream SSE em tempo real |

O **assistente de configuração inicial** (`POST /api/settings/setup`) também
importa os alunos e semeia processos/assinaturas em um único passo.

---

## Testes executados (97 verificações, todas verdes)

```bash
cd server
npm test            # 38 unit/integração (inclui 8 do EduGestão)
npm run test:e2e    # 19 e2e gerais
npm run test:auto   # 16 e2e do modo automático
npm run test:edu    # 12 e2e do EduGestão (import idempotente, processos, assinaturas, SSE auth)
npm run test:single # 5 serviço único (backend serve a UI)
```

Cobertura do EduGestão: 61 pares exatos, importação idempotente (reimport = 0
novos), responsável compartilhado, atualização de vínculo, seed de processos e
assinaturas, aplicação de assinatura **sem duplicar**, proteção do SSE por token.

---

## Dependências externas ainda pendentes (você)

- **Gmail real**: conectar via OAuth e cadastrar a redirect URI (ver
  `GUIA_RAPIDO.md`/`DESKTOP.md`). O e-mail institucional **não** é considerado
  conectado até a autorização real.
- **Hospedagem 24h**: para o agendador e o monitoramento rodarem continuamente,
  publicar em infraestrutura always-on (ver `DEPLOYMENT.md`).
- **Notificações push do Gmail** (opcional): exigem Google Cloud Pub/Sub e
  endpoint HTTPS; hoje o monitoramento usa polling confiável com dedupe e
  recuperação (atende ao funcionamento com o navegador fechado).

## Observações de segurança/LGPD

- Tokens OAuth e segredos ficam **apenas no backend**; o Client Secret nunca é
  devolvido ao navegador.
- Dados de alunos/responsáveis ficam no banco local, atrás de autenticação.
- Em modo de teste, envios vão **somente** ao destinatário autorizado; o sistema
  não envia mensagens a pessoas cadastradas sem validação explícita.
