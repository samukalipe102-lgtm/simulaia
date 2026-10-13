// Barramento de eventos em memória para atualização em tempo real (SSE).
// Os clientes autenticados assinam /api/events e recebem eventos do servidor
// (sincronização, novas respostas, mudanças de status). Há fallback de polling
// no frontend, então o SSE é um aprimoramento, não um requisito rígido.
import { EventEmitter } from 'node:events';

const bus = new EventEmitter();
bus.setMaxListeners(100);

export function emitEvent(type, payload = {}) {
  bus.emit('event', { type, payload, at: new Date().toISOString() });
}

export function onEvent(listener) {
  bus.on('event', listener);
  return () => bus.off('event', listener);
}
