import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useEvents } from '../hooks/useEvents.js';
import { Card, CardHeader, Button, Spinner, EmptyState } from '../components/ui.jsx';

function dt(ts) { return ts ? new Date((ts || '').replace(' ', 'T') + 'Z').toLocaleString('pt-BR') : '—'; }

export default function Inbox() {
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);

  async function load() { setRows(await api.get('/central/inbox')); }
  useEffect(() => { load(); }, []);
  useEvents(load);
  useEffect(() => { const t = setInterval(load, 12000); return () => clearInterval(t); }, []);

  async function sync() {
    setBusy(true);
    try { await api.post('/central/sync'); await load(); } finally { setBusy(false); }
  }

  if (!rows) return <Spinner />;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">Caixa de entrada</h1>
        <Button variant="secondary" onClick={sync} disabled={busy}>↻ Sincronizar</Button>
      </div>
      <Card>
        <CardHeader title="Mensagens recebidas" subtitle="E-mails de alunos e responsáveis" />
        {rows.length === 0 ? <EmptyState>Nenhuma mensagem recebida ainda.</EmptyState> : (
          <div className="divide-y divide-slate-100">
            {rows.map((m) => (
              <div key={m.id} className="px-5 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-800 truncate">{m.author}</span>
                  <span className="text-[11px] text-slate-400">{dt(m.created_at)}</span>
                </div>
                <div className="text-sm text-slate-700">{m.subject} {m.has_attachments ? '📎' : ''}</div>
                <div className="text-xs text-slate-400 truncate">{(m.body || '').slice(0, 160)}</div>
                <div className="text-[11px] text-brand-700 mt-1">{m.public_id}</div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
