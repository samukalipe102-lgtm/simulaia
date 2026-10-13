import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import {
  createSimulatedRequest,
  sendRequest,
  syncReplies,
  draftFollowUp,
  approveAndSendFollowUp,
  rejectFollowUp,
  processConversations,
} from '../services/requests.js';

const router = Router();
router.use(requireAuth);

// List with optional status filter.
router.get('/', (req, res) => {
  const { status, q } = req.query;
  let sql = 'SELECT * FROM requests';
  const where = [];
  const params = [];
  if (status) {
    where.push('status = ?');
    params.push(status);
  }
  if (q) {
    where.push('(subject LIKE ? OR public_id LIKE ? OR profile_name LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY id DESC LIMIT 500';
  res.json(db.prepare(sql).all(...params));
});

// Status counts for dashboard.
router.get('/stats', (req, res) => {
  const rows = db.prepare('SELECT status, COUNT(*) AS c FROM requests GROUP BY status').all();
  const counts = {};
  rows.forEach((r) => (counts[r.status] = r.c));
  res.json(counts);
});

// Detail with chronological messages.
router.get('/:id', (req, res) => {
  const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id);
  if (!request) return res.status(404).json({ error: 'Solicitação não encontrada.' });
  const messages = db
    .prepare('SELECT * FROM messages WHERE request_id = ? ORDER BY id ASC')
    .all(req.params.id);
  res.json({ request, messages });
});

// Generate a simulated request (not sent).
router.post('/generate', async (req, res) => {
  try {
    const { categories, profileIds, recipient } = req.body || {};
    const request = await createSimulatedRequest({ categories, profileIds, recipient });
    res.status(201).json(request);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Send a generated request now.
router.post('/:id/send', async (req, res) => {
  try {
    const request = await sendRequest(Number(req.params.id));
    res.json(request);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Manually sync replies.
router.post('/sync', async (req, res) => {
  try {
    const result = await syncReplies();
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Manually run the autonomous conversation engine (classify + decide next step).
router.post('/process', async (req, res) => {
  try {
    const result = await processConversations();
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Draft a follow-up (awaits approval).
router.post('/:id/followup', (req, res) => {
  try {
    const msg = draftFollowUp(Number(req.params.id));
    res.status(201).json(msg);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Approve + send a pending follow-up.
router.post('/messages/:messageId/approve', async (req, res) => {
  try {
    const sent = await approveAndSendFollowUp(Number(req.params.messageId));
    res.json(sent);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Reject a pending follow-up.
router.post('/messages/:messageId/reject', (req, res) => {
  try {
    res.json(rejectFollowUp(Number(req.params.messageId)));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
