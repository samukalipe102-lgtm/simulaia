// Tests for the end-to-end AUTONOMOUS flow: reply classification, automatic
// follow-up within rules, auto-close on resolved/closed, follow-up cap, and
// emergency-stop gating. Uses a mocked Gmail transport (no real credentials).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const TEST_DB = path.resolve('./data/test-auto.db');
process.env.DATABASE_FILE = './data/test-auto.db';
process.env.TEST_MODE = 'true';
process.env.AUTHORIZED_RECIPIENT = 'authorized@example.com';
process.env.GOOGLE_CLIENT_ID = '';
process.env.GOOGLE_CLIENT_SECRET = '';
process.env.OPENAI_API_KEY = ''; // force deterministic keyword classifier

for (const f of [TEST_DB, `${TEST_DB}-wal`, `${TEST_DB}-shm`]) {
  if (fs.existsSync(f)) fs.rmSync(f);
}

const { db, migrate, getSettings } = await import('../src/db/index.js');
migrate();
db.prepare("INSERT INTO services (name, category, enabled) VALUES ('Declaração','declaracao',1)").run();
db.prepare("INSERT INTO profiles (name, role, fictitious, enabled) VALUES ('Maria Fictícia','responsavel',1,1)").run();

const { classifyReply } = await import('../src/ai/generator.js');

// --- Mocked Gmail transport ---
const gmail = await import('../src/services/gmail.js');
let fakeThread = [];
let counter = 0;
gmail.setTransport({
  async sendEmail({ subject, body, threadId }) {
    counter++;
    const id = `msg-${counter}`;
    const tid = threadId || `thread-${counter}`;
    fakeThread.push({ gmailMessageId: id, gmailThreadId: tid, from: 'me@gmail.com', subject, body, direction: 'outbound' });
    return { messageId: id, threadId: tid };
  },
  async getThreadMessages(threadId) {
    return fakeThread.filter((m) => m.gmailThreadId === threadId);
  },
});

const requests = await import('../src/services/requests.js');

function pushInbound(threadId, body) {
  fakeThread.push({
    gmailMessageId: `in-${Math.random().toString(36).slice(2)}`,
    gmailThreadId: threadId,
    from: 'authorized@example.com',
    subject: 'Re: teste',
    body,
    direction: 'inbound',
  });
}

test('Classifier: keyword heuristic recognizes resolved / awaiting_info / closed', async () => {
  const a = await classifyReply({ replyText: 'Documento emitido, segue em anexo o histórico.' });
  assert.equal(a.classification, 'resolved');
  const b = await classifyReply({ replyText: 'Precisamos de mais informações: informe o CPF do aluno.' });
  assert.equal(b.classification, 'awaiting_info');
  const c = await classifyReply({ replyText: 'Pedido indeferido, processo encerrado.' });
  assert.equal(c.classification, 'closed');
});

let uniq = 0;
async function newSentRequest(automationId = null) {
  const r = await requests.createSimulatedRequest(automationId ? { automationId } : {});
  // Give each request a unique subject so the 10-min duplicate guard never trips
  // across tests (production relies on it; tests need distinct subjects).
  uniq++;
  db.prepare('UPDATE requests SET subject = ? WHERE id = ?').run(`[SIMULAÇÃO] Teste único ${uniq}`, r.id);
  const sent = await requests.sendRequest(r.id);
  return sent;
}

test('Auto-close: a "resolved" reply closes the conversation automatically', async () => {
  const r = await newSentRequest();
  pushInbound(r.gmail_thread_id, 'Prezado, a declaração foi emitida e está disponível. Resolvido.');
  await requests.syncReplies();
  // enable auto mode + authorization
  db.prepare('UPDATE settings SET auto_mode=1, auto_followup_approved=1 WHERE id=1').run();
  const res = await requests.processConversations();
  assert.ok(res.closed >= 1);
  const req = db.prepare('SELECT * FROM requests WHERE id = ?').get(r.id);
  assert.equal(req.status, 'completed');
  assert.equal(req.conversation_state, 'resolved');
});

