// AI request generator.
// Primary mode: deterministic, natural-language template engine (works fully offline).
// Optional: if OPENAI_API_KEY is configured, it enriches the subject/body via an LLM.
//
// IMPORTANT: Every generated request is explicitly flagged as FICTITIOUS and uses
// only services enabled by the admin and only fictitious profiles. It never
// references real students or real people.

import { config } from '../config.js';

const SUBJECT_TEMPLATES = {
  declaracao: [
    'Solicitação de declaração de matrícula',
    'Pedido de declaração de frequência',
    'Declaração para fins de benefício',
  ],
  historico: [
    'Solicitação de histórico escolar',
    'Pedido de segunda via de histórico',
    'Histórico escolar para transferência',
  ],
  documento: [
    'Solicitação de documento escolar',
    'Pedido de segunda via de documento',
    'Documento para processo de bolsa',
  ],
  esclarecimento: [
    'Dúvida sobre calendário escolar',
    'Esclarecimento sobre horários de aula',
    'Dúvida sobre procedimento de rematrícula',
  ],
};

const OPENERS = {
  responsavel: [
    'Bom dia, sou responsável por um(a) estudante e gostaria de solicitar',
    'Olá, escrevo na condição de responsável para pedir',
    'Prezados, como responsável, venho solicitar',
  ],
  professor: [
    'Prezada secretaria, como professor(a) da unidade, preciso de',
    'Olá, enquanto docente, gostaria de solicitar',
  ],
  coordenador: [
    'Bom dia, na coordenação pedagógica necessitamos de',
    'Prezados, pela coordenação, solicito',
  ],
  funcionario: [
    'Olá, como funcionário(a) administrativo(a), preciso providenciar',
    'Prezados, para fins administrativos, solicito',
  ],
};

const CLOSERS = [
  'Desde já agradeço a atenção e aguardo retorno.',
  'Fico no aguardo das instruções. Obrigado(a).',
  'Agradeço antecipadamente pelo suporte.',
  'Qualquer informação adicional, permaneço à disposição.',
];

function pick(arr, rnd) {
  return arr[Math.floor(rnd() * arr.length)];
}

