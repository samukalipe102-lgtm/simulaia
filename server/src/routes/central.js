// Rotas da central de acompanhamento (EduGestão Atendimento).
import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { syncInbox, recomputeStatus } from '../services/inbox.js';
import * as gmail from '../services/gmail.js';
import {
  getConfig, updateConfig, setStatus, enqueue, queueStats, listQueue, processQueueStep,
} from '../services/adminQueue.js';

const router = Router();
router.use(requireAuth);

// --- Sincronização manual (além do agendador) ---
router.post('/sync', async (req, res) => {
  try {
    res.json(await syncInbox({ max: Number(req.body?.max) || 30 }));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- Processos escolares (lista + filtros) ---
router.get('/processes', (req, res) => {
  const { status, q, from, to } = req.query;
  let sql = 'SELECT * FROM requests WHERE 1=1';
  const params = [];
  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (q) {
    sql += ' AND (subject LIKE ? OR public_id LIKE ? OR profile_name LIKE ? OR sender_email LIKE ?)';
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  if (from) { sql += ' AND datetime(created_at) >= datetime(?)'; params.push(from); }
  if (to) { sql += ' AND datetime(created_at) <= datetime(?)'; params.push(to); }
  sql += ' ORDER BY updated_at DESC LIMIT 500';
  res.json(db.prepare(sql).all(...params));
});

// Detalhe do processo com mensagens e anexos.
router.get('/processes/:id', (req, res) => {
  const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id);
  if (!request) return res.status(404).json({ error: 'Processo não encontrado.' });
  const messages = db.prepare('SELECT * FROM messages WHERE request_id = ? ORDER BY id ASC').all(req.params.id);
  const attachments = db.prepare('SELECT * FROM attachments WHERE request_id = ? ORDER BY id ASC').all(req.params.id);
  res.json({ request, messages, attachments });
});

// Ajuste manual de status (preserva o conteúdo das mensagens).
const VALID_STATUS = ['replied', 'awaiting_reply', 'completed', 'concluido', 'generated'];
router.put('/processes/:id/status', (req, res) => {
  const { status } = req.body || {};
  if (!VALID_STATUS.includes(status)) return res.status(400).json({ error: 'Status inválido.' });
  const r = db.prepare('SELECT id FROM requests WHERE id = ?').get(req.params.id);
  if (!r) return res.status(404).json({ error: 'Processo não encontrado.' });
  db.prepare("UPDATE requests SET status=?, updated_at=datetime('now') WHERE id=?").run(status, req.params.id);
  res.json(db.prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id));
});

// --- Caixa de entrada (mensagens recebidas) ---
router.get('/inbox', (req, res) => {
  const rows = db
    .prepare(
      `SELECT m.*, r.public_id, r.sender_email FROM messages m
       JOIN requests r ON r.id = m.request_id
       WHERE m.direction = 'inbound' ORDER BY m.id DESC LIMIT 300`,
    )
    .all();
  res.json(rows);
});

// --- Respostas enviadas (mensagens outbound reais) ---
router.get('/sent', (req, res) => {
  const rows = db
    .prepare(
      `SELECT m.*, r.public_id FROM messages m
       JOIN requests r ON r.id = m.request_id
       WHERE m.direction = 'outbound' AND m.gmail_message_id IS NOT NULL
       ORDER BY m.id DESC LIMIT 300`,
    )
    .all();
  res.json(rows);
});

// --- Documentos (anexos recebidos/enviados) ---
router.get('/documents', (req, res) => {
  const rows = db
    .prepare(
      `SELECT a.*, r.public_id, r.subject AS process_subject FROM attachments a
       JOIN requests r ON r.id = a.request_id ORDER BY a.id DESC LIMIT 500`,
    )
    .all();
  res.json(rows);
});

// Download de um anexo (busca sob demanda no Gmail; verifica integridade mínima).
router.get('/attachments/:id/download', async (req, res) => {
  const att = db.prepare('SELECT * FROM attachments WHERE id = ?').get(req.params.id);
  if (!att) return res.status(404).json({ error: 'Anexo não encontrado.' });
  if (!att.gmail_message_id || !att.gmail_attachment_id) {
    return res.status(409).json({ error: 'Anexo sem identificadores reais do Gmail.' });
  }
  try {
    const data = await gmail.getAttachment(att.gmail_message_id, att.gmail_attachment_id);
    if (!data?.data) return res.status(502).json({ error: 'Conteúdo do anexo indisponível no Gmail.' });
    const buf = Buffer.from(data.data, 'base64');
    res.setHeader('Content-Type', att.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${(att.filename || 'arquivo').replace(/"/g, '')}"`);
    res.send(buf);
  } catch (err) {
    res.status(502).json({ error: `Falha ao baixar anexo: ${err.message}` });
  }
});

// --- Automação administrativa ---
router.get('/admin-automation', (req, res) => {
  res.json({ config: getConfig(), stats: queueStats(), queue: listQueue(100) });
});
router.put('/admin-automation', (req, res) => {
  res.json(updateConfig(req.body || {}));
});
// Rotas específicas ANTES da genérica /:action (senão /:action captura tudo).
router.post('/admin-automation/enqueue', (req, res) => {
  const { recipient, subject, body, dedupeKey } = req.body || {};
  if (!subject || !body) return res.status(400).json({ error: 'Assunto e corpo são obrigatórios.' });
  try {
    res.status(201).json(enqueue({ recipient, subject, body, dedupeKey }));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
// Processa a fila manualmente (um envio), respeitando as regras.
router.post('/admin-automation/process', async (req, res) => {
  res.json(await processQueueStep());
});
router.post('/admin-automation/:action', (req, res) => {
  const { action } = req.params;
  if (action === 'activate') return res.json(setStatus('active'));
  if (action === 'pause') return res.json(setStatus('paused'));
  if (action === 'resume') return res.json(setStatus('active'));
  return res.status(400).json({ error: 'Ação inválida.' });
});

export default router;
