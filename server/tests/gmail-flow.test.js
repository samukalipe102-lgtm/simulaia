// Integration test for the send -> reply-detection -> follow-up approval flow
// using a MOCKED Gmail transport. Verifies real-identifier handling, thread
// matching, duplicate prevention, and that follow-ups send in the correct thread.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const TEST_DB = path.resolve('./data/test-gmail.db');
process.env.DATABASE_FILE = './data/test-gmail.db';
process.env.TEST_MODE = 'true';
process.env.AUTHORIZED_RECIPIENT = 'authorized@example.com';

for (const f of [TEST_DB, `${TEST_DB}-wal`, `${TEST_DB}-shm`]) {
  if (fs.existsSync(f)) fs.rmSync(f);
}

const { db, migrate } = await import('../src/db/index.js');
migrate();
db.prepare("INSERT INTO services (name, category, enabled) VALUES ('Declaração','declaracao',1)").run();
db.prepare("INSERT INTO profiles (name, role, fictitious, enabled) VALUES ('Maria Fictícia','responsavel',1,1)").run();

// Inject a fake Gmail transport (no real credentials needed).
const gmail = await import('../src/services/gmail.js');

let fakeThread = [];
let counter = 0;
gmail.setTransport({
  async sendEmail({ subject, body, threadId }) {
    counter++;
    const id = `msg-${counter}`;
    const tid = threadId || `thread-${counter}`;
    fakeThread.push({
      gmailMessageId: id,
      gmailThreadId: tid,
      from: 'me@gmail.com',
      subject,
      body,
      direction: 'outbound',
    });
    return { messageId: id, threadId: tid };
  },
  async getThreadMessages(threadId) {
    return fakeThread.filter((m) => m.gmailThreadId === threadId);
  },
});

const requests = await import('../src/services/requests.js');

test('Flow: send returns REAL-style identifiers and stores thread/message ids', async () => {
  const r = await requests.createSimulatedRequest({});
  const sent = await requests.sendRequest(r.id);
  assert.ok(sent.gmail_message_id);
  assert.ok(sent.gmail_thread_id);
  assert.equal(sent.status, 'awaiting_reply');
  assert.equal(sent.recipient, 'authorized@example.com'); // test-mode forced
});

test('Flow: syncReplies imports an inbound reply and flags request replied', async () => {
  const r = db.prepare("SELECT * FROM requests WHERE status='awaiting_reply' LIMIT 1").get();
  // Simulate the user replying from their Gmail into the same thread.
  fakeThread.push({
    gmailMessageId: 'reply-1',
    gmailThreadId: r.gmail_thread_id,
    from: 'authorized@example.com',
    subject: `Re: ${r.subject}`,
    body: 'Recebido, retornaremos.',
    direction: 'inbound',
  });
  const res = await requests.syncReplies();
  assert.ok(res.imported >= 1);
  const updated = db.prepare('SELECT status FROM requests WHERE id = ?').get(r.id);
  assert.equal(updated.status, 'replied');
  const inbound = db
    .prepare("SELECT * FROM messages WHERE request_id = ? AND direction='inbound'")
    .get(r.id);
  assert.equal(inbound.gmail_message_id, 'reply-1');
});

test('Flow: duplicate reply is not imported twice', async () => {
  const r = db.prepare("SELECT * FROM requests WHERE status='replied' LIMIT 1").get();
  const before = db
    .prepare("SELECT COUNT(*) AS c FROM messages WHERE request_id = ? AND direction='inbound'")
    .get(r.id).c;
  await requests.syncReplies();
  const after = db
    .prepare("SELECT COUNT(*) AS c FROM messages WHERE request_id = ? AND direction='inbound'")
    .get(r.id).c;
  assert.equal(before, after);
});

test('Flow: follow-up is drafted pending, then approved + sent in same thread', async () => {
  const r = db.prepare("SELECT * FROM requests WHERE status='replied' LIMIT 1").get();
  const draft = requests.draftFollowUp(r.id);
  assert.equal(draft.approval_status, 'pending');

  const sent = await requests.approveAndSendFollowUp(draft.id);
  assert.equal(sent.threadId, r.gmail_thread_id); // same thread
  // After sending a follow-up, the conversation awaits the NEXT reply and the
  // follow-up counter increments (it is not "completed" yet).
  const req = db.prepare('SELECT status, followup_count FROM requests WHERE id = ?').get(r.id);
  assert.equal(req.status, 'awaiting_reply');
  assert.equal(req.followup_count, 1);
  const msg = db.prepare('SELECT approval_status FROM messages WHERE id = ?').get(draft.id);
  assert.equal(msg.approval_status, 'approved');
});
