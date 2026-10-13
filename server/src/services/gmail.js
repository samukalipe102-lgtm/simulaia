// Real Gmail integration using googleapis + OAuth 2.0.
// Tokens are stored ONLY in the backend database (gmail_accounts table) and are
// never exposed to the frontend.

import { google } from 'googleapis';
import { config, gmailConfigured, resolveGoogleCreds } from '../config.js';
import { db, log, getSettings } from '../db/index.js';

function oauthClient() {
  const creds = resolveGoogleCreds(getSettings());
  return new google.auth.OAuth2(creds.clientId, creds.clientSecret, creds.redirectUri);
}

export function getAuthUrl() {
  if (!gmailConfigured(getSettings())) {
    throw new Error(
      'Gmail não configurado. Informe o Client ID e o Client Secret do Google (em Configurações) ou no .env.',
    );
  }
  const client = oauthClient();
  return client.generateAuthUrl({
    access_type: 'offline', // request a refresh_token
    prompt: 'consent', // force refresh_token on re-consent
    scope: config.google.scopes,
  });
}

function getAccountRow() {
  return db.prepare('SELECT * FROM gmail_accounts ORDER BY id LIMIT 1').get();
}

function saveTokens(tokens, email) {
  const row = getAccountRow();
  if (row) {
    db.prepare(
      `UPDATE gmail_accounts SET
        email = COALESCE(?, email),
        access_token = ?,
        refresh_token = COALESCE(?, refresh_token),
        scope = ?,
        token_type = ?,
        expiry_date = ?,
        connected = 1,
        last_error = NULL,
        updated_at = datetime('now')
       WHERE id = ?`,
    ).run(
      email || null,
      tokens.access_token || null,
      tokens.refresh_token || null,
      tokens.scope || null,
      tokens.token_type || null,
      tokens.expiry_date || null,
      row.id,
    );
  } else {
    db.prepare(
      `INSERT INTO gmail_accounts
        (email, access_token, refresh_token, scope, token_type, expiry_date, connected)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
    ).run(
      email || null,
      tokens.access_token || null,
      tokens.refresh_token || null,
      tokens.scope || null,
      tokens.token_type || null,
      tokens.expiry_date || null,
    );
  }
}

export async function handleOAuthCallback(code) {
  const client = oauthClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  // Discover the connected account email.
  let email = null;
  try {
    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const me = await oauth2.userinfo.get();
    email = me.data.email;
  } catch {
    /* non-fatal */
  }

  saveTokens(tokens, email);
  log('info', 'gmail', `Conta Gmail conectada: ${email || 'desconhecida'}`);
  return { email };
}

/**
 * Returns an authenticated OAuth2 client, auto-refreshing + persisting tokens.
 * Throws a descriptive error if not connected or if the refresh token expired.
 */
export async function getAuthedClient() {
  const row = getAccountRow();
  if (!row || !row.connected) {
    throw new Error('Conta Gmail não conectada.');
  }
  const client = oauthClient();
  client.setCredentials({
    access_token: row.access_token,
    refresh_token: row.refresh_token,
    scope: row.scope,
    token_type: row.token_type,
    expiry_date: row.expiry_date,
  });

  // Persist refreshed tokens automatically.
  client.on('tokens', (tokens) => {
    saveTokens(tokens, row.email);
  });

  // Proactively refresh if expired and we have a refresh token.
  if (row.expiry_date && Date.now() > row.expiry_date - 60_000) {
    if (!row.refresh_token) {
      markError('Autorização expirada e sem refresh_token. Reconecte o Gmail.');
      throw new Error(
        'Autorização do Gmail expirada. Reconecte a conta (sem refresh_token).',
      );
    }
    try {
      const { credentials } = await client.refreshAccessToken();
      saveTokens(credentials, row.email);
      client.setCredentials(credentials);
    } catch (err) {
      markError(`Falha ao renovar token: ${err.message}`);
      throw new Error('Falha ao renovar a autorização do Gmail. Reconecte a conta.');
    }
  }
  return client;
}

function markError(message) {
  const row = getAccountRow();
  if (row) {
    db.prepare(
      `UPDATE gmail_accounts SET last_error = ?, updated_at = datetime('now') WHERE id = ?`,
    ).run(message, row.id);
  }
  log('error', 'gmail', message);
}

export function getStatus() {
  const settings = getSettings();
  const row = getAccountRow();
  if (!row) {
    return { configured: gmailConfigured(settings), connected: false, email: null, lastError: null };
  }
  return {
    configured: gmailConfigured(settings),
    connected: Boolean(row.connected),
    email: row.email,
    lastError: row.last_error,
    expiryDate: row.expiry_date,
  };
}

export function disconnect() {
  const row = getAccountRow();
  if (row) {
    db.prepare(
      `UPDATE gmail_accounts SET connected = 0, access_token = NULL,
        refresh_token = NULL, updated_at = datetime('now') WHERE id = ?`,
    ).run(row.id);
    log('info', 'gmail', 'Conta Gmail desconectada.');
  }
}

// --- Transport injection (for tests) --------------------------------------
// By default the real Gmail transport is used. Tests can inject a fake
// transport via setTransport() to exercise the flow without real credentials.
let transport = null;
export function setTransport(t) {
  transport = t;
}
export function resetTransport() {
  transport = null;
}

function toBase64Url(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function buildRawMessage({ to, from, subject, body, inReplyTo, references }) {
  const headers = [
    `To: ${to}`,
    from ? `From: ${from}` : null,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    inReplyTo ? `In-Reply-To: ${inReplyTo}` : null,
    references ? `References: ${references}` : null,
  ].filter(Boolean);
  return toBase64Url(`${headers.join('\r\n')}\r\n\r\n${body}`);
}

/**
 * Send an email. Returns the REAL Gmail message id and thread id.
 * If threadId is provided, the message is attached to that thread (reply).
 */
export async function sendEmail(args) {
  if (transport) return transport.sendEmail(args);
  const { to, subject, body, threadId, inReplyTo, references } = args;
  const client = await getAuthedClient();
  const gmail = google.gmail({ version: 'v1', auth: client });
  const account = getAccountRow();
  const raw = buildRawMessage({
    to,
    from: account?.email,
    subject,
    body,
    inReplyTo,
    references,
  });
  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw, ...(threadId ? { threadId } : {}) },
  });
  return {
    messageId: res.data.id,
    threadId: res.data.threadId,
  };
}

/**
 * Fetch messages in a thread and return parsed inbound messages
 * (messages whose From is NOT the connected account).
 */
export async function getThreadMessages(threadId) {
  if (transport) return transport.getThreadMessages(threadId);
  const client = await getAuthedClient();
  const gmail = google.gmail({ version: 'v1', auth: client });
  const account = getAccountRow();
  const res = await gmail.users.threads.get({
    userId: 'me',
    id: threadId,
    format: 'full',
  });
  const myEmail = (account?.email || '').toLowerCase();
  const out = [];
  for (const m of res.data.messages || []) {
    const headers = Object.fromEntries(
      (m.payload?.headers || []).map((h) => [h.name.toLowerCase(), h.value]),
    );
    const from = (headers.from || '').toLowerCase();
    const direction = from.includes(myEmail) ? 'outbound' : 'inbound';
    out.push({
      gmailMessageId: m.id,
      gmailThreadId: m.threadId,
      from: headers.from,
      subject: headers.subject,
      snippet: m.snippet,
      body: extractPlainBody(m.payload),
      direction,
      internalDate: Number(m.internalDate || 0),
    });
  }
  return out;
}

function extractPlainBody(payload) {
  if (!payload) return '';
  const decode = (data) =>
    data ? Buffer.from(data, 'base64').toString('utf8') : '';
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return decode(payload.body.data);
  }
  if (payload.parts) {
    const plain = payload.parts.find((p) => p.mimeType === 'text/plain');
    if (plain?.body?.data) return decode(plain.body.data);
    for (const part of payload.parts) {
      const nested = extractPlainBody(part);
      if (nested) return nested;
    }
  }
  if (payload.body?.data) return decode(payload.body.data);
  return '';
}

/** Verify connectivity by fetching the Gmail profile. */
export async function testConnection() {
  const client = await getAuthedClient();
  const gmail = google.gmail({ version: 'v1', auth: client });
  const res = await gmail.users.getProfile({ userId: 'me' });
  return { emailAddress: res.data.emailAddress, messagesTotal: res.data.messagesTotal };
}
