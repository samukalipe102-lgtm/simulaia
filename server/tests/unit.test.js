// Unit + integration tests that run without external Gmail access.
// Run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Use an isolated test database.
const TEST_DB = path.resolve('./data/test.db');
process.env.DATABASE_FILE = './data/test.db';
process.env.JWT_SECRET = 'test-secret';
process.env.TEST_MODE = 'true';
process.env.AUTHORIZED_RECIPIENT = 'authorized@example.com';

// Clean slate.
for (const f of [TEST_DB, `${TEST_DB}-wal`, `${TEST_DB}-shm`]) {
  if (fs.existsSync(f)) fs.rmSync(f);
}

const { db, migrate, getSettings } = await import('../src/db/index.js');
migrate();

const { generateRequestContent, generateFollowUp } = await import('../src/ai/generator.js');
const { signToken } = await import('../src/middleware/auth.js');
const jwt = (await import('jsonwebtoken')).default;

// Seed minimal data.
db.prepare("INSERT INTO services (name, category, enabled) VALUES ('Declaração de matrícula','declaracao',1)").run();
db.prepare("INSERT INTO profiles (name, role, fictitious, enabled) VALUES ('Maria Fictícia','responsavel',1,1)").run();

test('AI: generated request is flagged fictitious and uses enabled service', () => {
  const service = db.prepare('SELECT * FROM services LIMIT 1').get();
  const profile = db.prepare('SELECT * FROM profiles LIMIT 1').get();
  const c = generateRequestContent({ service, profile, seed: 42 });
  assert.equal(c.fictitious, true);
  assert.ok(c.subject.startsWith('[SIMULAÇÃO]'));
  assert.match(c.body, /fict/i);
  assert.match(c.body, /simula/i);
});

test('AI: follow-up draft references the request and is fictitious', () => {
  const request = {
    public_id: 'SIM-2026-0001',
    subject: '[SIMULAÇÃO] Teste',
    category: 'declaracao',
    profile_name: 'Maria Fictícia',
  };
  const d = generateFollowUp({ request, lastInbound: { body: 'ok, enviaremos' } });
  assert.ok(d.subject.startsWith('Re:'));
  assert.match(d.body, /SIM-2026-0001/);
  assert.equal(d.fictitious, true);
});

test('Auth: JWT sign + verify round-trip', () => {
  const token = signToken({ id: 1, email: 'admin@x', role: 'admin' });
  const decoded = jwt.verify(token, 'test-secret');
  assert.equal(decoded.email, 'admin@x');
  assert.equal(decoded.role, 'admin');
});

test('Auth: invalid token is rejected', () => {
  assert.throws(() => jwt.verify('garbage', 'test-secret'));
});

test('Settings: test mode defaults and emergency flag togglable', () => {
  const s = getSettings();
  assert.equal(s.test_mode, 1);
  db.prepare('UPDATE settings SET emergency_stop = 1 WHERE id = 1').run();
  assert.equal(getSettings().emergency_stop, 1);
  db.prepare('UPDATE settings SET emergency_stop = 0 WHERE id = 1').run();
});

const { createSimulatedRequest, isDuplicate } = await import('../src/services/requests.js');

test('Requests: createSimulatedRequest persists a fictitious request', async () => {
  const r = await createSimulatedRequest({});
  assert.ok(r.public_id.startsWith('SIM-'));
  assert.equal(r.fictitious, 1);
  assert.equal(r.status, 'generated');
});

test('Requests: duplicate detection blocks repeat subject to same recipient', () => {
  const subject = '[SIMULAÇÃO] Dup';
  db.prepare(
    `INSERT INTO requests (public_id, subject, body, category, profile_name, profile_role, recipient, status, sent_at)
     VALUES ('SIM-D-1', ?, 'x', 'declaracao', 'Maria', 'responsavel', 'authorized@example.com', 'sent', datetime('now'))`,
  ).run(subject);
  assert.equal(isDuplicate(subject, 'authorized@example.com'), true);
  assert.equal(isDuplicate(subject, 'other@example.com'), false);
});

const { canSendNow } = await import('../src/services/automation.js');

test('Automation: paused automation cannot send', () => {
  const a = {
    status: 'paused', allowed_days: '0,1,2,3,4,5,6', start_hour: 0, end_hour: 24,
    max_per_day: 5, sent_today: 0, interval_minutes: 0,
  };
  assert.equal(canSendNow(a).ok, false);
});

test('Automation: emergency stop blocks even active automations', () => {
  db.prepare('UPDATE settings SET emergency_stop = 1 WHERE id = 1').run();
  const a = {
    status: 'active', allowed_days: '0,1,2,3,4,5,6', start_hour: 0, end_hour: 24,
    max_per_day: 5, sent_today: 0, interval_minutes: 0,
  };
  assert.equal(canSendNow(a).reason, 'emergency_stop');
  db.prepare('UPDATE settings SET emergency_stop = 0 WHERE id = 1').run();
});

test('Automation: daily cap enforced', () => {
  const a = {
    status: 'active', allowed_days: '0,1,2,3,4,5,6', start_hour: 0, end_hour: 24,
    max_per_day: 2, sent_today: 2, sent_today_date: new Date().toISOString().slice(0, 10),
    interval_minutes: 0, id: 999,
  };
  // insert so rolloverDaily can update
  db.prepare(
    `INSERT INTO automations (id, name, max_per_day, sent_today, sent_today_date, status, allowed_days, start_hour, end_hour, interval_minutes)
     VALUES (999, 'cap', 2, 2, ?, 'active', '0,1,2,3,4,5,6', 0, 24, 0)`,
  ).run(new Date().toISOString().slice(0, 10));
  const full = db.prepare('SELECT * FROM automations WHERE id = 999').get();
  assert.equal(canSendNow(full).reason, 'daily_cap_reached');
});

test('Automation: allowed-hours gate works', () => {
  const a = {
    status: 'active', allowed_days: '0,1,2,3,4,5,6', start_hour: 9, end_hour: 10,
    max_per_day: 5, sent_today: 0, interval_minutes: 0,
  };
  const at3am = new Date();
  at3am.setHours(3, 0, 0, 0);
  assert.equal(canSendNow(a, at3am).reason, 'hour_not_allowed');
});

const { draftFollowUp, rejectFollowUp } = await import('../src/services/requests.js');

test('Follow-up: draft requires approval (pending) and does not send', async () => {
  const r = await createSimulatedRequest({});
  // simulate it was sent and replied
  db.prepare(
    `UPDATE requests SET status='replied', gmail_thread_id='t1', gmail_message_id='m1' WHERE id = ?`,
  ).run(r.id);
  db.prepare(
    `INSERT INTO messages (request_id, direction, body) VALUES (?, 'inbound', 'retorno real')`,
  ).run(r.id);
  const draft = draftFollowUp(r.id);
  assert.equal(draft.approval_status, 'pending');
  assert.equal(draft.is_followup, 1);
  const req = db.prepare('SELECT status FROM requests WHERE id = ?').get(r.id);
  assert.equal(req.status, 'awaiting_approval');
  // reject path
  rejectFollowUp(draft.id);
  const after = db.prepare('SELECT approval_status FROM messages WHERE id = ?').get(draft.id);
  assert.equal(after.approval_status, 'rejected');
});
