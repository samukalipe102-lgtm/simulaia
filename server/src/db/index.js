import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Ensure the data directory exists.
const dir = path.dirname(config.databaseFile);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

export const db = new Database(config.databaseFile);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function migrate() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);

  // Ensure the singleton settings row exists.
  const existing = db.prepare('SELECT id FROM settings WHERE id = 1').get();
  if (!existing) {
    db.prepare(
      `INSERT INTO settings (id, emergency_stop, test_mode, authorized_recipient)
       VALUES (1, 0, ?, ?)`,
    ).run(config.testMode ? 1 : 0, config.authorizedRecipient || null);
  }
}

export function getSettings() {
  return db.prepare('SELECT * FROM settings WHERE id = 1').get();
}

export function log(level, category, message, extra = {}) {
  db.prepare(
    `INSERT INTO activity_log (level, category, message, request_id, automation_id)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(
    level,
    category,
    message,
    extra.requestId ?? null,
    extra.automationId ?? null,
  );
}
