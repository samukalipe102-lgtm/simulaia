import { Router } from 'express';
import { db, getSettings } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { getStatus as gmailStatus } from '../services/gmail.js';
import { gmailConfigured } from '../config.js';

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

  res.json({
    statusCounts,
    totals,
    lastExecutions,
    recentFailures,
    nextRun: nextRun || null,
    byCategory,
    gmail: { ...gmailStatus(), configured: gmailConfigured(getSettings()) },
    settings: (() => {
      const { google_client_secret, ...rest } = getSettings();
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
