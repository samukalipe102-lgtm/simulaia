import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// In the desktop (Electron) build the .env lives in the user's writable data
// folder; its path is passed via DOTENV_PATH. Otherwise dotenv reads ./.env.
dotenv.config(process.env.DOTENV_PATH ? { path: process.env.DOTENV_PATH } : undefined);

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function bool(v, fallback = false) {
  if (v === undefined || v === null || v === '') return fallback;
  return String(v).toLowerCase() === 'true' || v === '1';
}

export const config = {
  port: Number(process.env.PORT || 4000),
  nodeEnv: process.env.NODE_ENV || 'development',
  clientOrigins: (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  jwtSecret: process.env.JWT_SECRET || 'insecure-dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',

  adminEmail: process.env.ADMIN_EMAIL || 'admin@simulaescola.local',
  adminPassword: process.env.ADMIN_PASSWORD || 'change-this-password',

  databaseFile: path.resolve(
    __dirname,
    '..',
    process.env.DATABASE_FILE || './data/simula.db',
  ),

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri:
      process.env.GOOGLE_REDIRECT_URI ||
      'http://localhost:4000/api/gmail/oauth/callback',
    scopes: [
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
  },

  testMode: bool(process.env.TEST_MODE, true),
  authorizedRecipient: process.env.AUTHORIZED_RECIPIENT || '',

  // Optional: absolute path to the built frontend (client/dist). When set and
  // present, the backend serves the UI as a single service (prod deploy).
  clientDist: process.env.CLIENT_DIST || '',

  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  },
};

// Resolve the effective Google OAuth credentials. Values saved in the database
// (via the UI) take precedence over environment variables. This lets the
// desktop app be configured entirely from the interface, with no .env editing.
// `settingsRow` is optional; pass it to avoid a circular import on the db module.
export function resolveGoogleCreds(settingsRow) {
  const clientId = settingsRow?.google_client_id || config.google.clientId || '';
  const clientSecret =
    settingsRow?.google_client_secret || config.google.clientSecret || '';
  return { clientId, clientSecret, redirectUri: config.google.redirectUri, scopes: config.google.scopes };
}

export function gmailConfigured(settingsRow) {
  const { clientId, clientSecret } = resolveGoogleCreds(settingsRow);
  return Boolean(clientId && clientSecret);
}
