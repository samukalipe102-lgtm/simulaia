// Agendador do EduGestão Atendimento (central de acompanhamento).
//
// Dois jobs, ambos no servidor (funcionam com o navegador fechado):
//  1) syncTick  — sincroniza a caixa de entrada (e-mails recebidos + respostas
//                 manuais do admin). NUNCA responde automaticamente.
//  2) queueTick — processa UM envio administrativo da fila por vez, respeitando
//                 limite diário, intervalo em minutos, horários e dias.
//
// Para produção, rode este processo sob um supervisor (systemd/pm2/Docker). Ver
// DEPLOYMENT.md.

import cron from 'node-cron';
import { getSettings, log } from '../db/index.js';
import { syncInbox } from '../services/inbox.js';
import { processQueueStep } from '../services/adminQueue.js';
import { emitEvent } from '../services/events.js';
import { gmailConfigured } from '../config.js';

let syncRunning = false;
let queueRunning = false;
let tasks = [];

const runtime = {
  startedAt: null,
  lastSyncAt: null,
  lastQueueAt: null,
  lastError: null,
};
export function getRuntime() {
  return { ...runtime };
}

// Sincroniza a caixa de entrada respeitando o intervalo de polling configurável.
async function syncTick() {
  if (syncRunning) return;
  const settings = getSettings();
  if (!gmailConfigured(settings)) return;

  const interval = Math.max(1, Number(settings.poll_interval_minutes || 2));
  if (runtime.lastSyncAt) {
    const elapsed = (Date.now() - new Date(runtime.lastSyncAt).getTime()) / 60000;
    if (elapsed < interval) return;
  }

  syncRunning = true;
  try {
    const result = await syncInbox({ max: 30 });
    runtime.lastSyncAt = new Date().toISOString();
    if (result?.imported > 0 || result?.processes > 0) {
      emitEvent('inbox_synced', result);
    }
  } catch (err) {
    runtime.lastError = err.message;
    log('error', 'scheduler', `Erro ao sincronizar caixa de entrada: ${err.message}`);
  } finally {
    syncRunning = false;
  }
}

// Processa um envio administrativo da fila (um por tick → respeita o intervalo).
async function queueTick() {
  if (queueRunning) return;
  const settings = getSettings();
  if (settings.emergency_stop) return;
  if (!gmailConfigured(settings)) return;

  queueRunning = true;
  try {
    const r = await processQueueStep();
    runtime.lastQueueAt = new Date().toISOString();
    if (r?.sent) emitEvent('admin_sent', { id: r.id });
  } catch (err) {
    runtime.lastError = err.message;
    log('error', 'scheduler', `Erro no processamento da fila administrativa: ${err.message}`);
  } finally {
    queueRunning = false;
  }
}

export function startScheduler() {
  runtime.startedAt = new Date().toISOString();
  tasks.push(cron.schedule('* * * * *', syncTick));   // sincronização da caixa
  tasks.push(cron.schedule('* * * * *', queueTick));  // fila administrativa (1/tick)
  log('info', 'scheduler', 'Agendador iniciado (sincronização de caixa + fila administrativa).');
}

export function stopScheduler() {
  tasks.forEach((t) => t.stop());
  tasks = [];
}

export { syncTick, queueTick };