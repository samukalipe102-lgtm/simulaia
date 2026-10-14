// "ATIVAR E TESTAR ENVIO DE E-MAILS" — executa verificações REAIS no backend
// e só liga a IA (auto_mode) quando os requisitos são atendidos. Também faz um
// envio de teste real para um endereço escolhido pelo administrador.
import { Router } from 'express';
import { db, getSettings, log, solicitationRecipient } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import * as gmail from '../services/gmail.js';
import { gmailConfigured } from '../config.js';

const router = Router();
router.use(requireAuth);

// Executa a bateria de verificações reais e retorna o estado de cada etapa.
async function runChecks() {
  const settings = getSettings();
  const steps = [];
  const push = (key, label, state, detail, fix) => steps.push({ key, label, state, detail, fix });

  // 1) Credenciais do Gmail configuradas?
  if (!gmailConfigured(settings)) {
    push('gmail_config', 'Credenciais do Gmail', 'autenticacao_necessaria',
      'Client ID/Secret do Google ausentes.', 'Informe as credenciais em Integração Gmail.');
  } else {
    push('gmail_config', 'Credenciais do Gmail', 'ok', 'Credenciais presentes.');
  }

  // 2) Gmail conectado (OAuth concluído) e envio autorizado?
  let gmailOk = false;
  if (gmailConfigured(settings)) {
    try {
      const info = await gmail.testConnection(); // chama a API real
      gmailOk = true;
      push('gmail_connect', 'Conexão Gmail (envio)', 'ok', `Conectado como ${info.emailAddress}.`);
    } catch (err) {
      push('gmail_connect', 'Conexão Gmail (envio)', 'autenticacao_necessaria',
        err.message, 'Conclua a autorização OAuth em Integração Gmail.');
    }
  } else {
    push('gmail_connect', 'Conexão Gmail (envio)', 'nao_conectado', 'Sem credenciais.', 'Configure o Gmail.');
  }

  // 3) Destino das solicitações (Outlook oficial) definido?
  const dest = solicitationRecipient();
  if (dest) {
    push('destination', 'Destino das solicitações (Outlook)', 'ok', `Enviando para ${dest}.`);
  } else {
    push('destination', 'Destino das solicitações (Outlook)', 'permissao_insuficiente',
      'E-mail de destino não definido.', 'Defina o e-mail oficial do Outlook em Configurações.');
  }

  // 4) Há serviços habilitados e uma automação para gerar?
  const services = db.prepare('SELECT COUNT(*) AS c FROM services WHERE enabled = 1').get().c;
  push('services', 'Serviços habilitados', services > 0 ? 'ok' : 'permissao_insuficiente',
    `${services} serviço(s).`, services > 0 ? undefined : 'Habilite ao menos um serviço.');

  const emergency = !!settings.emergency_stop;
  if (emergency) push('emergency', 'Parada de emergência', 'falha_no_envio', 'Parada de emergência acionada.', 'Libere a parada de emergência.');

  const ready = steps.every((s) => s.state === 'ok');
  return { ready, steps, dest, gmailOk };
}

// GET: apenas diagnostica (não altera nada).
router.get('/status', async (req, res) => {
  const settings = getSettings();
  const checks = await runChecks();
  res.json({
    auto_mode: !!settings.auto_mode,
    service_state: settings.emergency_stop ? 'servico_ativo' : (settings.auto_mode ? 'servico_ativo' : 'nao_conectado'),
    ...checks,
  });
});

// POST: executa as verificações e, se tudo ok, LIGA a IA (auto_mode) e ativa as
// automações pausadas. Se não estiver pronto, NÃO liga e devolve as pendências.
router.post('/activate', async (req, res) => {
  const checks = await runChecks();
  if (!checks.ready) {
    return res.status(409).json({ activated: false, ...checks });
  }
  // Liga a IA e ativa automações pausadas (com janela).
  db.prepare("UPDATE settings SET auto_mode = 1, updated_at = datetime('now') WHERE id = 1").run();
  const now = new Date();
  for (const a of db.prepare("SELECT * FROM automations WHERE status = 'paused'").all()) {
    const ends = a.ends_at || new Date(now.getTime() + (a.duration_days || 30) * 86400000).toISOString();
    db.prepare("UPDATE automations SET status='active', starts_at=COALESCE(starts_at, ?), ends_at=?, updated_at=datetime('now') WHERE id=?")
      .run(now.toISOString(), ends, a.id);
  }
  if (db.prepare('SELECT COUNT(*) AS c FROM automations').get().c === 0) {
    const ends = new Date(now.getTime() + 30 * 86400000).toISOString();
    db.prepare("INSERT INTO automations (name, status, starts_at, ends_at) VALUES ('Automação principal','active',?,?)").run(now.toISOString(), ends);
  }
  log('info', 'automation', 'IA ativada: geração e envio de solicitações ao Outlook habilitados.');
  res.json({ activated: true, ...checks });
});

// Desligar a IA.
router.post('/deactivate', (req, res) => {
  db.prepare("UPDATE settings SET auto_mode = 0, updated_at = datetime('now') WHERE id = 1").run();
  log('info', 'automation', 'IA desativada.');
  res.json({ activated: false });
});

// Envio de teste REAL para um endereço escolhido pelo administrador.
router.post('/test-send', async (req, res) => {
  const to = (req.body?.to || '').trim();
  if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    return res.status(400).json({ ok: false, error: 'Informe um e-mail de destino válido.' });
  }
  try {
    const sent = await gmail.sendEmail({
      to,
      subject: 'Teste de verificação de e-mail — EduGestão',
      body:
        'Esta é uma mensagem de teste da integração de e-mails do EduGestão.\n\n' +
        'Se você recebeu este e-mail, o envio está funcionando.\n\n' +
        'EduGestão — Gestão e Atendimento Escolar',
    });
    db.prepare(
      `INSERT INTO activity_log (level, category, message) VALUES ('info','gmail',?)`,
    ).run(`Teste de envio para ${to} aceito (msg ${sent.messageId}).`);
    res.json({ ok: true, messageId: sent.messageId, threadId: sent.threadId, to, at: new Date().toISOString() });
  } catch (err) {
    db.prepare(
      `INSERT INTO activity_log (level, category, message) VALUES ('error','gmail',?)`,
    ).run(`Falha no teste de envio para ${to}: ${err.message}`);
    res.status(400).json({ ok: false, error: err.message, to, at: new Date().toISOString() });
  }
});

export default router;
