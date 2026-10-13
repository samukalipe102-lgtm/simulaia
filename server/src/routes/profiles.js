import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

const ROLES = ['responsavel', 'professor', 'coordenador', 'funcionario'];

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM profiles ORDER BY id DESC').all());
});

router.post('/', (req, res) => {
  const { name, role, context, enabled = true } = req.body || {};
  if (!name || !ROLES.includes(role)) {
    return res.status(400).json({ error: 'Nome e papel válido são obrigatórios.' });
  }
  // Always fictitious.
  const info = db
    .prepare('INSERT INTO profiles (name, role, context, fictitious, enabled) VALUES (?, ?, ?, 1, ?)')
    .run(name, role, context || '', enabled ? 1 : 0);
  res.status(201).json(db.prepare('SELECT * FROM profiles WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const { name, role, context, enabled } = req.body || {};
  const existing = db.prepare('SELECT * FROM profiles WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Perfil não encontrado.' });
  db.prepare(
    'UPDATE profiles SET name = ?, role = ?, context = ?, enabled = ? WHERE id = ?',
  ).run(
    name ?? existing.name,
    role ?? existing.role,
    context ?? existing.context,
    enabled === undefined ? existing.enabled : enabled ? 1 : 0,
    req.params.id,
  );
  res.json(db.prepare('SELECT * FROM profiles WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM profiles WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
