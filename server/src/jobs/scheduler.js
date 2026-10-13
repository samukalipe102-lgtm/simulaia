// Server-side scheduler. Runs independently of any browser/frontend session.
// Uses node-cron inside the long-running Node process, so it keeps working with
// the browser closed as long as the server/host process is running.
//
// For production, run this process under a supervisor (systemd, pm2, Docker
// restart policy, or a managed background worker). See DEPLOYMENT.md.

import cron from 'node-cron';
import { getSettings, log } from '../db/index.js';
import { listActiveAutomations, runAutomationStep, updateNextRun } from '../services/automation.js';
import { syncReplies, processConversations } from '../services/requests.js';
import { gmailConfigured } from '../config.js';

let tickRunning = false;
let syncRunning = false;
let tasks = [];

// In-memory runtime state surfaced to the dashboard (last sync, last tick, etc).
const runtime = {
  startedAt: null,
  lastTickAt: null,
  lastSyncAt: null,
  lastConversationRunAt: null,
  lastError: null,
};

export function getRuntime() {
  return { ...runtime };
}

// Generation/sending tick: honors per-automation interval/caps/hours.
async function tick() {
  if (tickRunning) return;
  tickRunning = true;
  try {
    runtime.lastTickAt = new Date().toISOString();
    const settings = getSettings();
    if (settings.emergency_stop) return; // all automations halted
    // Generation only runs when the master auto_mode is on.
    if (!settings.auto_mode) return;

    const automations = listActiveAutomations();
    for (const automation of automations) {
      const result = await runAutomationStep(automation.id);
      if (result.sent || result.error) {
        updateNextRun(automation.id);
      }
    }
  } catch (err) {
    runtime.lastError = err.message;
    log('error', 'scheduler', `Erro no tick do agendador: ${err.message}`);
  } finally {
    tickRunning = false;
  }
}

// Sync tick: import replies from Gmail, then run the conversation engine so
// classification + next-step decisions happen immediately. Respects the
// configurable poll interval (settings.poll_interval_minutes).
async function syncTick() {
  if (syncRunning) return;
  const settings = getSettings();
  if (settings.emergency_stop) return;
  if (!gmailConfigured(settings)) return;

  // Respect the configured polling interval (the cron fires every minute).
  const interval = Math.max(1, Number(settings.poll_interval_minutes || 2));
  if (runtime.lastSyncAt) {
    const elapsedMin = (Date.now() - new Date(runtime.lastSyncAt).getTime()) / 60000;
    if (elapsedMin < interval) return;
  }

  syncRunning = true;
  try {
    await syncReplies();
    runtime.lastSyncAt = new Date().toISOString();
    // Decide next steps for conversations that just got a reply.
    await processConversations();
    runtime.lastConversationRunAt = new Date().toISOString();
  } catch (err) {
    runtime.lastError = err.message;
    log('error', 'scheduler', `Erro ao sincronizar/processar conversas: ${err.message}`);
  } finally {
    syncRunning = false;
  }
}

export function startScheduler() {
  runtime.startedAt = new Date().toISOString();
  // Generation tick: every minute (gated by auto_mode + per-automation rules).
  tasks.push(cron.schedule('* * * * *', tick));
  // Sync + conversation engine: every minute, throttled to poll_interval_minutes.
  tasks.push(cron.schedule('* * * * *', syncTick));
  log('info', 'scheduler', 'Agendador iniciado (geração + sincronização/decisão de conversas).');
}

export function stopScheduler() {
  tasks.forEach((t) => t.stop());
  tasks = [];
}

// Exported for tests / manual trigger.
export { tick, syncTick };
