import { Router } from 'express';
import { db, getSettings, log } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// Never expose the Google client secret to the frontend. Return only whether it
// is set, plus the client id (not secret).
function sanitize(settings) {
  const { google_client_secret, ...rest } = settings;
  return {
    ...rest,
    google_client_secret_set: Boolean(google_client_secret),
  };
}

router.get('/', (req, res) => {
  res.json(sanitize(getSettings()));
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
  res.json(sanitize(getSettings()));
});

// Save Google OAuth credentials from the UI (desktop mode). Stored only in the
// local backend database; the secret is never returned to the client.
router.put('/google', (req, res) => {
  const { google_client_id, google_client_secret } = req.body || {};
  const current = getSettings();
  db.prepare(
    `UPDATE settings SET google_client_id = ?, google_client_secret = ?,
      updated_at = datetime('now') WHERE id = 1`,
  ).run(
    google_client_id === undefined ? current.google_client_id : (google_client_id || null),
    // Empty string means "keep current"; a new value replaces it.
    google_client_secret ? google_client_secret : current.google_client_secret,
  );
  log('info', 'gmail', 'Credenciais do Google atualizadas via interface.');
  res.json(sanitize(getSettings()));
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
