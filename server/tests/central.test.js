// Testes da central de acompanhamento: importar e-mails recebidos como processos
// (sem auto-resposta), sincronizar respostas manuais, anexos, e a fila de envios
// administrativos (limite diário, intervalo, dedupe, retomada).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const TEST_DB = path.resolve('./data/test-central.db');
process.env.DATABASE_FILE = './data/test-central.db';
process.env.GOOGLE_CLIENT_ID = 'x';
process.env.GOOGLE_CLIENT_SECRET = 'y';
process.env.OPENAI_API_KEY = '';
for (const f of [TEST_DB, `${TEST_DB}-wal`, `${TEST_DB}-shm`]) {
  if (fs.existsSync(f)) fs.rmSync(f);
}

const { db, migrate, getSettings } = await import('../src/db/index.js');
migrate();
db.prepare("UPDATE settings SET authorized_recipient='adminedugestao@gmail.com' WHERE id=1").run();

// Mock do transporte Gmail: caixa de entrada + threads + envio.
const gmail = await import('../src/services/gmail.js');
let inbox = [];
let threads = {};
let sentCount = 0;
gmail.setTransport({
  async listInbox() { return inbox; },
  async getThreadMessages(threadId) { return threads[threadId] || []; },
  async sendEmail({ to, subject }) {
    sentCount++;
    return { messageId: `admin-${sentCount}`, threadId: `t-admin-${sentCount}` };
  },
});

const inboxSvc = await import('../src/services/inbox.js');
const adminQ = await import('../src/services/adminQueue.js');

test('Inbox: e-mail recebido vira processo (sem resposta automática)', async () => {
  inbox = [{
    from: 'Maria Santos <maria@exemplo.com>',
    subject: 'Preciso da declaração de matrícula',
    body: 'Bom dia, gostaria da declaração de matrícula do meu filho.',
    snippet: 'Bom dia...',
    gmailMessageId: 'in-1',
    gmailThreadId: 'thread-1',
    internalDate: Date.now(),
    attachments: [],
  }];
  threads['thread-1'] = [
    { direction: 'inbound', from: 'Maria Santos <maria@exemplo.com>', subject: 'Preciso da declaração de matrícula', body: 'Bom dia...', gmailMessageId: 'in-1', gmailThreadId: 'thread-1', attachments: [] },
  ];
  const r = await inboxSvc.syncInbox();
  assert.equal(r.processes, 1);
  const proc = db.prepare("SELECT * FROM requests WHERE gmail_thread_id='thread-1'").get();
  assert.ok(proc);
  assert.equal(proc.source, 'inbound');
  assert.equal(proc.sender_email, 'maria@exemplo.com');
  assert.equal(proc.status, 'replied'); // aguardando o admin responder
  assert.equal(proc.fictitious, 0);
  // Nenhuma mensagem outbound foi criada (sem auto-resposta).
  const out = db.prepare("SELECT COUNT(*) AS c FROM messages WHERE request_id=? AND direction='outbound'").get(proc.id).c;
  assert.equal(out, 0);
});

test('Inbox: idempotente — resync não duplica processo nem mensagens', async () => {
  const before = db.prepare('SELECT COUNT(*) AS c FROM requests').get().c;
  const beforeMsg = db.prepare('SELECT COUNT(*) AS c FROM messages').get().c;
  await inboxSvc.syncInbox();
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM requests').get().c, before);
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM messages').get().c, beforeMsg);
});

test('Inbox: resposta MANUAL do admin marca processo como respondido', async () => {
  // admin respondeu pelo Gmail → nova mensagem outbound na thread
  threads['thread-1'].push({
    direction: 'outbound', from: 'adminedugestao@gmail.com', subject: 'Re: Declaração', body: 'Prezada, segue orientação.', gmailMessageId: 'out-1', gmailThreadId: 'thread-1', attachments: [],
  });
  await inboxSvc.syncInbox();
  const proc = db.prepare("SELECT * FROM requests WHERE gmail_thread_id='thread-1'").get();
  assert.equal(proc.status, 'completed'); // "Respondido"
  const out = db.prepare("SELECT COUNT(*) AS c FROM messages WHERE request_id=? AND direction='outbound'").get(proc.id).c;
  assert.equal(out, 1);
});

test('Inbox: anexo recebido é registrado e associado ao processo', async () => {
  inbox = [{
    from: 'Pai <pai@exemplo.com>', subject: 'Documento', body: 'segue anexo', snippet: 'segue',
    gmailMessageId: 'in-2', gmailThreadId: 'thread-2', internalDate: Date.now(),
    attachments: [{ filename: 'rg.pdf', mimeType: 'application/pdf', size: 1234, attachmentId: 'att-1' }],
  }];
  threads['thread-2'] = [
    { direction: 'inbound', from: 'Pai <pai@exemplo.com>', subject: 'Documento', body: 'segue anexo', gmailMessageId: 'in-2', gmailThreadId: 'thread-2',
      attachments: [{ filename: 'rg.pdf', mimeType: 'application/pdf', size: 1234, attachmentId: 'att-1' }] },
  ];
  await inboxSvc.syncInbox();
  const proc = db.prepare("SELECT * FROM requests WHERE gmail_thread_id='thread-2'").get();
  const atts = db.prepare('SELECT * FROM attachments WHERE request_id=?').all(proc.id);
  assert.equal(atts.length, 1);
  assert.equal(atts[0].filename, 'rg.pdf');
  assert.equal(atts[0].gmail_attachment_id, 'att-1');
});

