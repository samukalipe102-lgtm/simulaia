// HTTP-level test for authentication and protected routes using the real app.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const TEST_DB = path.resolve('./data/test-api.db');
process.env.DATABASE_FILE = './data/test-api.db';
process.env.JWT_SECRET = 'test-secret-api';
process.env.ADMIN_EMAIL = 'admin@test.local';
process.env.ADMIN_PASSWORD = 'supersecret1';
process.env.TEST_MODE = 'true';
process.env.AUTHORIZED_RECIPIENT = 'authorized@example.com';

for (const f of [TEST_DB, `${TEST_DB}-wal`, `${TEST_DB}-shm`]) {
  if (fs.existsSync(f)) fs.rmSync(f);
}

const { app } = await import('../src/index.js');

let server;
let base;

test('start server', async () => {
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      base = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

test('health endpoint responds', async () => {
  const res = await fetch(`${base}/api/health`);
  const data = await res.json();
  assert.equal(data.ok, true);
});

test('protected route rejects anonymous access', async () => {
  const res = await fetch(`${base}/api/services`);
  assert.equal(res.status, 401);
});

test('login with wrong password fails', async () => {
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@test.local', password: 'wrong' }),
  });
  assert.equal(res.status, 401);
});

let token;
test('login with correct credentials returns token', async () => {
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@test.local', password: 'supersecret1' }),
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(data.token);
  token = data.token;
});

test('protected route accepts valid token', async () => {
  const res = await fetch(`${base}/api/services`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(Array.isArray(data));
});

test('emergency stop endpoint sets the global flag', async () => {
  const res = await fetch(`${base}/api/settings/emergency-stop`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.emergency_stop, 1);
});

test('stop server', async () => {
  await new Promise((resolve) => server.close(resolve));
});
