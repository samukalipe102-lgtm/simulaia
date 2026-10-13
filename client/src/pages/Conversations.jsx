import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { Card, CardHeader, StatusBadge, Button, Spinner, EmptyState } from '../components/ui.jsx';

// Shows requests that are part of an email conversation (sent and beyond).
export default function Conversations() {
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function load() {
    const all = await api.get('/requests');
    setRows(all.filter((r) => r.gmail_thread_id));
  }
  useEffect(() => { load(); }, []);

  async function sync() {
    setBusy(true); setMsg('');
    try {
      const r = await api.post('/requests/sync');
      setMsg(`${r.imported} nova(s) resposta(s) importada(s).`);
      await load();
    } catch (e) { setMsg(`Erro: ${e.message}`); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">Conversas e e-mails</h1>
        <Button variant="secondary" onClick={sync} disabled={busy}>Sincronizar respostas</Button>
      </div>
      {msg && <div className="text-sm bg-slate-100 rounded-lg px-3 py-2">{msg}</div>}

      <Card>
        <CardHeader title="Threads do Gmail" subtitle="Cada conversa está isolada por solicitação" />
        {!rows ? <Spinner /> : rows.length === 0 ? (
          <EmptyState>Nenhuma conversa ainda. Envie uma solicitação para iniciar uma thread.</EmptyState>
        ) : (
          <div className="divide-y divide-slate-100">
            {rows.map((r) => (
              <Link key={r.id} to={`/solicitacoes/${r.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-slate-50">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-800 truncate">{r.subject}</div>
                  <div className="text-xs text-slate-400">
                    {r.public_id} · thread {r.gmail_thread_id} · {r.profile_name}
                  </div>
                </div>
                <StatusBadge status={r.status} />
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
