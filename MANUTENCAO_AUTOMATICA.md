# 🔧 Manutenção automática via GitHub Actions

Dois níveis, ambos **reais** (nada é simulado). Rodam no GitHub, sem o app ou o
computador do administrador abertos.

## Nível 1 — Saúde agendada (ativo, sem configuração)
Workflow: `.github/workflows/scheduled-health.yml`

- Roda **de hora em hora** (e sob demanda em Actions → Run workflow).
- Executa a **suíte completa** (unit + e2e) e o **build do frontend**.
- Se algo quebrar, **abre uma issue** `manutencao-automatica` com o link dos logs
  (ou comenta na issue existente, sem duplicar).
- **Não altera código.** Só verifica e avisa — honesto e seguro.

Isso garante que, se uma mudança quebrar o sistema, você é avisado
automaticamente, mesmo sem mexer no app.

## Nível 2 — Correção assistida por IA (opcional, você habilita)
Workflow: `.github/workflows/ai-assisted-fix.yml`

- **Só funciona se você criar o secret `OPENAI_API_KEY`** no repositório
  (Settings → Secrets and variables → Actions → New repository secret).
  Sem o secret, o job é **pulado automaticamente** (não finge que roda).
- Acionado **manualmente** (Actions → "Correção assistida por IA" → Run workflow),
  informando o problema a corrigir.
- **Sempre abre um Pull Request** para a sua revisão. **Nunca** faz push direto em
  `main`. O CI (testes + build) roda no PR antes de qualquer merge.
- Mudanças de risco (dados, permissões, e-mail) **exigem** sua aprovação no PR.

### Por que não há "auto-publish 100% autônomo"?
Dar a uma automação o poder de **escrever e publicar código sozinha em produção**
exigiria uma chave de modelo + permissão de escrita operando sem revisão — o que
é **inseguro** e sem o julgamento necessário para não quebrar o atendimento por
e-mail. Por isso o fluxo mantém **revisão humana via PR** como barreira final.
Isso respeita a regra do projeto: correções seguras são rápidas (abrir PR + CI),
mas nada que afete e-mail/dados/permissões é publicado sem sua aprovação.

## Como ligar o Nível 2 (passo a passo)
1. Gere uma chave em https://platform.openai.com/api-keys (há custo por uso).
2. No GitHub: **Settings → Secrets and variables → Actions → New repository secret**.
3. Nome: `OPENAI_API_KEY` · Valor: sua chave. Salvar.
4. Pronto — o workflow passa a aceitar execuções e abrir PRs de correção.

> Dica: você pode manter apenas o **Nível 1** (grátis e seguro) e continuar
> pedindo correções específicas pelo chat, que eu abro o PR, testo e publico.
