import { Router } from 'express';
import { db, getSettings, log } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  res.json(getSettings());
});

router.put('/', (req, res) => {
  const { test_mode, authorized_recipient } = req.body || {};
  const current = getSettings();
  db.prepare(
    `UPDATE settings SET test_mode = ?, authorized_recipient = ?, updated_at = datetime('now') WHERE id = 1`,
  ).run(
    test_mode === undefined ? current.test_mode : test_mode ? 1 : 0,
    authorized_recipient === undefined ? current.authorized_recipient : authorized_recipient,
  );
  res.json(getSettings());
});

// Emergency stop: halt ALL automations immediately.
router.post('/emergency-stop', (req, res) => {
  db.prepare(`UPDATE settings SET emergency_stop = 1, updated_at = datetime('now') WHERE id = 1`).run();
  db.prepare(`UPDATE automations SET status = 'paused' WHERE status = 'active'`).run();
  log('warn', 'automation', 'BOTÃO DE EMERGÊNCIA acionado: todas as automações interrompidas.');
  res.json(getSettings());
});

router.post('/emergency-clear', (req, res) => {
  db.prepare(`UPDATE settings SET emergency_stop = 0, updated_at = datetime('now') WHERE id = 1`).run();
  log('info', 'automation', 'Parada de emergência liberada.');
  res.json(getSettings());
});

export default router;
