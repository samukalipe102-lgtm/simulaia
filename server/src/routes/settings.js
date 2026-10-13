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
  const {
    test_mode,
    authorized_recipient,
    auto_mode,
    auto_followup_approved,
    poll_interval_minutes,
  } = req.body || {};
  const current = getSettings();
  const bit = (v, cur) => (v === undefined ? cur : v ? 1 : 0);
  db.prepare(
    `UPDATE settings SET test_mode = ?, authorized_recipient = ?,
      auto_mode = ?, auto_followup_approved = ?, poll_interval_minutes = ?,
      updated_at = datetime('now') WHERE id = 1`,
  ).run(
    bit(test_mode, current.test_mode),
    authorized_recipient === undefined ? current.authorized_recipient : authorized_recipient,
    bit(auto_mode, current.auto_mode),
    bit(auto_followup_approved, current.auto_followup_approved),
    poll_interval_minutes === undefined
      ? current.poll_interval_minutes
      : Math.max(1, Number(poll_interval_minutes) || 2),
  );
  res.json(sanitize(getSettings()));
});

// Toggle the master auto mode on/off.
router.post('/auto-mode', (req, res) => {
  const { enabled } = req.body || {};
  db.prepare(
    `UPDATE settings SET auto_mode = ?, updated_at = datetime('now') WHERE id = 1`,
  ).run(enabled ? 1 : 0);
  log('info', 'automation', `Modo automático ${enabled ? 'ATIVADO' : 'desativado'}.`);
  res.json(sanitize(getSettings()));
});

// Explicitly authorize (or revoke) autonomous follow-up sending.
router.post('/approve-auto-followup', (req, res) => {
  const { approved } = req.body || {};
  db.prepare(
    `UPDATE settings SET auto_followup_approved = ?, updated_at = datetime('now') WHERE id = 1`,
  ).run(approved ? 1 : 0);
  log('warn', 'automation', `Envio automático de acompanhamentos ${approved ? 'AUTORIZADO' : 'revogado'}.`);
  res.json(sanitize(getSettings()));
});

/**
 * Single initial setup wizard. Applies ALL essential settings in one call,
 * seeds default fictitious profiles + enabled services from internal templates
 * (no manual registration), and creates/updates a default automation.
 * Does NOT connect Gmail or invent credentials — that stays with the real OAuth.
 */
