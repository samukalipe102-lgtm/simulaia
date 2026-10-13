import { useEffect, useRef } from 'react';
import { getToken } from '../lib/api.js';

// Assina os eventos do servidor (SSE). Chama onEvent a cada evento recebido.
// É um aprimoramento: o chamador mantém o polling como fallback.
export function useEvents(onEvent) {
  const cbRef = useRef(onEvent);
  cbRef.current = onEvent;

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    let es;
    try {
      es = new EventSource(`/api/events?token=${encodeURIComponent(token)}`);
      const handler = (e) => {
        try { cbRef.current?.(JSON.parse(e.data)); } catch { cbRef.current?.({}); }
      };
      ['sync', 'replies_imported', 'request_sent', 'request_error'].forEach((t) =>
        es.addEventListener(t, handler),
      );
    } catch {
      /* SSE indisponível — segue só com polling */
    }
    return () => { try { es?.close(); } catch { /* noop */ } };
  }, []);
}
