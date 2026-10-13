import { Router } from 'express';
import { db, getSettings } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { getStatus as gmailStatus } from '../services/gmail.js';
import { getRuntime } from '../jobs/scheduler.js';
import { gmailConfigured } from '../config.js';

// Derive a single, human-friendly automation state for the dashboard badge.
function deriveAutomationState(settings, gmail) {
  if (settings.emergency_stop) return 'erro'; // treated as halted/attention
  if (!settings.setup_completed) return 'configuracao_pendente';
  if (!gmail.connected) return 'aguardando_gmail';
  if (!settings.auto_mode) return 'pausada';
  if (!settings.auto_followup_approved) return 'aguardando_autorizacao';
  return 'ativa';
}

const router = Router();
router.use(requireAuth);

// Dashboard summary: status counts, indicators, next run, recent failures.
router.get('/dashboard', (req, res) => {
  const statusRows = db
    .prepare('SELECT status, COUNT(*) AS c FROM requests GROUP BY status')
    .all();
  const statusCounts = {};
  statusRows.forEach((r) => (statusCounts[r.status] = r.c));

  const totals = {
    requests: db.prepare('SELECT COUNT(*) AS c FROM requests').get().c,
    services: db.prepare('SELECT COUNT(*) AS c FROM services WHERE enabled = 1').get().c,
    profiles: db.prepare('SELECT COUNT(*) AS c FROM profiles WHERE enabled = 1').get().c,
    automationsActive: db
      .prepare("SELECT COUNT(*) AS c FROM automations WHERE status = 'active'").get().c,
  };

  const lastExecutions = db
    .prepare(
      `SELECT id, public_id, subject, status, sent_at, updated_at
       FROM requests ORDER BY updated_at DESC LIMIT 8`,
    )
    .all();

  const recentFailures = db
    .prepare(
      `SELECT id, level, category, message, created_at FROM activity_log
       WHERE level = 'error' ORDER BY id DESC LIMIT 8`,
    )
    .all();

  const nextRun = db
    .prepare(
      `SELECT name, next_run_at FROM automations
       WHERE status = 'active' AND next_run_at IS NOT NULL
       ORDER BY next_run_at ASC LIMIT 1`,
    )
    .get();

  const byCategory = db
    .prepare('SELECT category, COUNT(*) AS c FROM requests GROUP BY category')
    .all();

  // Conversation-level counts for the automation dashboard.
  const convRows = db
    .prepare('SELECT conversation_state, COUNT(*) AS c FROM requests GROUP BY conversation_state')
    .all();
  const conversationStates = {};
  convRows.forEach((r) => (conversationStates[r.conversation_state] = r.c));

  const conversations = {
    inProgress: db
      .prepare(
        `SELECT COUNT(*) AS c FROM requests
         WHERE status IN ('awaiting_reply','replied','awaiting_approval')`,
      )
      .get().c,
    repliesIdentified: db
      .prepare(`SELECT COUNT(*) AS c FROM messages WHERE direction = 'inbound'`)
      .get().c,
    completed: db.prepare("SELECT COUNT(*) AS c FROM requests WHERE status = 'completed'").get().c,
    awaitingApproval: db
      .prepare("SELECT COUNT(*) AS c FROM requests WHERE status = 'awaiting_approval'").get().c,
    needsAdmin: db
      .prepare("SELECT COUNT(*) AS c FROM requests WHERE conversation_state = 'needs_admin'").get().c,
    errors: db.prepare("SELECT COUNT(*) AS c FROM requests WHERE status = 'error'").get().c,
  };

  const settings = getSettings();
  const gmail = { ...gmailStatus(), configured: gmailConfigured(settings) };
  const runtime = getRuntime();

  res.json({
    statusCounts,
    totals,
    conversations,
    conversationStates,
    lastExecutions,
    recentFailures,
    nextRun: nextRun || null,
    byCategory,
    gmail,
    runtime,
    automationState: deriveAutomationState(settings, gmail),
    settings: (() => {
      const { google_client_secret, ...rest } = settings;
      return { ...rest, google_client_secret_set: Boolean(google_client_secret) };
    })(),
  });
});

// Activity log (reports).
router.get('/activity', (req, res) => {
  const { level, category } = req.query;
  let sql = 'SELECT * FROM activity_log';
  const where = [];
  const params = [];
  if (level) {
    where.push('level = ?');
    params.push(level);
  }
  if (category) {
    where.push('category = ?');
    params.push(category);
  }
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY id DESC LIMIT 300';
  res.json(db.prepare(sql).all(...params));
});

export default router;
