// "O que há de novo?" (changelog real) + saúde do sistema + aviso por e-mail
// de atualizações relevantes (apenas mudanças reais; registra o resultado).
import { Router } from 'express';
import { db, getSettings, log } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { CHANGELOG, CURRENT_VERSION } from '../data/changelog.js';
import { runHealthChecks, getLastHealth } from '../services/monitor.js';
import * as gmail from '../services/gmail.js';

const router = Router();
router.use(requireAuth);

// Chave de "última versão vista" guardada em settings (coluna criada on-demand).
function getSeenVersion() {
  const row = db.prepare('SELECT last_seen_version FROM settings WHERE id = 1').get();
  return row?.last_seen_version || null;
}

router.get('/changelog', (req, res) => {
  const seen = getSeenVersion();
  const items = CHANGELOG.map((c) => ({ ...c, unseen: !seen || c.version > seen }));
  res.json({ currentVersion: CURRENT_VERSION, seenVersion: seen, items });
});

router.post('/changelog/seen', (req, res) => {
  db.prepare("UPDATE settings SET last_seen_version = ?, updated_at = datetime('now') WHERE id = 1")
    .run(CURRENT_VERSION);
  res.json({ ok: true, seenVersion: CURRENT_VERSION });
});

// Saúde do sistema (executa verificações reais sob demanda).
router.get('/health', async (req, res) => {
  res.json(getLastHealth() || (await runHealthChecks()));
});
router.post('/health/run', async (req, res) => {
  res.json(await runHealthChecks());
});

// Envia ao Gmail administrativo o resumo de uma atualização relevante.
// Só deve ser chamado para mudanças reais; registra o resultado do envio.
router.post('/notify', async (req, res) => {
  const settings = getSettings();
  const to = settings.archive_email || 'adminedugestao@gmail.com';
  const version = req.body?.version || CURRENT_VERSION;
  const entry = CHANGELOG.find((c) => c.version === version) || CHANGELOG[0];

  // Evita avisos repetidos sobre a mesma versão.
  const already = db
    .prepare("SELECT id FROM activity_log WHERE category='update_notify' AND message LIKE ?")
    .get(`%${version}%`);
  if (already) {
    return res.json({ ok: true, skipped: true, reason: 'já notificado', version });
  }

  const body = [
    `Atualização do EduGestão — versão ${entry.version} (${entry.date})`,
    '',
    `Categoria: ${entry.category}`,
    `O que mudou: ${entry.change}`,
    `Por que: ${entry.problem}`,
    `Benefícios: ${entry.benefit}`,
    `Testes: ${entry.tests}`,
    entry.pr ? `GitHub: ${entry.pr}` : '',
    '',
    'Consulte a aba "O que há de novo?" no EduGestão para detalhes.',
    '',
    'EduGestão — Gestão e Atendimento Escolar',
  ].filter(Boolean).join('\n');

  try {
    const sent = await gmail.sendEmail({
      to,
      subject: `EduGestão — atualização ${entry.version} publicada`,
      body,
    });
    log('info', 'update_notify', `Aviso de atualização ${version} enviado para ${to} (msg ${sent.messageId}).`);
    res.json({ ok: true, to, version, messageId: sent.messageId });
  } catch (err) {
    log('error', 'update_notify', `Falha ao notificar atualização ${version}: ${err.message}`);
    res.status(400).json({ ok: false, error: err.message, to, version });
  }
});

export default router;
