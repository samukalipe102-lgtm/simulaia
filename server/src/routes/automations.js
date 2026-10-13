import { Router } from 'express';
import { db, log } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { canSendNow } from '../services/automation.js';

const router = Router();
router.use(requireAuth);

const FIELDS = [
  'name',
  'max_per_day',
  'interval_minutes',
  'allowed_days',
  'start_hour',
  'end_hour',
  'categories',
  'profile_ids',
  'duration_days',
  'recipient',
  'require_approval',
  'max_attempts',
];

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM automations ORDER BY id DESC').all();
  // Attach a live "can send now" diagnostic.
  const enriched = rows.map((a) => ({ ...a, check: canSendNow(a) }));
  res.json(enriched);
});

router.get('/:id', (req, res) => {
  const a = db.prepare('SELECT * FROM automations WHERE id = ?').get(req.params.id);
  if (!a) return res.status(404).json({ error: 'Automação não encontrada.' });
  res.json({ ...a, check: canSendNow(a) });
});

router.post('/', (req, res) => {
  const b = req.body || {};
  if (!b.name) return res.status(400).json({ error: 'Nome é obrigatório.' });
  const info = db
    .prepare(
      `INSERT INTO automations
        (name, max_per_day, interval_minutes, allowed_days, start_hour, end_hour,
         categories, profile_ids, duration_days, recipient, require_approval, max_attempts, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'paused')`,
    )
    .run(
      b.name,
      b.max_per_day ?? 5,
      b.interval_minutes ?? 30,
      b.allowed_days ?? '1,2,3,4,5',
      b.start_hour ?? 8,
      b.end_hour ?? 18,
      b.categories ?? '',
      b.profile_ids ?? '',
      b.duration_days ?? 7,
      b.recipient ?? null,
      b.require_approval === false ? 0 : 1,
      b.max_attempts ?? 3,
    );
  res.status(201).json(db.prepare('SELECT * FROM automations WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM automations WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Automação não encontrada.' });
  const b = req.body || {};
  const updates = {};
  for (const f of FIELDS) {
    if (b[f] !== undefined) {
      updates[f] = f === 'require_approval' ? (b[f] ? 1 : 0) : b[f];
    }
  }
  const keys = Object.keys(updates);
  if (keys.length) {
    const set = keys.map((k) => `${k} = ?`).join(', ');
    db.prepare(`UPDATE automations SET ${set}, updated_at = datetime('now') WHERE id = ?`).run(
      ...keys.map((k) => updates[k]),
      req.params.id,
    );
  }
  res.json(db.prepare('SELECT * FROM automations WHERE id = ?').get(req.params.id));
});

function setStatus(id, status, startWindow = false) {
  const a = db.prepare('SELECT * FROM automations WHERE id = ?').get(id);
  if (!a) return null;
  let starts = a.starts_at;
  let ends = a.ends_at;
  if (status === 'active' && startWindow) {
    const now = new Date();
    starts = starts || now.toISOString();
    if (!ends) {
      ends = new Date(now.getTime() + a.duration_days * 86400000).toISOString();
    }
  }
  db.prepare(
    `UPDATE automations SET status = ?, starts_at = ?, ends_at = ?, updated_at = datetime('now') WHERE id = ?`,
  ).run(status, starts, ends, id);
  return db.prepare('SELECT * FROM automations WHERE id = ?').get(id);
}

router.post('/:id/activate', (req, res) => {
  const a = setStatus(req.params.id, 'active', true);
  if (!a) return res.status(404).json({ error: 'Automação não encontrada.' });
  log('info', 'automation', `Automação ativada: ${a.name}`, { automationId: a.id });
  res.json(a);
});

router.post('/:id/pause', (req, res) => {
  const a = setStatus(req.params.id, 'paused');
  if (!a) return res.status(404).json({ error: 'Automação não encontrada.' });
  log('info', 'automation', `Automação pausada: ${a.name}`, { automationId: a.id });
  res.json(a);
});

router.post('/:id/resume', (req, res) => {
  const a = setStatus(req.params.id, 'active');
  if (!a) return res.status(404).json({ error: 'Automação não encontrada.' });
  log('info', 'automation', `Automação retomada: ${a.name}`, { automationId: a.id });
  res.json(a);
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM automations WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
