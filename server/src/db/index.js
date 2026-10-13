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

// Add a column only if it does not already exist (idempotent migration helper).
function ensureColumn(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export function migrate() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);

  // --- Safe migrations for databases created before new columns were added ---

  // Google credentials configurable from the UI (added earlier).
  ensureColumn('settings', 'google_client_id', 'TEXT');
  ensureColumn('settings', 'google_client_secret', 'TEXT');

  // EduGestão institution identity.
  ensureColumn('settings', 'institution_name', "TEXT NOT NULL DEFAULT 'EduGestão Atendimento'");
  ensureColumn('settings', 'institution_email', "TEXT NOT NULL DEFAULT 'adminedugestao@gmail.com'");
  ensureColumn('settings', 'default_sector', "TEXT NOT NULL DEFAULT 'Atendimento Escolar'");

  // Full-automation settings (single setup + autonomous operation).
  ensureColumn('settings', 'setup_completed', 'INTEGER NOT NULL DEFAULT 0');
  // auto_mode: master switch for the end-to-end automatic flow.
  ensureColumn('settings', 'auto_mode', 'INTEGER NOT NULL DEFAULT 0');
  // auto_followup_approved: explicit admin authorization to send follow-ups
  // automatically (required before any auto-send of follow-ups).
  ensureColumn('settings', 'auto_followup_approved', 'INTEGER NOT NULL DEFAULT 0');
  // real_mode: quando ligado, as mensagens são profissionais (sem rótulos de
  // simulação). O destinatário continua restrito ao autorizado (sua caixa).
  // Padrão agora é LIGADO — mensagens com aparência real por padrão.
  ensureColumn('settings', 'real_mode', 'INTEGER NOT NULL DEFAULT 1');
  // How often the server polls Gmail for new replies (minutes).
  ensureColumn('settings', 'poll_interval_minutes', 'INTEGER NOT NULL DEFAULT 2');

  // Conversation state tracking on requests.
  ensureColumn('requests', 'conversation_state', "TEXT NOT NULL DEFAULT 'open'");
  // open | awaiting_info | needs_followup | resolved | closed | needs_admin
  ensureColumn('requests', 'followup_count', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('requests', 'max_followups', 'INTEGER NOT NULL DEFAULT 3');
  ensureColumn('requests', 'last_classification', 'TEXT');

  // Per-message AI classification of inbound replies.
  ensureColumn('messages', 'classification', 'TEXT');

  // Per-automation autonomous follow-up controls.
  ensureColumn('automations', 'auto_followup', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('automations', 'max_followups_per_conversation', 'INTEGER NOT NULL DEFAULT 3');

  // Reforma "central de acompanhamento": origem do processo e flags de anexos.
  // source: 'inbound' (recebido por e-mail) | 'generated' (legado) | 'admin'
  ensureColumn('requests', 'source', "TEXT NOT NULL DEFAULT 'generated'");
  ensureColumn('requests', 'sender_email', 'TEXT');  // e-mail do remetente (inbound)
  ensureColumn('messages', 'has_attachments', 'INTEGER NOT NULL DEFAULT 0');

  // Garante a linha única de configuração da automação administrativa.
  const adminCfg = db.prepare('SELECT id FROM admin_automation WHERE id = 1').get();
  if (!adminCfg) {
    db.prepare('INSERT INTO admin_automation (id) VALUES (1)').run();
  }

  // Ensure the singleton settings row exists.
  const existing = db.prepare('SELECT id FROM settings WHERE id = 1').get();
  if (!existing) {
    db.prepare(
      `INSERT INTO settings (id, emergency_stop, test_mode, authorized_recipient, real_mode)
       VALUES (1, 0, ?, ?, 1)`,
    ).run(config.testMode ? 1 : 0, config.authorizedRecipient || null);
  }

  // Migração única: liga o modo real em bancos antigos (o usuário quer mensagens
  // reais por padrão). Executa só uma vez, controlada por real_mode_migrated.
  ensureColumn('settings', 'real_mode_migrated', 'INTEGER NOT NULL DEFAULT 0');
  const row = db.prepare('SELECT real_mode_migrated FROM settings WHERE id = 1').get();
  if (row && !row.real_mode_migrated) {
    db.prepare('UPDATE settings SET real_mode = 1, real_mode_migrated = 1 WHERE id = 1').run();
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
