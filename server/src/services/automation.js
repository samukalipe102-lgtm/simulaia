// Automation engine. Decides when an automation may send, respecting daily
// caps, intervals, allowed days/hours, duration windows, emergency stop and
// test mode. This logic is driven by the server-side scheduler (jobs/scheduler.js)
// and does NOT depend on any browser being open.

import { db, log, getSettings, solicitationRecipient } from '../db/index.js';
import { createSimulatedRequest, sendRequest, isDuplicate } from './requests.js';

function parseList(str) {
  return (str || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

/** Reset the daily counter when the day changes. */
function rolloverDaily(automation) {
  const today = todayStr();
  if (automation.sent_today_date !== today) {
    db.prepare(
      `UPDATE automations SET sent_today = 0, sent_today_date = ? WHERE id = ?`,
    ).run(today, automation.id);
    automation.sent_today = 0;
    automation.sent_today_date = today;
  }
  return automation;
}

/** Returns {ok, reason} describing whether an automation may send right now. */
export function canSendNow(automation, now = new Date()) {
  const settings = getSettings();
  if (settings.emergency_stop) return { ok: false, reason: 'emergency_stop' };
  if (automation.status !== 'active') return { ok: false, reason: 'not_active' };

  // Duration window.
  if (automation.starts_at && now < new Date(automation.starts_at)) {
    return { ok: false, reason: 'not_started' };
  }
  if (automation.ends_at && now > new Date(automation.ends_at)) {
    return { ok: false, reason: 'ended' };
  }

  // Allowed days.
  const allowedDays = parseList(automation.allowed_days).map(Number);
  if (allowedDays.length && !allowedDays.includes(now.getDay())) {
    return { ok: false, reason: 'day_not_allowed' };
  }

  // Allowed hours.
  const hour = now.getHours();
  if (hour < automation.start_hour || hour >= automation.end_hour) {
    return { ok: false, reason: 'hour_not_allowed' };
  }

  // Daily cap.
  rolloverDaily(automation);
  if (automation.sent_today >= automation.max_per_day) {
    return { ok: false, reason: 'daily_cap_reached' };
  }

  // Interval between sends.
  if (automation.last_run_at) {
    const elapsedMin = (now - new Date(automation.last_run_at)) / 60000;
    if (elapsedMin < automation.interval_minutes) {
      return { ok: false, reason: 'interval_not_elapsed' };
    }
  }

  return { ok: true };
}

/**
 * Execute a single automation step: generate one request and send it (or draft
 * for approval). Returns a summary. Retries with attempt counting on failure.
 */
export async function runAutomationStep(automationId) {
  let automation = db.prepare('SELECT * FROM automations WHERE id = ?').get(automationId);
  if (!automation) return { skipped: true, reason: 'not_found' };

  automation = rolloverDaily(automation);
  const check = canSendNow(automation);
  if (!check.ok) return { skipped: true, reason: check.reason };

  const settings = getSettings();
  // Solicitações da IA vão para o Outlook oficial de atendimento.
  const recipient = automation.recipient || solicitationRecipient();

  if (!recipient) {
    log('warn', 'automation', `Automação ${automation.name} sem e-mail de destino (Outlook).`, {
      automationId,
    });
    return { skipped: true, reason: 'no_recipient' };
  }

  try {
    const request = await createSimulatedRequest({
      categories: parseList(automation.categories),
      profileIds: parseList(automation.profile_ids).map(Number),
      automationId,
      recipient,
    });

    if (isDuplicate(request.subject, recipient)) {
      db.prepare(
        `UPDATE requests SET status = 'error', last_error = 'duplicado' WHERE id = ?`,
      ).run(request.id);
      return { skipped: true, reason: 'duplicate' };
    }

    // require_approval here controls FOLLOW-UPS; initial simulated sends go out
    // in test mode to the authorized recipient. Mark scheduled -> send.
    db.prepare(`UPDATE requests SET status = 'scheduled' WHERE id = ?`).run(request.id);

    await sendWithRetry(request.id, automation.max_attempts);

    db.prepare(
      `UPDATE automations SET sent_today = sent_today + 1, sent_today_date = ?,
        last_run_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
    ).run(todayStr(), automationId);

    log('info', 'automation', `Automação ${automation.name}: solicitação enviada.`, {
      automationId,
      requestId: request.id,
    });
    return { sent: true, requestId: request.id };
  } catch (err) {
    log('error', 'automation', `Automação ${automation.name} falhou: ${err.message}`, {
      automationId,
    });
    return { error: err.message };
  }
}

async function sendWithRetry(requestId, maxAttempts) {
  let lastErr;
  for (let attempt = 1; attempt <= Math.max(1, maxAttempts); attempt++) {
    try {
      return await sendRequest(requestId);
    } catch (err) {
      lastErr = err;
      // Backoff between retries (short, since scheduler is tick-based).
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  throw lastErr;
}

/** Compute and store the next planned run time (best-effort estimate). */
export function updateNextRun(automationId, now = new Date()) {
  const automation = db.prepare('SELECT * FROM automations WHERE id = ?').get(automationId);
  if (!automation) return;
  const next = new Date(now.getTime() + automation.interval_minutes * 60000);
  db.prepare(`UPDATE automations SET next_run_at = ? WHERE id = ?`).run(
    next.toISOString(),
    automationId,
  );
}

export function listActiveAutomations() {
  return db.prepare(`SELECT * FROM automations WHERE status = 'active'`).all();
}
