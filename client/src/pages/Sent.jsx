import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useEvents } from '../hooks/useEvents.js';
import { Card, CardHeader, Spinner, EmptyState } from '../components/ui.jsx';

function dt(ts) { return ts ? new Date((ts || '').replace(' ', 'T') + 'Z').toLocaleString('pt-BR') : '—'; }

export default function Sent() {
  const [rows, setRows] = useState(null);
  async function load() { setRows(await api.get('/central/sent')); }
  useEffect(() => { load(); }, []);
  useEvents(load);
  useEffect(() => { const t = setInterval(load, 12000); return () => clearInterval(t); }, []);

  if (!rows) return <Spinner />;
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-800">Respostas enviadas</h1>
      <p className="text-xs text-slate-400">Mensagens que você enviou manualmente pelo Gmail, sincronizadas aqui.</p>
      <Card>
        <CardHeader title="Enviadas (confirmadas pelo Gmail)" />
        {rows.length === 0 ? <EmptyState>Nenhuma resposta enviada ainda.</EmptyState> : (
          <div className="divide-y divide-slate-100">
            {rows.map((m) => (
              <div key={m.id} className="px-5 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-800 truncate">{m.subject}</span>
                  <span className="text-[11px] text-slate-400">{dt(m.created_at)}</span>
                </div>
                <div className="text-xs text-slate-400 truncate">{(m.body || '').slice(0, 160)}</div>
                <div className="text-[11px] text-brand-700 mt-1">{m.public_id} · msg {m.gmail_message_id}</div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
