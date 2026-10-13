// Fila de ENVIOS ADMINISTRATIVOS. Consome admin_queue respeitando:
// limite diário, intervalo em minutos (no backend), horários/dias permitidos,
// tentativas controladas e prevenção de duplicidade. NÃO responde solicitações.
import { db, log, getSettings } from '../db/index.js';
import * as gmail from './gmail.js';

export function getConfig() {
  return db.prepare('SELECT * FROM admin_automation WHERE id = 1').get();
}

export function updateConfig(patch = {}) {
  const cur = getConfig();
  const n = (k, def) => (patch[k] === undefined ? cur[k] : patch[k]);
  db.prepare(
    `UPDATE admin_automation SET
      daily_limit=?, interval_minutes=?, start_hour=?, end_hour=?, allowed_days=?,
      updated_at=datetime('now') WHERE id=1`,
  ).run(
    Math.max(0, Number(n('daily_limit')) || 0),
    Math.max(1, Number(n('interval_minutes')) || 1),
    Math.min(23, Math.max(0, Number(n('start_hour')))),
    Math.min(24, Math.max(0, Number(n('end_hour')))),
    patch.allowed_days === undefined ? cur.allowed_days : String(patch.allowed_days),
  );
  return getConfig();
}

export function setStatus(status) {
  db.prepare(`UPDATE admin_automation SET status=?, updated_at=datetime('now') WHERE id=1`).run(status);
  log('info', 'admin_queue', `Automação administrativa: ${status}.`);
  return getConfig();
}

function rolloverDaily(cfg) {
  const today = new Date().toISOString().slice(0, 10);
  if (cfg.sent_today_date !== today) {
    db.prepare('UPDATE admin_automation SET sent_today=0, sent_today_date=? WHERE id=1').run(today);
    cfg.sent_today = 0;
    cfg.sent_today_date = today;
  }
  return cfg;
}

/** Enfileira um envio administrativo (idempotente por dedupe_key). */
export function enqueue({ recipient, subject, body, dedupeKey, maxAttempts = 3 }) {
  const settings = getSettings();
  const to = recipient || settings.authorized_recipient;
  if (!to) throw new Error('Destinatário administrativo não definido.');
  const key = dedupeKey || `${to}|${subject}|${new Date().toISOString().slice(0, 13)}`;
  const existing = db.prepare('SELECT id, status FROM admin_queue WHERE dedupe_key = ?').get(key);
  if (existing) return { id: existing.id, duplicated: true };
  const info = db
    .prepare(
      `INSERT INTO admin_queue (recipient, subject, body, dedupe_key, max_attempts)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(to, subject, body, key, maxAttempts);
  log('info', 'admin_queue', `E-mail administrativo enfileirado para ${to}.`);
  return { id: info.lastInsertRowid, duplicated: false };
}

/** Retorna {ok, reason} se a janela/limite/intervalo permitem enviar agora. */
export function canSendNow(cfg, now = new Date()) {
  const settings = getSettings();
  if (settings.emergency_stop) return { ok: false, reason: 'emergency_stop' };
  if (cfg.status !== 'active') return { ok: false, reason: 'paused' };
  const days = (cfg.allowed_days || '').split(',').map((s) => Number(s.trim())).filter((n) => !Number.isNaN(n));
  if (days.length && !days.includes(now.getDay())) return { ok: false, reason: 'day_not_allowed' };
  const h = now.getHours();
  if (h < cfg.start_hour || h >= cfg.end_hour) return { ok: false, reason: 'hour_not_allowed' };
  if (cfg.daily_limit > 0 && cfg.sent_today >= cfg.daily_limit) return { ok: false, reason: 'daily_limit_reached' };
  if (cfg.last_sent_at) {
    const elapsedMin = (now - new Date(cfg.last_sent_at)) / 60000;
    if (elapsedMin < cfg.interval_minutes) return { ok: false, reason: 'interval_not_elapsed' };
  }
  return { ok: true };
}

/**
 * Processa NO MÁXIMO UM envio da fila por chamada (respeita o intervalo: um
 * envio por tick, nunca todos de uma vez). Chamado pelo agendador a cada minuto.
 */
export async function processQueueStep() {
  let cfg = rolloverDaily(getConfig());
  const gate = canSendNow(cfg);
  if (!gate.ok) return { skipped: true, reason: gate.reason };

  const item = db
    .prepare(
      `SELECT * FROM admin_queue
       WHERE status = 'pending'
       AND (scheduled_after IS NULL OR datetime(scheduled_after) <= datetime('now'))
       ORDER BY id ASC LIMIT 1`,
    )
    .get();
  if (!item) return { skipped: true, reason: 'empty_queue' };

  db.prepare(`UPDATE admin_queue SET status='processing', attempts=attempts+1, updated_at=datetime('now') WHERE id=?`).run(item.id);

  try {
    const sent = await gmail.sendAdminEmail({ to: item.recipient, subject: item.subject, body: item.body });
    db.prepare(
      `UPDATE admin_queue SET status='sent', gmail_message_id=?, sent_at=datetime('now'),
        last_error=NULL, updated_at=datetime('now') WHERE id=?`,
    ).run(sent.messageId, item.id);
    db.prepare(
      `UPDATE admin_automation SET sent_today=sent_today+1, sent_today_date=?, last_sent_at=datetime('now'),
        updated_at=datetime('now') WHERE id=1`,
    ).run(new Date().toISOString().slice(0, 10));
    log('info', 'admin_queue', `E-mail administrativo enviado para ${item.recipient}.`);
    return { sent: true, id: item.id };
  } catch (err) {
    const failed = item.attempts >= item.max_attempts;
    db.prepare(
      `UPDATE admin_queue SET status=?, last_error=?, updated_at=datetime('now') WHERE id=?`,
    ).run(failed ? 'failed' : 'pending', err.message, item.id);
    log('error', 'admin_queue', `Falha no envio administrativo (${item.recipient}): ${err.message}`);
    return { error: err.message, id: item.id, willRetry: !failed };
  }
}

export function queueStats() {
  const rows = db.prepare('SELECT status, COUNT(*) AS c FROM admin_queue GROUP BY status').all();
  const counts = { pending: 0, processing: 0, sent: 0, failed: 0 };
  rows.forEach((r) => (counts[r.status] = r.c));
  const cfg = rolloverDaily(getConfig());
  return {
    counts,
    daily_limit: cfg.daily_limit,
    sent_today: cfg.sent_today,
    remaining: cfg.daily_limit > 0 ? Math.max(0, cfg.daily_limit - cfg.sent_today) : null,
    interval_minutes: cfg.interval_minutes,
    status: cfg.status,
    last_sent_at: cfg.last_sent_at,
  };
}

export function listQueue(limit = 100) {
  return db.prepare('SELECT * FROM admin_queue ORDER BY id DESC LIMIT ?').all(limit);
}