// Simple seeded PRNG so generation is reproducible when a seed is given.
function makeRng(seed) {
  let s = seed >>> 0 || Math.floor(Math.random() * 2 ** 31);
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/**
 * Build a simulated request from an enabled service + fictitious profile.
 * @returns {{subject, body, category, fictitious:true}}
 */
export function generateRequestContent(opts = {}) {
  const { service, profile, seed } = opts;
  const rnd = makeRng(seed);
  const category = service?.category || 'esclarecimento';
  const role = profile?.role || 'responsavel';

  const subjectBase =
    pick(SUBJECT_TEMPLATES[category] || SUBJECT_TEMPLATES.esclarecimento, rnd);
  const opener = pick(OPENERS[role] || OPENERS.responsavel, rnd);
  const closer = pick(CLOSERS, rnd);

  const serviceName = service?.name || 'um esclarecimento escolar';
  const refNote = profile?.context ? ` ${profile.context}` : '';

  // realMode = true → mensagem profissional (sem marcadores de simulação).
  // realMode = false → mantém marcador discreto de teste (segurança no setup).
  const realMode = opts?.realMode ?? false;
  const senderName = profile?.name || 'Solicitante';

  const subject = realMode ? subjectBase : `[SIMULAÇÃO] ${subjectBase}`;
  const sign = realMode
    ? `— ${senderName}`
    : `— ${senderName} (perfil fictício / simulação)`;
  const footer = realMode
    ? '' // sem rodapé de simulação em modo real
    : `\n\n---\nMensagem gerada automaticamente pelo EduGestão Atendimento para fins de ` +
      `teste e simulação. Não representa uma pessoa real nem um aluno real.`;

  const body =
    `${opener} ${serviceName}.` +
    `${refNote}\n\n` +
    `${closer}\n\n` +
    `${sign}${footer}`;

  return { subject, body, category, fictitious: !realMode };
}

/**
 * Optional LLM enrichment. Falls back silently to template output on any error
 * or when no API key is configured.
 */
export async function generateWithLLM({ service, profile, realMode = false } = {}) {
  if (!config.openai.apiKey) return null;
  try {
    const systemPrompt = realMode
      ? 'Você redige solicitações de atendimento escolar em português do Brasil, ' +
        'de forma profissional e cordial. Responda em JSON {"subject","body"}. ' +
        'Não inclua rótulos de teste nem marcadores de simulação.'
      : 'Você gera solicitações escolares FICTÍCIAS em português do Brasil ' +
        'para teste de um sistema. Nunca use pessoas ou alunos reais. ' +
        'Responda em JSON {"subject","body"}. O assunto deve começar com "[SIMULAÇÃO]".';
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.openai.apiKey}`,
      },
      body: JSON.stringify({
        model: config.openai.model,
        temperature: 0.9,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: JSON.stringify({
              servico: service?.name,
              categoria: service?.category,
              perfil: { nome: profile?.name, papel: profile?.role },
            }),
          },
        ],
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}');
    if (!parsed.subject || !parsed.body) return null;
    if (realMode) {
      const subject = parsed.subject.replace(/^\[SIMULA[ÇC][ÃA]O\]\s*/i, '');
      return { subject, body: parsed.body, category: service?.category, fictitious: false };
    }
    const subject = parsed.subject.startsWith('[SIMULAÇÃO]')
      ? parsed.subject
      : `[SIMULAÇÃO] ${parsed.subject}`;
    const body =
      `${parsed.body}\n\n---\nMensagem fictícia gerada pelo EduGestão Atendimento ` +
      `para fins de teste. Não representa pessoas ou alunos reais.`;
    return { subject, body, category: service?.category, fictitious: true };
  } catch {
    return null;
  }
}

/**
 * Generate a contextual follow-up given the conversation so far.
 * Returns a draft that MUST be approved before sending (handled by caller).
 */
export function generateFollowUp({ request, lastInbound, classification, realMode = false }) {
  const quote = (lastInbound?.body || '').slice(0, 220);

  // Tailor the follow-up to the detected intent of the last reply.
  let ask;
  switch (classification) {
    case 'awaiting_info':
      ask =
        'poderia, por gentileza, informar quais dados ou documentos ainda são ' +
        'necessários para dar andamento?';
      break;
    case 'needs_followup':
      ask =
        'gostaria de confirmar os próximos passos e um prazo estimado para a ' +
        'conclusão.';
      break;
    default:
      ask = 'gostaria de confirmar os próximos passos.';
  }

  const body =
    `Olá, obrigado(a) pelo retorno.\n\n` +
    `Em relação à sua resposta ${quote ? `("${quote}...")` : ''}, ${ask}\n\n` +
    `Trata-se da solicitação ${request.public_id} (${request.category}).\n\n` +
    `Permaneço à disposição para qualquer informação adicional.\n\n` +
    (realMode
      ? `— ${request.profile_name}`
      : `— ${request.profile_name} (perfil fictício / simulação)\n\n` +
        `---\nAcompanhamento fictício gerado pelo EduGestão Atendimento (simulação).`);
  return {
    subject: `Re: ${request.subject}`,
    body,
    fictitious: !realMode,
  };
}

// Possible classifications for an inbound reply.
export const REPLY_CLASSES = [
  'resolved', // a solicitação foi atendida/concluída
  'awaiting_info', // falta alguma informação/documento do solicitante
  'needs_followup', // precisa de um acompanhamento para prosseguir
  'closed', // conversa encerrada pela outra parte
  'needs_admin', // caso ambíguo/sensível → intervenção humana
];

// Deterministic keyword-based classifier (offline fallback).
function classifyByKeywords(text) {
  const t = (text || '').toLowerCase();
  const has = (...words) => words.some((w) => t.includes(w));

  // Check "closed/denied" BEFORE "resolved" (e.g. "indeferido" must not match
  // the "deferido" substring used for resolved).
  if (has('indeferid', 'encerr', 'não daremos', 'nao daremos', 'arquivad', 'cancelad', 'negad')) {
    return { classification: 'closed', confidence: 0.7, source: 'keywords' };
  }
  if (has('resolvido', 'concluíd', 'concluido', 'finalizado', 'emitid', 'pronto',
          'disponível', 'disponivel', 'deferid', 'atendid', 'segue em anexo', 'anexo o')) {
    return { classification: 'resolved', confidence: 0.7, source: 'keywords' };
  }
  if (has('precisamos de', 'preciso de', 'envie', 'informe', 'qual o', 'poderia informar',
          'faltou', 'faltando', 'documento', 'cpf', 'rg', 'matrícula', 'matricula',
          'comprovante', 'dados')) {
    return { classification: 'awaiting_info', confidence: 0.6, source: 'keywords' };
  }
  if (has('aguarde', 'em análise', 'em analise', 'processando', 'prazo', 'retornaremos',
          'em breve', 'estamos verificando', 'verificando')) {
    return { classification: 'needs_followup', confidence: 0.55, source: 'keywords' };
  }
  // Default: nudge the conversation forward with a follow-up.
  return { classification: 'needs_followup', confidence: 0.3, source: 'keywords' };
}

/**
 * Classify an inbound reply within the conversation context.
 * Uses the LLM when configured; otherwise a deterministic keyword heuristic.
 * Always returns { classification, confidence, source, reason? }.
 */
export async function classifyReply({ request, replyText, history = [] } = {}) {
  const fallback = classifyByKeywords(replyText);

  if (!config.openai.apiKey) return fallback;
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.openai.apiKey}`,
      },
      body: JSON.stringify({
        model: config.openai.model,
        temperature: 0,
        messages: [
          {
            role: 'system',
            content:
              'Você classifica a ÚLTIMA resposta recebida em uma conversa de ' +
              'atendimento escolar SIMULADO. Responda em JSON ' +
              '{"classification","reason"}. classification deve ser um de: ' +
              REPLY_CLASSES.join(', ') +
              '. "resolved" = pedido atendido/concluído; "awaiting_info" = falta ' +
              'informação do solicitante; "needs_followup" = em andamento, vale ' +
              'um acompanhamento; "closed" = encerrado/indeferido; "needs_admin" ' +
              '= ambíguo/sensível que exige um humano.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              solicitacao: { assunto: request?.subject, categoria: request?.category },
              historico: history.slice(-6),
              ultima_resposta: (replyText || '').slice(0, 1500),
            }),
          },
        ],
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) return fallback;
    const data = await res.json();
    const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}');
    if (!REPLY_CLASSES.includes(parsed.classification)) return fallback;
    return {
      classification: parsed.classification,
      confidence: 0.9,
      source: 'llm',
      reason: parsed.reason || '',
    };
  } catch {
    return fallback;
  }
}
