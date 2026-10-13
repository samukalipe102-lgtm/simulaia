// Core service: generate simulated requests, send them, detect replies, and
// draft follow-ups (which require approval before sending).

import { db, log, getSettings } from '../db/index.js';
import {
  generateRequestContent,
  generateWithLLM,
  generateFollowUp,
  classifyReply,
} from '../ai/generator.js';
import * as gmail from './gmail.js';
import { applySignature } from './edugestao.js';

function nextPublicId() {
  const year = new Date().getFullYear();
  const row = db
    .prepare(
      `SELECT COUNT(*) AS c FROM requests WHERE public_id LIKE ?`,
    )
    .get(`SIM-${year}-%`);
  const seq = String((row?.c || 0) + 1).padStart(4, '0');
  return `SIM-${year}-${seq}`;
}

function pickEnabled(table, ids) {
  let rows;
  if (ids && ids.length) {
    const placeholders = ids.map(() => '?').join(',');
    rows = db
      .prepare(`SELECT * FROM ${table} WHERE enabled = 1 AND id IN (${placeholders})`)
      .all(...ids);
  } else {
    rows = db.prepare(`SELECT * FROM ${table} WHERE enabled = 1`).all();
  }
  return rows;
}

/**
 * Generate (but do not send) a simulated request.
 * Uses only enabled services and enabled fictitious profiles.
 */
export async function createSimulatedRequest(opts = {}) {
  const { categories = [], profileIds = [], automationId = null, recipient = null } = opts;

  let services = db.prepare('SELECT * FROM services WHERE enabled = 1').all();
  if (categories.length) {
    services = services.filter((s) => categories.includes(s.category));
  }
  if (!services.length) {
    throw new Error('Nenhum serviço habilitado disponível para gerar solicitação.');
  }
  const profiles = pickEnabled('profiles', profileIds);
  if (!profiles.length) {
    throw new Error('Nenhum perfil fictício habilitado disponível.');
  }

  const service = services[Math.floor(Math.random() * services.length)];
  const profile = profiles[Math.floor(Math.random() * profiles.length)];

  const llm = await generateWithLLM({ service, profile }).catch(() => null);
  const content = llm || generateRequestContent({ service, profile });

  const settings = getSettings();
  const dest = recipient || settings.authorized_recipient || null;
  const publicId = nextPublicId();

  const info = db
    .prepare(
      `INSERT INTO requests
        (public_id, subject, body, category, service_id, profile_id,
         profile_name, profile_role, recipient, status, fictitious, automation_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'generated', 1, ?)`,
    )
    .run(
      publicId,
      content.subject,
      content.body,
      content.category,
      service.id,
      profile.id,
      profile.name,
      profile.role,
      dest,
      automationId,
    );

  const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(info.lastInsertRowid);
  log('info', 'ai', `Solicitação fictícia gerada: ${publicId}`, {
    requestId: request.id,
    automationId,
  });
  return request;
}

/**
 * Duplicate prevention: avoid sending the same subject to the same recipient
 * within the last few minutes.
 */
