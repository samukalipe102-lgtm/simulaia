// Registro de novidades ("O que há de novo?"). Lista APENAS alterações
// efetivamente implementadas e publicadas. Não listar pendências como prontas.
// Cada item: { version, date, category, problem, change, benefit, tests, pr }
// category: 'correcao' | 'melhoria' | 'seguranca' | 'desempenho'
export const CHANGELOG = [
  {
    version: '2.3.0',
    date: '2026-10-13',
    category: 'correcao',
    title: 'Textos dos e-mails profissionais + aba de novidades + monitor',
    problem:
      'E-mails reais traziam expressões de teste como "Funcionário(a) simulado(a) para teste" e a assinatura usava o e-mail errado.',
    change:
      'Removidas todas as anotações internas de teste dos e-mails reais; assinatura padrão passa a ser "Atendimento Escolar / EduGestão — Gestão e Atendimento Escolar / E-mail: admsedugestao@outlook.com", personalizável. Adicionada a aba "O que há de novo?" e um monitor de saúde real com avisos por e-mail.',
    benefit:
      'Comunicação natural e profissional com alunos e responsáveis; acompanhamento transparente das atualizações; detecção proativa de problemas.',
    tests:
      '60 testes unitários/integração + e2e (ativação, central, EduGestão) — todos aprovados; CI verde.',
    pr: null, // preenchido automaticamente quando houver (link do PR)
  },
  {
    version: '2.2.0',
    date: '2026-10-13',
    category: 'correcao',
    title: 'IA envia solicitações ao Outlook + botão ATIVAR E TESTAR',
    problem: 'As solicitações geradas não chegavam ao Outlook (destino incorreto/Gmail não conectado).',
    change:
      'Solicitações passam a ser enviadas ao Outlook oficial via Gmail conectado; novo botão "ATIVAR E TESTAR ENVIO DE E-MAILS" com verificações reais e envio de teste; renome do app para EduGestão.',
    benefit: 'As solicitações chegam ao Outlook para resposta manual; diagnóstico claro do que falta para operar.',
    tests: '136 verificações (unit + e2e de ativação/central) — todas aprovadas.',
    pr: 'https://github.com/samukalipe102-lgtm/simulaia/pull/19',
  },
  {
    version: '2.1.0',
    date: '2026-10-13',
    category: 'melhoria',
    title: 'Fluxo Outlook → Gmail (encaminhamento)',
    problem: 'Era preciso identificar o remetente original das solicitações encaminhadas pelo Outlook.',
    change: 'Parser de e-mails encaminhados (Outlook/Gmail) que extrai remetente/assunto/data originais; distinção entre solicitação encaminhada e cópia de resposta.',
    benefit: 'O processo mostra o aluno/responsável real, não o endereço do Outlook.',
    tests: '122 verificações — todas aprovadas.',
    pr: 'https://github.com/samukalipe102-lgtm/simulaia/pull/18',
  },
  {
    version: '2.0.0',
    date: '2026-10-13',
    category: 'melhoria',
    title: 'Central de acompanhamento (sem IA respondendo)',
    problem: 'O sistema precisava apenas monitorar e organizar, sem responder automaticamente.',
    change: 'Reforma para central de acompanhamento: e-mails viram processos; respostas manuais sincronizadas; fila de envios administrativos com limites.',
    benefit: 'Acompanhamento profissional dos processos; nenhuma resposta automática a alunos/responsáveis.',
    tests: '114 verificações — todas aprovadas.',
    pr: 'https://github.com/samukalipe102-lgtm/simulaia/pull/17',
  },
];

export const CURRENT_VERSION = CHANGELOG[0].version;