router.post('/setup', (req, res) => {
  const b = req.body || {};
  const current = getSettings();

  // 1) Core settings
  const bit = (v, cur) => (v === undefined ? cur : v ? 1 : 0);
  db.prepare(
    `UPDATE settings SET
      authorized_recipient = ?,
      test_mode = ?,
      auto_mode = ?,
      auto_followup_approved = ?,
      poll_interval_minutes = ?,
      setup_completed = 1,
      updated_at = datetime('now')
     WHERE id = 1`,
  ).run(
    b.authorized_recipient ?? current.authorized_recipient,
    bit(b.test_mode, 1),
    bit(b.auto_mode, current.auto_mode),
    bit(b.auto_followup_approved, current.auto_followup_approved),
    Math.max(1, Number(b.poll_interval_minutes) || current.poll_interval_minutes || 2),
  );

  // 2) Seed default services (enabled) from templates, if none exist.
  const svcCount = db.prepare('SELECT COUNT(*) AS c FROM services').get().c;
  if (svcCount === 0) {
    const services = [
      ['Declaração de matrícula', 'declaracao', 'Comprovação de matrícula ativa.'],
      ['Declaração de frequência', 'declaracao', 'Comprovação de frequência.'],
      ['Histórico escolar', 'historico', 'Histórico com notas e disciplinas.'],
      ['Segunda via de histórico', 'historico', 'Reemissão de histórico.'],
      ['Segunda via de documento', 'documento', 'Reemissão de documento escolar.'],
      ['Esclarecimento sobre calendário', 'esclarecimento', 'Dúvidas sobre o calendário.'],
    ];
    const stmt = db.prepare('INSERT INTO services (name, category, description, enabled) VALUES (?, ?, ?, 1)');
    services.forEach((s) => stmt.run(...s));
  } else if (Array.isArray(b.enabled_categories) && b.enabled_categories.length) {
    // Enable only the chosen categories, disable the rest.
    db.prepare('UPDATE services SET enabled = 0').run();
    const inList = b.enabled_categories.map(() => '?').join(',');
    db.prepare(`UPDATE services SET enabled = 1 WHERE category IN (${inList})`).run(
      ...b.enabled_categories,
    );
  }

  // 3) Seed default fictitious profiles from templates, if none exist.
  const profCount = db.prepare('SELECT COUNT(*) AS c FROM profiles').get().c;
  if (profCount === 0) {
    const profiles = [
      ['Maria Fictícia', 'responsavel', 'Responsável simulado(a) para teste.'],
      ['João Simulado', 'responsavel', 'Responsável simulado(a) para teste.'],
      ['Prof. Teste', 'professor', 'Docente simulado(a) para teste.'],
      ['Coord. Exemplo', 'coordenador', 'Coordenação simulada para teste.'],
      ['Func. Demonstração', 'funcionario', 'Funcionário(a) simulado(a) para teste.'],
    ];
    const stmt = db.prepare('INSERT INTO profiles (name, role, context, fictitious, enabled) VALUES (?, ?, ?, 1, 1)');
    profiles.forEach((p) => stmt.run(...p));
  }

  // 4) Create or update a single default automation reflecting the rules.
  const existing = db.prepare("SELECT * FROM automations ORDER BY id LIMIT 1").get();
  const rules = {
    max_per_day: Number(b.max_per_day) || 5,
    interval_minutes: Number(b.interval_minutes) || 60,
    allowed_days: b.allowed_days || '1,2,3,4,5',
    start_hour: b.start_hour ?? 8,
    end_hour: b.end_hour ?? 18,
    duration_days: Number(b.duration_days) || 30,
    max_attempts: Number(b.max_attempts) || 3,
    auto_followup: bit(b.auto_followup, current.auto_followup_approved),
    max_followups_per_conversation: Number(b.max_followups_per_conversation) || 3,
  };
  if (existing) {
    db.prepare(
      `UPDATE automations SET max_per_day=?, interval_minutes=?, allowed_days=?,
        start_hour=?, end_hour=?, duration_days=?, max_attempts=?, auto_followup=?,
        max_followups_per_conversation=?, categories='', profile_ids='',
        require_approval=?, updated_at=datetime('now') WHERE id=?`,
    ).run(
      rules.max_per_day, rules.interval_minutes, rules.allowed_days, rules.start_hour,
      rules.end_hour, rules.duration_days, rules.max_attempts, rules.auto_followup,
      rules.max_followups_per_conversation, rules.auto_followup ? 0 : 1, existing.id,
    );
  } else {
    db.prepare(
      `INSERT INTO automations
        (name, status, max_per_day, interval_minutes, allowed_days, start_hour, end_hour,
         categories, profile_ids, duration_days, require_approval, max_attempts,
         auto_followup, max_followups_per_conversation)
       VALUES ('Automação principal', 'paused', ?, ?, ?, ?, ?, '', '', ?, ?, ?, ?, ?)`,
    ).run(
      rules.max_per_day, rules.interval_minutes, rules.allowed_days, rules.start_hour,
      rules.end_hour, rules.duration_days, rules.auto_followup ? 0 : 1, rules.max_attempts,
      rules.auto_followup, rules.max_followups_per_conversation,
    );
  }

  log('info', 'automation', 'Configuração inicial concluída (wizard).');
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
  res.json(sanitize(getSettings()));
});

router.post('/emergency-clear', (req, res) => {
  db.prepare(`UPDATE settings SET emergency_stop = 0, updated_at = datetime('now') WHERE id = 1`).run();
  log('info', 'automation', 'Parada de emergência liberada.');
  res.json(sanitize(getSettings()));
});

export default router;