export function isDuplicate(subject, recipient, windowMinutes = 10) {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS c FROM requests
       WHERE subject = ? AND recipient = ?
       AND sent_at IS NOT NULL
       AND datetime(sent_at) > datetime('now', ?)`,
    )
    .get(subject, recipient, `-${windowMinutes} minutes`);
  return (row?.c || 0) > 0;
}

/**
 * Send a generated request's initial email through Gmail.
 * Enforces test-mode recipient restriction and duplicate prevention.
 */
export async function sendRequest(requestId) {
  const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(requestId);
  if (!request) throw new Error('Solicitação não encontrada.');

  const settings = getSettings();
  let recipient = request.recipient || settings.authorized_recipient;
  if (!recipient) {
    throw new Error('Nenhum destinatário autorizado configurado.');
  }

  // Test-mode safety: force the single authorized recipient.
  if (settings.test_mode) {
    if (!settings.authorized_recipient) {
      throw new Error('Modo de teste ativo mas nenhum destinatário autorizado definido.');
    }
    recipient = settings.authorized_recipient;
  }

  if (isDuplicate(request.subject, recipient)) {
    log('warn', 'gmail', `Envio duplicado bloqueado: ${request.public_id}`, {
      requestId: request.id,
    });
    throw new Error('Envio bloqueado por prevenção de duplicidade.');
  }

  db.prepare(
    `UPDATE requests SET status = 'sending', attempts = attempts + 1, recipient = ?,
      updated_at = datetime('now') WHERE id = ?`,
  ).run(recipient, request.id);

  // Aplica a assinatura institucional padrão (sem duplicar).
  const bodyWithSignature = applySignature(request.body);

  try {
    const { messageId, threadId } = await gmail.sendEmail({
      to: recipient,
      subject: request.subject,
      body: bodyWithSignature,
    });

    db.prepare(
      `UPDATE requests SET status = 'awaiting_reply', sent_at = datetime('now'),
        gmail_message_id = ?, gmail_thread_id = ?, last_error = NULL,
        updated_at = datetime('now') WHERE id = ?`,
    ).run(messageId, threadId, request.id);

    db.prepare(
      `INSERT INTO messages
        (request_id, direction, author, subject, body, gmail_message_id, gmail_thread_id, approval_status)
       VALUES (?, 'outbound', ?, ?, ?, ?, ?, 'sent')`,
    ).run(request.id, request.profile_name, request.subject, bodyWithSignature, messageId, threadId);

    log('info', 'gmail', `E-mail enviado (${request.public_id}) thread=${threadId}`, {
      requestId: request.id,
    });
    return db.prepare('SELECT * FROM requests WHERE id = ?').get(request.id);
  } catch (err) {
    db.prepare(
      `UPDATE requests SET status = 'error', last_error = ?, updated_at = datetime('now')
       WHERE id = ?`,
    ).run(err.message, request.id);
    log('error', 'gmail', `Falha no envio (${request.public_id}): ${err.message}`, {
      requestId: request.id,
    });
    throw err;
  }
}

/**
 * Poll Gmail threads of sent requests awaiting replies, import new inbound
 * messages, and flag requests as replied.
 */
export async function syncReplies() {
  const pending = db
    .prepare(
      `SELECT * FROM requests
       WHERE gmail_thread_id IS NOT NULL
       AND status IN ('awaiting_reply','replied','awaiting_approval')`,
    )
    .all();

  let imported = 0;
  for (const request of pending) {
    try {
      const messages = await gmail.getThreadMessages(request.gmail_thread_id);
      for (const m of messages) {
        if (m.direction !== 'inbound') continue;
        const exists = db
          .prepare('SELECT id FROM messages WHERE gmail_message_id = ?')
          .get(m.gmailMessageId);
        if (exists) continue;

        const replyText = m.body || m.snippet || '';

        // Classify the reply in context (LLM if configured, else heuristic).
        let classification = null;
        try {
          const history = db
            .prepare(
              `SELECT direction, body FROM messages WHERE request_id = ? ORDER BY id ASC`,
            )
            .all(request.id)
            .map((r) => ({ direction: r.direction, body: (r.body || '').slice(0, 400) }));
          const result = await classifyReply({ request, replyText, history });
          classification = result.classification;
        } catch {
          classification = null;
        }

        db.prepare(
          `INSERT INTO messages
            (request_id, direction, author, subject, body, gmail_message_id, gmail_thread_id, classification)
           VALUES (?, 'inbound', ?, ?, ?, ?, ?, ?)`,
        ).run(
          request.id,
          m.from,
          m.subject,
          replyText,
          m.gmailMessageId,
          m.gmailThreadId,
          classification,
        );
        imported++;

        // Mark as replied and record the latest classification. The conversation
        // engine (processConversations) decides the next step.
        db.prepare(
          `UPDATE requests SET
            status = CASE WHEN status = 'awaiting_reply' THEN 'replied' ELSE status END,
            last_classification = ?, updated_at = datetime('now')
           WHERE id = ?`,
        ).run(classification, request.id);

        log('info', 'gmail', `Resposta recebida (${request.public_id}) → ${classification || 'sem classificação'}`, {
          requestId: request.id,
        });
      }
    } catch (err) {
      log('error', 'gmail', `Erro ao sincronizar thread (${request.public_id}): ${err.message}`, {
        requestId: request.id,
      });
    }
  }
  return { imported };
}

/**
 * Generate a follow-up draft for a replied request. The draft is stored with
 * approval_status = 'pending' and the request moves to 'awaiting_approval'.
 * NOTHING is sent here.
 */
export function draftFollowUp(requestId) {
  const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(requestId);
  if (!request) throw new Error('Solicitação não encontrada.');

  const lastInbound = db
    .prepare(
      `SELECT * FROM messages WHERE request_id = ? AND direction = 'inbound'
       ORDER BY id DESC LIMIT 1`,
    )
    .get(requestId);

  const draft = generateFollowUp({ request, lastInbound });

  const info = db
    .prepare(
      `INSERT INTO messages
        (request_id, direction, author, subject, body, approval_status, is_followup)
       VALUES (?, 'outbound', ?, ?, ?, 'pending', 1)`,
    )
    .run(requestId, request.profile_name, draft.subject, draft.body);

  db.prepare(
    `UPDATE requests SET status = 'awaiting_approval', updated_at = datetime('now') WHERE id = ?`,
  ).run(requestId);

  log('info', 'ai', `Acompanhamento gerado aguardando aprovação (${request.public_id})`, {
    requestId,
  });
  return db.prepare('SELECT * FROM messages WHERE id = ?').get(info.lastInsertRowid);
}

// Internal: actually send a pending follow-up message in the correct thread.
// Shared by manual approval and the autonomous engine.
async function sendFollowUpMessage(msg, request) {
  const settings = getSettings();
  let recipient = request.recipient || settings.authorized_recipient;
  if (settings.test_mode) recipient = settings.authorized_recipient; // safety
  if (!recipient) throw new Error('Nenhum destinatário autorizado configurado.');

  const bodyWithSignature = applySignature(msg.body);
  const sent = await gmail.sendEmail({
    to: recipient,
    subject: msg.subject,
    body: bodyWithSignature,
    threadId: request.gmail_thread_id,
    inReplyTo: request.gmail_message_id,
    references: request.gmail_message_id,
  });

  db.prepare(
    `UPDATE messages SET approval_status = 'approved', body = ?, gmail_message_id = ?,
      gmail_thread_id = ? WHERE id = ?`,
  ).run(bodyWithSignature, sent.messageId, sent.threadId, msg.id);

  // One more follow-up sent; conversation is awaiting the next reply.
  db.prepare(
    `UPDATE requests SET status = 'awaiting_reply', conversation_state = 'open',
      followup_count = followup_count + 1, updated_at = datetime('now') WHERE id = ?`,
  ).run(request.id);

  return sent;
}

/** Approve a pending follow-up and send it in the correct Gmail thread. */
export async function approveAndSendFollowUp(messageId) {
  const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId);
  if (!msg) throw new Error('Mensagem não encontrada.');
  if (msg.approval_status !== 'pending') {
    throw new Error('Mensagem não está pendente de aprovação.');
  }
  const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(msg.request_id);
  const sent = await sendFollowUpMessage(msg, request);
  log('info', 'gmail', `Acompanhamento aprovado e enviado (${request.public_id})`, {
    requestId: request.id,
  });
  return sent;
}

export function rejectFollowUp(messageId) {
  const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId);
  if (!msg) throw new Error('Mensagem não encontrada.');
  db.prepare(`UPDATE messages SET approval_status = 'rejected' WHERE id = ?`).run(messageId);
  db.prepare(
    `UPDATE requests SET status = 'replied', updated_at = datetime('now') WHERE id = ?`,
  ).run(msg.request_id);
  return { ok: true };
}

// Map an AI reply classification to a conversation state.
function stateForClassification(c) {
  switch (c) {
    case 'resolved': return 'resolved';
    case 'closed': return 'closed';
    case 'awaiting_info': return 'awaiting_info';
    case 'needs_admin': return 'needs_admin';
    case 'needs_followup':
    default: return 'needs_followup';
  }
}

/**
 * Autonomous conversation engine. For every request that received a reply
 * ('replied'), decide the next step based on the AI classification and the
 * configured rules. Runs on the server scheduler — no UI interaction required.
 *
 * Behavior:
 *  - resolved / closed  → mark the conversation finished (status 'completed').
 *  - needs_admin        → leave for manual review ('awaiting_approval').
 *  - awaiting_info / needs_followup:
 *      · if auto-follow-up is approved AND within the per-conversation cap AND
 *        the automation allows it → generate and SEND the follow-up automatically.
 *      · otherwise → generate a DRAFT and leave it 'awaiting_approval'.
 *  - follow-up cap reached → close the conversation ('completed').
 *
 * Respects emergency stop. Never sends outside the authorized recipient.
 */
export async function processConversations() {
  const settings = getSettings();
  if (settings.emergency_stop) return { processed: 0, reason: 'emergency_stop' };

  const replied = db
    .prepare(`SELECT * FROM requests WHERE status = 'replied'`)
    .all();

  let processed = 0;
  let autoSent = 0;
  let drafted = 0;
  let closed = 0;

  for (const request of replied) {
    const lastInbound = db
      .prepare(
        `SELECT * FROM messages WHERE request_id = ? AND direction = 'inbound'
         ORDER BY id DESC LIMIT 1`,
      )
      .get(request.id);
    if (!lastInbound) continue;

    const classification = lastInbound.classification || request.last_classification || 'needs_followup';
    const state = stateForClassification(classification);
    processed++;

    // Terminal classifications: finish the conversation, no new message.
    if (classification === 'resolved' || classification === 'closed') {
      db.prepare(
        `UPDATE requests SET status = 'completed', conversation_state = ?,
          updated_at = datetime('now') WHERE id = ?`,
      ).run(state, request.id);
      log('info', 'ai', `Conversa encerrada automaticamente (${request.public_id}): ${classification}`, {
        requestId: request.id,
      });
      closed++;
      continue;
    }

    // Ambiguous/sensitive → human intervention.
    if (classification === 'needs_admin') {
      db.prepare(
        `UPDATE requests SET conversation_state = 'needs_admin', updated_at = datetime('now')
         WHERE id = ?`,
      ).run(request.id);
      log('warn', 'ai', `Conversa requer intervenção administrativa (${request.public_id})`, {
        requestId: request.id,
      });
      continue;
    }

    // Follow-up cap reached → close.
    if (request.followup_count >= request.max_followups) {
      db.prepare(
        `UPDATE requests SET status = 'completed', conversation_state = 'closed',
          updated_at = datetime('now') WHERE id = ?`,
      ).run(request.id);
      log('info', 'ai', `Limite de acompanhamentos atingido, conversa encerrada (${request.public_id})`, {
        requestId: request.id,
      });
      closed++;
      continue;
    }

    // Build a follow-up draft aware of the classification.
    const draft = generateFollowUp({ request, lastInbound, classification });

    // Does the owning automation permit autonomous follow-up?
    let automationAllows = true;
    if (request.automation_id) {
      const auto = db.prepare('SELECT * FROM automations WHERE id = ?').get(request.automation_id);
      if (auto) {
        automationAllows = Boolean(auto.auto_followup);
        if (request.followup_count >= auto.max_followups_per_conversation) {
          automationAllows = false;
        }
      }
    }

    const canAutoSend =
      Boolean(settings.auto_mode) &&
      Boolean(settings.auto_followup_approved) &&
      automationAllows;

    const info = db
      .prepare(
        `INSERT INTO messages
          (request_id, direction, author, subject, body, approval_status, is_followup)
         VALUES (?, 'outbound', ?, ?, ?, 'pending', 1)`,
      )
      .run(request.id, request.profile_name, draft.subject, draft.body);
    const draftMsg = db.prepare('SELECT * FROM messages WHERE id = ?').get(info.lastInsertRowid);

    if (canAutoSend) {
      try {
        await sendFollowUpMessage(draftMsg, request);
        db.prepare(
          `UPDATE requests SET conversation_state = ? WHERE id = ?`,
        ).run(state, request.id);
        log('info', 'automation', `Acompanhamento enviado automaticamente (${request.public_id})`, {
          requestId: request.id,
        });
        autoSent++;
      } catch (err) {
        db.prepare(
          `UPDATE requests SET status = 'error', last_error = ?, updated_at = datetime('now')
           WHERE id = ?`,
        ).run(err.message, request.id);
        log('error', 'automation', `Falha ao enviar acompanhamento automático (${request.public_id}): ${err.message}`, {
          requestId: request.id,
        });
      }
    } else {
      // Needs manual approval (auto-send not authorized or not allowed).
      db.prepare(
        `UPDATE requests SET status = 'awaiting_approval', conversation_state = ?,
          updated_at = datetime('now') WHERE id = ?`,
      ).run(state, request.id);
      log('info', 'ai', `Acompanhamento gerado aguardando aprovação (${request.public_id})`, {
        requestId: request.id,
      });
      drafted++;
    }
  }

  return { processed, autoSent, drafted, closed };
}
