// Extrai a solicitação ORIGINAL de dentro de um e-mail ENCAMINHADO (Fwd:).
// O Gmail recebe o encaminhamento feito pelo Outlook; precisamos recuperar o
// remetente/assunto/data originais (o aluno/responsável), e não o Outlook.
//
// Suporta os formatos de cabeçalho de encaminhamento mais comuns (Outlook e
// Gmail), em português e inglês. É tolerante: se não encontrar, devolve null e
// o chamador usa os dados do próprio e-mail recebido.

const FWD_SUBJECT_RE = /^\s*(fwd?|enc|encaminhad[ao]|res|re)\s*:\s*/i;

// Normaliza o assunto removendo prefixos de encaminhamento/resposta repetidos.
export function stripForwardPrefixes(subject = '') {
  let s = subject;
  let prev;
  do {
    prev = s;
    s = s.replace(FWD_SUBJECT_RE, '');
  } while (s !== prev);
  return s.trim();
}

export function looksForwarded(subject = '', body = '') {
  if (/^\s*(fwd?|enc|encaminhad)/i.test(subject)) return true;
  return (
    /-{2,}\s*(forwarded message|mensagem encaminhada|original message|mensagem original)\s*-{2,}/i.test(body) ||
    /^\s*(de|from)\s*:.*\n\s*(enviada?|sent|data|date)\s*:/im.test(body)
  );
}

function extractEmail(value = '') {
  const m = /<([^>]+@[^>]+)>/.exec(value) || /([^\s<>"]+@[^\s<>"]+)/.exec(value);
  return m ? m[1].trim().toLowerCase() : '';
}
function extractName(value = '') {
  const m = /^\s*"?([^"<]+?)"?\s*</.exec(value);
  return (m ? m[1] : value).replace(/[<>]/g, '').trim();
}

/**
 * Tenta extrair { originalFrom, originalFromEmail, originalName, originalSubject,
 * originalDate, originalBody } de um corpo encaminhado. Retorna null se não
 * reconhecer um bloco de encaminhamento.
 */
export function parseForwarded({ subject = '', body = '' } = {}) {
  if (!looksForwarded(subject, body)) return null;

  const lines = body.split(/\r?\n/);

  // Procura o bloco de cabeçalho encaminhado: linhas De/From, Enviada/Sent/Data,
  // Para/To, Assunto/Subject (em qualquer ordem, dentro de uma janela).
  const field = (names) =>
    new RegExp(`^\\s*(?:${names})\\s*:\\s*(.+)$`, 'i');
  const reFrom = field('de|from|remetente');
  const reDate = field('enviad[ao]|sent|data|date');
  const reSubject = field('assunto|subject');
  const reTo = field('para|to|destinat[áa]rio');

  let from = '', date = '', subj = '', headerEndIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!from) { const m = reFrom.exec(l); if (m) { from = m[1].trim(); headerEndIdx = i; continue; } }
    if (!date) { const m = reDate.exec(l); if (m) { date = m[1].trim(); headerEndIdx = i; continue; } }
    if (!subj) { const m = reSubject.exec(l); if (m) { subj = m[1].trim(); headerEndIdx = i; continue; } }
    if (reTo.test(l)) { headerEndIdx = i; continue; }
    // para após achar o remetente e passar algumas linhas sem cabeçalho
    if (from && headerEndIdx >= 0 && i - headerEndIdx > 4) break;
  }

  if (!from) return null;

  const originalBody = headerEndIdx >= 0
    ? lines.slice(headerEndIdx + 1).join('\n').trim()
    : body.trim();

  return {
    originalFrom: from,
    originalFromEmail: extractEmail(from),
    originalName: extractName(from),
    originalSubject: stripForwardPrefixes(subj || subject),
    originalDate: date || null,
    originalBody: originalBody || body,
  };
}
