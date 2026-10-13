import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

const CATEGORIES = ['declaracao', 'historico', 'documento', 'esclarecimento'];

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM services ORDER BY id DESC').all());
});

router.post('/', (req, res) => {
  const { name, category, description, enabled = true } = req.body || {};
  if (!name || !CATEGORIES.includes(category)) {
    return res.status(400).json({ error: 'Nome e categoria válida são obrigatórios.' });
  }
  const info = db
    .prepare('INSERT INTO services (name, category, description, enabled) VALUES (?, ?, ?, ?)')
    .run(name, category, description || '', enabled ? 1 : 0);
  res.status(201).json(db.prepare('SELECT * FROM services WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const { name, category, description, enabled } = req.body || {};
  const existing = db.prepare('SELECT * FROM services WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Serviço não encontrado.' });
  db.prepare(
    'UPDATE services SET name = ?, category = ?, description = ?, enabled = ? WHERE id = ?',
  ).run(
    name ?? existing.name,
    category ?? existing.category,
    description ?? existing.description,
    enabled === undefined ? existing.enabled : enabled ? 1 : 0,
    req.params.id,
  );
  res.json(db.prepare('SELECT * FROM services WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM services WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
