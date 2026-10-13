import { Router } from 'express';
import { db, getSettings, log } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import {
  importStudents,
  listStudents,
  studentsCount,
  seedProcesses,
  listProcesses,
  seedSignatures,
  listSignatures,
} from '../services/edugestao.js';

const router = Router();
router.use(requireAuth);

// --- Alunos e responsáveis ---
router.get('/students', (req, res) => {
  res.json({ ...studentsCount(), items: listStudents() });
});

// Importação idempotente dos 61 pares (ou dos pares enviados no corpo).
router.post('/students/import', (req, res) => {
  const pairs = Array.isArray(req.body?.pairs) ? req.body.pairs : undefined;
  const summary = importStudents(pairs);
  res.json(summary);
});

// --- Processos escolares ---
router.get('/processes', (req, res) => {
  res.json(listProcesses());
});
router.post('/processes/seed', (req, res) => {
  res.json(seedProcesses());
});
router.put('/processes/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM processes WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Processo não encontrado.' });
  const b = req.body || {};
  db.prepare(
    `UPDATE processes SET name=?, category=?, description=?, requirements=?, steps=?,
      responsible_sector=?, sla_days=?, response_template=?, completion_criteria=?, enabled=?
     WHERE id=?`,
  ).run(
    b.name ?? existing.name,
    b.category ?? existing.category,
    b.description ?? existing.description,
    b.requirements ?? existing.requirements,
    b.steps ?? existing.steps,
    b.responsible_sector ?? existing.responsible_sector,
    b.sla_days ?? existing.sla_days,
    b.response_template ?? existing.response_template,
    b.completion_criteria ?? existing.completion_criteria,
    b.enabled === undefined ? existing.enabled : b.enabled ? 1 : 0,
    req.params.id,
  );
  res.json(db.prepare('SELECT * FROM processes WHERE id = ?').get(req.params.id));
});

// --- Assinaturas institucionais ---
router.get('/signatures', (req, res) => {
  res.json(listSignatures());
});
router.post('/signatures/seed', (req, res) => {
  res.json(seedSignatures());
});
router.put('/signatures/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM signatures WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Assinatura não encontrada.' });
  const b = req.body || {};
  // Garante um único padrão.
  if (b.is_default) {
    db.prepare('UPDATE signatures SET is_default = 0').run();
  }
  db.prepare(
    `UPDATE signatures SET display_name=?, body=?, is_default=?, enabled=? WHERE id=?`,
  ).run(
    b.display_name ?? existing.display_name,
    b.body ?? existing.body,
    b.is_default ? 1 : existing.is_default,
    b.enabled === undefined ? existing.enabled : b.enabled ? 1 : 0,
    req.params.id,
  );
  res.json(db.prepare('SELECT * FROM signatures WHERE id = ?').get(req.params.id));
});

// --- Identidade institucional ---
router.get('/institution', (req, res) => {
  const s = getSettings();
  res.json({
    institution_name: s.institution_name,
    institution_email: s.institution_email,
    default_sector: s.default_sector,
  });
});
router.put('/institution', (req, res) => {
  const s = getSettings();
  const b = req.body || {};
  db.prepare(
    `UPDATE settings SET institution_name=?, institution_email=?, default_sector=?,
      updated_at=datetime('now') WHERE id=1`,
  ).run(
    b.institution_name ?? s.institution_name,
    b.institution_email ?? s.institution_email,
    b.default_sector ?? s.default_sector,
  );
  log('info', 'edugestao', 'Identidade institucional atualizada.');
  const n = getSettings();
  res.json({ institution_name: n.institution_name, institution_email: n.institution_email, default_sector: n.default_sector });
});

export default router;
