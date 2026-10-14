// Monitor de saúde REAL do EduGestão. Executa verificações concretas (sem
// simular monitoramento) e registra/avisa problemas detectados. NÃO corrige
// código automaticamente — a correção de código é feita via GitHub (humano + CI).
import { db, log, getSettings, solicitationRecipient } from '../db/index.js';
import * as gmail from './gmail.js';
import { gmailConfigured } from '../config.js';

// Executa a bateria de verificações e retorna problemas concretos encontrados.
export async function runHealthChecks() {
  const settings = getSettings();
  const issues = [];
  const add = (severity, code, message, fix) => issues.push({ severity, code, message, fix });

  // 1) Gmail configurado e conectado?
  if (!gmailConfigured(settings)) {
    add('warn', 'gmail_not_configured', 'Credenciais do Gmail ausentes.', 'Informe Client ID/Secret em Integração Gmail.');
  } else {
    try {
      await gmail.testConnection();
    } catch (err) {
      add('error', 'gmail_not_connected', `Gmail não conectado: ${err.message}`, 'Conclua a autorização OAuth em Integração Gmail.');
    }
  }

  // 2) Destino das solicitações (Outlook) definido?
  if (!solicitationRecipient()) {
    add('warn', 'no_destination', 'E-mail de destino (Outlook) não definido.', 'Defina o e-mail oficial do Outlook em Configurações.');
  }

  // 3) Falhas recentes de envio na fila administrativa?
  const failed = db.prepare("SELECT COUNT(*) AS c FROM admin_queue WHERE status = 'failed'").get().c;
  if (failed > 0) add('warn', 'admin_queue_failures', `${failed} envio(s) administrativo(s) com falha na fila.`, 'Verifique a conexão/limites e reprocdese a fila.');

  // 4) Erros recentes registrados (última hora)?
  const recentErrors = db
    .prepare("SELECT COUNT(*) AS c FROM activity_log WHERE level='error' AND datetime(created_at) > datetime('now','-1 hour')")
    .get().c;
  if (recentErrors >= 5) add('warn', 'recent_errors', `${recentErrors} erros registrados na última hora.`, 'Consulte Relatórios/registros para investigar.');

  // 5) Parada de emergência acionada?
  if (settings.emergency_stop) add('info', 'emergency_active', 'Parada de emergência acionada (envios automáticos pausados).', 'Libere a parada de emergência quando desejar retomar.');

  return {
    checkedAt: new Date().toISOString(),
    healthy: issues.filter((i) => i.severity === 'error').length === 0,
    issues,
  };
}

// Guarda um resumo do último check para o painel (em memória).
let lastHealth = null;
export function getLastHealth() { return lastHealth; }
export async function monitorTick() {
  try {
    lastHealth = await runHealthChecks();
    const errors = lastHealth.issues.filter((i) => i.severity === 'error');
    if (errors.length) {
      log('warn', 'monitor', `Monitor detectou ${errors.length} problema(s) crítico(s): ${errors.map((e) => e.code).join(', ')}`);
    }
    return lastHealth;
  } catch (err) {
    log('error', 'monitor', `Falha no monitor de saúde: ${err.message}`);
    return null;
  }
}
