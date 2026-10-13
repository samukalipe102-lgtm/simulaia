// Central de acompanhamento: importa e-mails RECEBIDOS como processos e
// sincroniza as respostas que o ADMINISTRADOR enviou manualmente pelo Gmail.
// IMPORTANTE: este módulo NUNCA envia respostas. Ele apenas lê, organiza e
// atualiza o painel. Nenhuma resposta automática a alunos/responsáveis.

import { db, log, getSettings } from '../db/index.js';
import * as gmail from './gmail.js';
import { parseForwarded, stripForwardPrefixes } from './forwardParser.js';

function nextProtocol() {
  const year = new Date().getFullYear();
  const row = db.prepare("SELECT COUNT(*) AS c FROM requests WHERE public_id LIKE ?").get(`EDU-${year}-%`);
  const seq = String((row?.c || 0) + 1).padStart(4, '0');
  return `EDU-${year}-${seq}`;
}

function parseEmail(from) {
  const m = /<([^>]+)>/.exec(from || '');
  return (m ? m[1] : (from || '')).trim().toLowerCase();
}
function parseName(from) {
  const m = /^\s*"?([^"<]+?)"?\s*</.exec(from || '');
  return (m ? m[1] : (from || '')).trim();
}

/**
 * Sincroniza a caixa de entrada: cada thread recebida vira (ou atualiza) um
 * processo. Mensagens inbound e as respostas manuais do admin (outbound no
 * Gmail) são registradas. Idempotente (dedupe por gmail_message_id).
 */
export async function syncInbox({ max = 30 } = {}) {
  const settings = getSettings();
  let inbox;
  try {
    inbox = await gmail.listInbox({ max });
  } catch (err) {
    log('error', 'gmail', `Falha ao sincronizar caixa de entrada: ${err.message}`);
    return { imported: 0, processes: 0, error: err.message };
  }

  let imported = 0;
  let processes = 0;

  const officialEmail = (settings.official_email || '').toLowerCase();

  for (const msg of inbox) {
    const threadId = msg.gmailThreadId;
    // Localiza (ou cria) o processo pela thread.
    let request = db.prepare('SELECT * FROM requests WHERE gmail_thread_id = ?').get(threadId);
    if (!request) {
      const protocol = nextProtocol();
      const envelopeEmail = parseEmail(msg.from);

      // Fluxo Outlook→Gmail: se o e-mail foi encaminhado (geralmente pelo Outlook
      // oficial), extrai o remetente ORIGINAL (aluno/responsável).
      const fwd = parseForwarded({ subject: msg.subject, body: msg.body || '' });
      const isFromOutlook = officialEmail && envelopeEmail === officialEmail;

      let originKind = 'direct';
      let senderName = parseName(msg.from) || msg.from;
      let senderEmail = envelopeEmail;
      let originalSenderEmail = null;
      let originalDate = null;
      let subject = msg.subject;
      let body = msg.body || msg.snippet || '';

      if (fwd) {
        // Heurística: se o conteúdo encaminhado é uma resposta (Re:) ou veio do
        // próprio e-mail oficial, trata como CÓPIA DE RESPOSTA; senão, é a
        // SOLICITAÇÃO encaminhada do aluno/responsável.
        const looksResponse = /^\s*(re|resp)\s*:/i.test(msg.subject) ||
          (officialEmail && fwd.originalFromEmail === officialEmail);
        originKind = looksResponse ? 'response_copy' : 'forwarded_request';
        senderName = fwd.originalName || senderName;
        senderEmail = fwd.originalFromEmail || senderEmail;
        originalSenderEmail = fwd.originalFromEmail || null;
        originalDate = fwd.originalDate || null;
        subject = fwd.originalSubject || stripForwardPrefixes(msg.subject);
        body = fwd.originalBody || body;
      } else if (isFromOutlook) {
        originKind = 'forwarded_request';
      }

      const info = db
        .prepare(
          `INSERT INTO requests
            (public_id, subject, body, category, profile_name, profile_role, recipient,
             status, conversation_state, fictitious, source, sender_email,
             origin_kind, original_sender_email, original_date,
             gmail_thread_id, gmail_message_id, sent_at)
           VALUES (?, ?, ?, 'esclarecimento', ?, 'responsavel', ?, 'replied', 'open', 0,
             'inbound', ?, ?, ?, ?, ?, ?, datetime('now'))`,
        )
        .run(
          protocol,
          subject,
          body,
          senderName,
          settings.authorized_recipient || null,
          senderEmail,
          originKind,
          originalSenderEmail,
          originalDate,
          threadId,
          msg.gmailMessageId,
        );
      request = db.prepare('SELECT * FROM requests WHERE id = ?').get(info.lastInsertRowid);
      processes++;
      log('info', 'inbox', `Novo processo (${originKind}): ${protocol} (${senderEmail})`, {
        requestId: request.id,
      });
    }

    // Importa TODAS as mensagens da thread (inbound e respostas manuais do admin).
    let threadMsgs = [];
    try {
      threadMsgs = await gmail.getThreadMessages(threadId);
    } catch {
      threadMsgs = [];
    }
    for (const tm of threadMsgs) {
      const exists = db.prepare('SELECT id FROM messages WHERE gmail_message_id = ?').get(tm.gmailMessageId);
      if (exists) continue;
      const hasAtt = Array.isArray(tm.attachments) && tm.attachments.length > 0;
      const mInfo = db
        .prepare(
          `INSERT INTO messages
            (request_id, direction, author, subject, body, gmail_message_id, gmail_thread_id,
             approval_status, has_attachments)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          request.id,
          tm.direction,
          tm.from,
          tm.subject,
          tm.body || tm.snippet || '',
          tm.gmailMessageId,
          tm.gmailThreadId,
          tm.direction === 'outbound' ? 'sent' : null,
          hasAtt ? 1 : 0,
        );
      imported++;

      // Registra anexos (metadados; download sob demanda).
      for (const att of tm.attachments || []) {
        const dup = db
          .prepare('SELECT id FROM attachments WHERE gmail_message_id = ? AND filename = ?')
          .get(tm.gmailMessageId, att.filename);
        if (dup) continue;
        db.prepare(
          `INSERT INTO attachments
            (request_id, message_id, gmail_message_id, gmail_attachment_id, filename, mime_type, size_bytes)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).run(request.id, mInfo.lastInsertRowid, tm.gmailMessageId, att.attachmentId, att.filename, att.mimeType, att.size);
      }
    }

    // Atualiza o status com base na última mensagem da thread.
    recomputeStatus(request.id);
  }

  return { imported, processes };
}

/**
 * Recalcula o status do processo a partir das mensagens:
 * - última mensagem inbound (do solicitante) → 'replied' (aguardando o admin)
 * - última mensagem outbound (resposta do admin) → 'completed' (respondido)
 * Nunca marca como respondido só por rascunho — exige mensagem outbound real.
 */
export function recomputeStatus(requestId) {
  const last = db
    .prepare("SELECT direction FROM messages WHERE request_id = ? ORDER BY id DESC LIMIT 1")
    .get(requestId);
  if (!last) return;
  // 'completed' aqui = "Respondido" (admin enviou a última mensagem).
  const status = last.direction === 'outbound' ? 'completed' : 'replied';
  const convState = last.direction === 'outbound' ? 'resolved' : 'open';
  db.prepare(
    `UPDATE requests SET status = ?, conversation_state = ?, updated_at = datetime('now')
     WHERE id = ? AND status NOT IN ('concluido')`,
  ).run(status, convState, requestId);
}
