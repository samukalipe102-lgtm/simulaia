// Server-side scheduler. Runs independently of any browser/frontend session.
// Uses node-cron inside the long-running Node process, so it keeps working with
// the browser closed as long as the server/host process is running.
//
// For production, run this process under a supervisor (systemd, pm2, Docker
// restart policy, or a managed background worker). See DEPLOYMENT.md.

import cron from 'node-cron';
import { getSettings, log } from '../db/index.js';
import { listActiveAutomations, runAutomationStep, updateNextRun } from '../services/automation.js';
import { syncReplies } from '../services/requests.js';
import { gmailConfigured } from '../config.js';

let tickRunning = false;
let syncRunning = false;
let tasks = [];

async function tick() {
  if (tickRunning) return;
  tickRunning = true;
  try {
    const settings = getSettings();
    if (settings.emergency_stop) return; // all automations halted

    const automations = listActiveAutomations();
    for (const automation of automations) {
      const result = await runAutomationStep(automation.id);
      if (result.sent || result.error) {
        updateNextRun(automation.id);
      }
    }
  } catch (err) {
    log('error', 'scheduler', `Erro no tick do agendador: ${err.message}`);
  } finally {
    tickRunning = false;
  }
}

async function syncTick() {
  if (syncRunning) return;
  if (!gmailConfigured()) return;
  syncRunning = true;
  try {
    await syncReplies();
  } catch (err) {
    log('error', 'scheduler', `Erro ao sincronizar respostas: ${err.message}`);
  } finally {
    syncRunning = false;
  }
}

export function startScheduler() {
  // Automation tick: every minute, honoring per-automation interval/caps/hours.
  tasks.push(cron.schedule('* * * * *', tick));
  // Reply sync: every 2 minutes.
  tasks.push(cron.schedule('*/2 * * * *', syncTick));
  log('info', 'scheduler', 'Agendador iniciado (tick 1min, sync 2min).');
}

export function stopScheduler() {
  tasks.forEach((t) => t.stop());
  tasks = [];
}

// Exported for tests / manual trigger.
export { tick, syncTick };