// --- Fila administrativa ---
test('Fila admin: enfileira e é idempotente por dedupe_key', () => {
  const a = adminQ.enqueue({ subject: 'Aviso', body: 'corpo', dedupeKey: 'k1' });
  assert.equal(a.duplicated, false);
  const b = adminQ.enqueue({ subject: 'Aviso', body: 'corpo', dedupeKey: 'k1' });
  assert.equal(b.duplicated, true);
  assert.equal(db.prepare("SELECT COUNT(*) AS c FROM admin_queue WHERE dedupe_key='k1'").get().c, 1);
});

test('Fila admin: pausada não envia; ativa envia um por vez respeitando intervalo', async () => {
  adminQ.updateConfig({ daily_limit: 10, interval_minutes: 10, start_hour: 0, end_hour: 24, allowed_days: '0,1,2,3,4,5,6' });
  // pausada
  adminQ.setStatus('paused');
  let r = await adminQ.processQueueStep();
  assert.equal(r.skipped, true);
  assert.equal(r.reason, 'paused');
  // ativa → envia 1
  adminQ.setStatus('active');
  adminQ.enqueue({ subject: 'A', body: 'b', dedupeKey: 'k2' });
  r = await adminQ.processQueueStep();
  assert.equal(r.sent, true);
  // segunda chamada imediata → bloqueada pelo intervalo
  const r2 = await adminQ.processQueueStep();
  assert.equal(r2.reason, 'interval_not_elapsed');
});

test('Fila admin: limite diário pausa novos envios', async () => {
  // zera e configura limite 1, intervalo 0, já com 1 enviado hoje
  adminQ.updateConfig({ daily_limit: 1, interval_minutes: 0, start_hour: 0, end_hour: 24, allowed_days: '0,1,2,3,4,5,6' });
  const today = new Date().toISOString().slice(0, 10);
  db.prepare("UPDATE admin_automation SET sent_today=1, sent_today_date=?, last_sent_at=NULL WHERE id=1").run(today);
  adminQ.enqueue({ subject: 'C', body: 'd', dedupeKey: 'k3' });
  const r = await adminQ.processQueueStep();
  assert.equal(r.reason, 'daily_limit_reached');
});

test('Fila admin: stats refletem limite, enviados e restantes', () => {
  const s = adminQ.queueStats();
  assert.equal(s.daily_limit, 1);
  assert.equal(s.sent_today, 1);
  assert.equal(s.remaining, 0);
});

test('Emergência bloqueia a fila administrativa', async () => {
  db.prepare('UPDATE settings SET emergency_stop=1 WHERE id=1').run();
  adminQ.updateConfig({ daily_limit: 10, interval_minutes: 0, start_hour: 0, end_hour: 24, allowed_days: '0,1,2,3,4,5,6' });
  adminQ.setStatus('active');
  adminQ.enqueue({ subject: 'E', body: 'f', dedupeKey: 'k4' });
  const r = await adminQ.processQueueStep();
  assert.equal(r.reason, 'emergency_stop');
  db.prepare('UPDATE settings SET emergency_stop=0 WHERE id=1').run();
});

test('Fluxo Outlook→Gmail: e-mail encaminhado vira processo com remetente ORIGINAL', async () => {
  db.prepare("UPDATE settings SET official_email='admsedugestao@outlook.com' WHERE id=1").run();
  inbox = [{
    from: 'Atendimento <admsedugestao@outlook.com>',  // encaminhado pelo Outlook
    subject: 'Enc: Declaração de frequência',
    body: [
      'Encaminhando solicitação recebida.',
      '',
      'De: Carlos Souza <carlos.souza@exemplo.com>',
      'Enviada em: 13 de outubro de 2026 08:30',
      'Para: admsedugestao@outlook.com',
      'Assunto: Declaração de frequência',
      '',
      'Prezados, solicito a declaração de frequência da minha filha.',
    ].join('\n'),
    snippet: 'Encaminhando...',
    gmailMessageId: 'fwd-1',
    gmailThreadId: 'thread-fwd-1',
    internalDate: Date.now(),
    attachments: [],
  }];
  threads['thread-fwd-1'] = [
    { direction: 'inbound', from: 'Atendimento <admsedugestao@outlook.com>', subject: 'Enc: Declaração de frequência', body: inbox[0].body, gmailMessageId: 'fwd-1', gmailThreadId: 'thread-fwd-1', attachments: [] },
  ];
  const r = await inboxSvc.syncInbox();
  assert.ok(r.processes >= 1);
  const proc = db.prepare("SELECT * FROM requests WHERE gmail_thread_id='thread-fwd-1'").get();
  assert.equal(proc.origin_kind, 'forwarded_request');
  // mostra o remetente REAL (aluno/responsável), não o Outlook
  assert.equal(proc.sender_email, 'carlos.souza@exemplo.com');
  assert.equal(proc.original_sender_email, 'carlos.souza@exemplo.com');
  assert.equal(proc.profile_name, 'Carlos Souza');
  assert.equal(proc.subject, 'Declaração de frequência'); // sem "Enc:"
  assert.match(proc.body, /declaração de frequência da minha filha/i);
});

test('Fluxo Outlook→Gmail: não duplica ao re-sincronizar o encaminhado', async () => {
  const before = db.prepare('SELECT COUNT(*) AS c FROM requests').get().c;
  await inboxSvc.syncInbox();
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM requests').get().c, before);
});