test('Auto follow-up: an "awaiting_info" reply triggers an automatic follow-up when authorized', async () => {
  // automation that owns the request and allows auto follow-up
  const auto = db.prepare(
    `INSERT INTO automations (name, status, auto_followup, max_followups_per_conversation)
     VALUES ('A','active',1,3)`,
  ).run();
  const sent = await newSentRequest(auto.lastInsertRowid);
  pushInbound(sent.gmail_thread_id, 'Para prosseguir, informe o CPF e a matrícula do aluno.');
  await requests.syncReplies();
  db.prepare('UPDATE settings SET auto_mode=1, auto_followup_approved=1 WHERE id=1').run();

  const before = db.prepare("SELECT COUNT(*) AS c FROM messages WHERE request_id=? AND is_followup=1").get(sent.id).c;
  const res = await requests.processConversations();
  const after = db.prepare("SELECT COUNT(*) AS c FROM messages WHERE request_id=? AND is_followup=1").get(sent.id).c;
  assert.ok(res.autoSent >= 1);
  assert.equal(after, before + 1);
  const req = db.prepare('SELECT * FROM requests WHERE id = ?').get(sent.id);
  assert.equal(req.status, 'awaiting_reply'); // waiting for the next reply
  assert.equal(req.followup_count, 1);
  // the follow-up message was actually sent (approved) in the same thread
  const fu = db.prepare("SELECT * FROM messages WHERE request_id=? AND is_followup=1 ORDER BY id DESC LIMIT 1").get(sent.id);
  assert.equal(fu.approval_status, 'approved');
  assert.equal(fu.gmail_thread_id, sent.gmail_thread_id);
});

test('Approval required: without authorization, follow-up is only drafted (awaiting_approval)', async () => {
  const r = await newSentRequest();
  pushInbound(r.gmail_thread_id, 'Estamos verificando, aguarde o prazo.');
  await requests.syncReplies();
  // auto_mode on but auto_followup_approved OFF
  db.prepare('UPDATE settings SET auto_mode=1, auto_followup_approved=0 WHERE id=1').run();
  const res = await requests.processConversations();
  assert.ok(res.drafted >= 1);
  const req = db.prepare('SELECT * FROM requests WHERE id = ?').get(r.id);
  assert.equal(req.status, 'awaiting_approval');
  const fu = db.prepare("SELECT approval_status FROM messages WHERE request_id=? AND is_followup=1 ORDER BY id DESC LIMIT 1").get(r.id);
  assert.equal(fu.approval_status, 'pending'); // NOT sent
});

test('Follow-up cap: conversation closes once max_followups reached', async () => {
  const r = await newSentRequest();
  // simulate it already hit the cap
  db.prepare('UPDATE requests SET followup_count = max_followups WHERE id = ?').run(r.id);
  pushInbound(r.gmail_thread_id, 'Ainda em análise, aguarde.');
  await requests.syncReplies();
  db.prepare('UPDATE settings SET auto_mode=1, auto_followup_approved=1 WHERE id=1').run();
  await requests.processConversations();
  const req = db.prepare('SELECT * FROM requests WHERE id = ?').get(r.id);
  assert.equal(req.status, 'completed');
  assert.equal(req.conversation_state, 'closed');
});

test('Emergency stop blocks the conversation engine', async () => {
  const r = await newSentRequest();
  pushInbound(r.gmail_thread_id, 'Informe o CPF, por favor.');
  await requests.syncReplies();
  db.prepare('UPDATE settings SET auto_mode=1, auto_followup_approved=1, emergency_stop=1 WHERE id=1').run();
  const res = await requests.processConversations();
  assert.equal(res.reason, 'emergency_stop');
  db.prepare('UPDATE settings SET emergency_stop=0 WHERE id=1').run();
});

test('Modo real: e-mail enviado NÃO contém marcadores de simulação', async () => {
  db.prepare('UPDATE settings SET real_mode = 1 WHERE id = 1').run();
  db.prepare("INSERT OR IGNORE INTO guardians (name) VALUES ('Responsável Verdadeiro')").run();
  const r = await requests.createSimulatedRequest({});
  // injeta assunto sujo de propósito para testar a rede de segurança
  db.prepare("UPDATE requests SET subject = '[SIMULAÇÃO] Teste real', body = body || '\n\n---\nMensagem gerada para fins de teste e simulação. Não representa pessoa real.' WHERE id = ?").run(r.id);
  const sent = await requests.sendRequest(r.id);
  // mensagem efetivamente armazenada/enviada
  const msg = db.prepare("SELECT * FROM messages WHERE request_id=? AND direction='outbound' ORDER BY id DESC LIMIT 1").get(r.id);
  assert.ok(!sent.subject.includes('[SIMULAÇÃO]'));
  assert.ok(!msg.subject.includes('[SIMULAÇÃO]'));
  assert.doesNotMatch(msg.body, /perfil fict[íi]cio|fins de teste|simula[çc][ãa]o|n[ãa]o representa/i);
  db.prepare('UPDATE settings SET real_mode = 0 WHERE id = 1').run();
});
