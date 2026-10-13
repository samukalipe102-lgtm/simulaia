import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { Card, CardHeader, StatusBadge, Button, Input, Select, Spinner, EmptyState } from '../components/ui.jsx';

const STATUSES = [
  '', 'generated', 'scheduled', 'sent', 'awaiting_reply',
  'replied', 'awaiting_approval', 'completed', 'paused', 'error',
];

export default function Requests() {
  const [rows, setRows] = useState(null);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function load() {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (q) params.set('q', q);
    setRows(await api.get(`/requests?${params.toString()}`));
  }
  useEffect(() => { load(); }, [status]);

  async function generate() {
    setBusy(true); setMsg('');
    try {
      const r = await api.post('/requests/generate', {});
      setMsg(`Gerada: ${r.public_id}`);
      await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(false); }
  }

  async function send(id) {
    setBusy(true); setMsg('');
    try {
      await api.post(`/requests/${id}/send`);
      setMsg('E-mail enviado.');
      await load();
    } catch (e) { setMsg(`Erro: ${e.message}`); }
    finally { setBusy(false); }
  }

  async function sync() {
    setBusy(true); setMsg('');
    try {
      const r = await api.post('/requests/sync');
      setMsg(`Sincronização: ${r.imported} nova(s) resposta(s).`);
      await load();
    } catch (e) { setMsg(`Erro: ${e.message}`); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-slate-800">Solicitações escolares</h1>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={sync} disabled={busy}>Sincronizar respostas</Button>
          <Button onClick={generate} disabled={busy}>+ Gerar solicitação (IA)</Button>
        </div>
      </div>

      {msg && <div className="text-sm bg-slate-100 rounded-lg px-3 py-2">{msg}</div>}

      <Card>
        <div className="flex flex-wrap items-end gap-3 p-4 border-b border-slate-100">
          <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)} className="w-56">
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s === '' ? 'Todos' : s}</option>
            ))}
          </Select>
          <Input label="Buscar" value={q} onChange={(e) => setQ(e.target.value)} placeholder="assunto, ID, perfil" className="w-64" />
          <Button variant="secondary" onClick={load}>Filtrar</Button>
        </div>

        {!rows ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState>Nenhuma solicitação. Clique em “Gerar solicitação (IA)”.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-left">
                <tr>
                  <th className="px-4 py-2 font-medium">ID</th>
                  <th className="px-4 py-2 font-medium">Assunto</th>
                  <th className="px-4 py-2 font-medium">Perfil</th>
                  <th className="px-4 py-2 font-medium">Categoria</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2 text-slate-500">{r.public_id}</td>
                    <td className="px-4 py-2">
                      <Link to={`/solicitacoes/${r.id}`} className="text-brand-700 hover:underline">
                        {r.subject}
                      </Link>
                    </td>
                    <td className="px-4 py-2">{r.profile_name} <span className="text-xs text-slate-400">({r.profile_role})</span></td>
                    <td className="px-4 py-2">{r.category}</td>
                    <td className="px-4 py-2"><StatusBadge status={r.status} /></td>
                    <td className="px-4 py-2">
                      <div className="flex gap-2">
                        {['generated', 'scheduled', 'error'].includes(r.status) && (
                          <Button variant="success" className="!px-3 !py-1" onClick={() => send(r.id)} disabled={busy}>
                            Enviar
                          </Button>
                        )}
                        <Link to={`/solicitacoes/${r.id}`}>
                          <Button variant="ghost" className="!px-3 !py-1">Detalhes</Button>
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
