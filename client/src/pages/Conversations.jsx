import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useEvents } from '../hooks/useEvents.js';
import { Card, StatusBadge, Button, Input, Spinner, EmptyState } from '../components/ui.jsx';

const FILTERS = [
  { v: '', l: 'Todas' },
  { v: 'awaiting_reply', l: 'Aguardando resposta' },
  { v: 'replied', l: 'Respondidas' },
  { v: 'awaiting_approval', l: 'Aguardando aprovação' },
  { v: 'completed', l: 'Concluídas' },
  { v: 'error', l: 'Com erro' },
];

function timeAgo(ts) {
  if (!ts) return '';
  const d = new Date(ts.replace(' ', 'T') + 'Z');
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'agora';
  if (diff < 3600) return `${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h`;
  return d.toLocaleDateString('pt-BR');
}

export default function Conversations() {
  const [rows, setRows] = useState(null);
  const [selId, setSelId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');

  async function loadList() {
    const all = await api.get('/requests');
    const convos = all.filter((r) => r.gmail_thread_id);
    setRows(convos);
    if (!selId && convos.length) setSelId(convos[0].id);
  }
  async function loadDetail(id) {
    if (!id) return;
    setDetail(await api.get(`/requests/${id}`));
  }

  useEffect(() => { loadList(); }, []);
  useEffect(() => { loadDetail(selId); }, [selId]);

  // Tempo real: ao receber eventos do servidor, atualiza lista e conversa aberta.
  useEvents(() => { loadList(); loadDetail(selId); });
  // Fallback de polling.
  useEffect(() => {
    const t = setInterval(() => { loadList(); loadDetail(selId); }, 10000);
    return () => clearInterval(t);
  }, [selId]);

  async function sync() {
    setBusy(true); setToast('');
    try {
      const r = await api.post('/requests/sync');
      await api.post('/requests/process').catch(() => {});
      setToast(`${r.imported} nova(s) resposta(s) importada(s).`);
      await loadList(); await loadDetail(selId);
    } catch (e) { setToast(`Erro: ${e.message}`); }
    finally { setBusy(false); }
  }

  async function action(fn, okMsg) {
    setBusy(true); setToast('');
    try { await fn(); setToast(okMsg); await loadList(); await loadDetail(selId); }
    catch (e) { setToast(`Erro: ${e.message}`); }
    finally { setBusy(false); }
  }

  const filtered = useMemo(() => {
    let list = rows || [];
    if (filter) list = list.filter((r) => r.status === filter);
    if (q) {
      const s = q.toLowerCase();
      list = list.filter((r) =>
        r.subject.toLowerCase().includes(s) ||
        r.public_id.toLowerCase().includes(s) ||
        (r.profile_name || '').toLowerCase().includes(s));
    }
    return list;
  }, [rows, filter, q]);

  if (!rows) return <Spinner />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Caixa de entrada</h1>
          <p className="text-xs text-slate-400">Central de atendimento por e-mail · atualização em tempo real</p>
        </div>
        <Button variant="secondary" onClick={sync} disabled={busy}>↻ Sincronizar</Button>
      </div>
      {toast && <div className="text-sm bg-slate-100 rounded-lg px-3 py-2">{toast}</div>}

      <div className="grid lg:grid-cols-[360px_1fr] gap-4 h-[calc(100vh-220px)] min-h-[520px]">
        {/* Lista de conversas */}
        <Card className="flex flex-col overflow-hidden">
          <div className="p-3 border-b border-slate-100 space-y-2">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔎 Buscar assunto, protocolo ou remetente" />
            <div className="flex flex-wrap gap-1">
              {FILTERS.map((f) => (
                <button key={f.v} onClick={() => setFilter(f.v)}
                  className={`px-2.5 py-1 rounded-full text-xs border ${filter === f.v ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-600 border-slate-200'}`}>
                  {f.l}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <EmptyState>Nenhuma conversa.</EmptyState>
            ) : filtered.map((r) => (
              <button key={r.id} onClick={() => setSelId(r.id)}
                className={`w-full text-left px-4 py-3 hover:bg-slate-50 ${selId === r.id ? 'bg-brand-50 border-l-2 border-brand-600' : ''}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-800 truncate">{r.profile_name || 'Remetente'}</span>
                  <span className="text-[11px] text-slate-400 shrink-0">{timeAgo(r.updated_at)}</span>
                </div>
                <div className="text-sm text-slate-600 truncate">{r.subject}</div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[11px] text-slate-400">{r.public_id}</span>
                  <StatusBadge status={r.status} />
                </div>
              </button>
            ))}
          </div>
        </Card>

        {/* Painel de leitura */}
        <Card className="flex flex-col overflow-hidden">
          {!detail ? (
            <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
              Selecione uma conversa para ler.
            </div>
          ) : (
            <ReadingPane detail={detail} busy={busy} action={action} />
          )}
        </Card>
      </div>
    </div>
  );
}

function ReadingPane({ detail, busy, action }) {
  const { request, messages } = detail;
  return (
    <>
      <div className="p-4 border-b border-slate-100 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold text-slate-800 truncate">{request.subject}</h2>
          <p className="text-xs text-slate-400">
            {request.public_id} · {request.profile_name} · thread {request.gmail_thread_id || '—'}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StatusBadge status={request.status} />
          <Link to={`/solicitacoes/${request.id}`}>
            <Button variant="ghost" className="!px-3 !py-1">Abrir</Button>
          </Link>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
        {messages.length === 0 && <p className="text-sm text-slate-400">Sem mensagens ainda.</p>}
        {messages.map((m) => (
          <div key={m.id}
            className={`max-w-[85%] rounded-xl border p-3 text-sm ${
              m.direction === 'outbound'
                ? 'ml-auto bg-brand-600 text-white border-brand-600'
                : 'bg-white border-slate-200 text-slate-800'}`}>
            <div className={`text-[11px] mb-1 ${m.direction === 'outbound' ? 'text-brand-100' : 'text-slate-400'}`}>
              {m.direction === 'outbound' ? '→ EduGestão Atendimento' : `← ${m.author || 'Resposta'}`}
              {m.is_followup ? ' · acompanhamento' : ''}
              {' · '}{new Date((m.created_at || '').replace(' ', 'T') + 'Z').toLocaleString('pt-BR')}
            </div>
            <pre className={`whitespace-pre-wrap font-sans ${m.direction === 'outbound' ? 'text-white' : 'text-slate-700'}`}>{m.body}</pre>
            {m.approval_status === 'pending' && (
              <div className="flex gap-2 mt-2">
                <Button variant="success" className="!px-3 !py-1" disabled={busy}
                  onClick={() => action(() => api.post(`/requests/messages/${m.id}/approve`), 'Acompanhamento enviado.')}>Aprovar e enviar</Button>
                <Button variant="danger" className="!px-3 !py-1" disabled={busy}
                  onClick={() => action(() => api.post(`/requests/messages/${m.id}/reject`), 'Acompanhamento rejeitado.')}>Rejeitar</Button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="p-3 border-t border-slate-100 flex flex-wrap gap-2">
        {['generated', 'scheduled', 'error'].includes(request.status) && (
          <Button variant="success" disabled={busy}
            onClick={() => action(() => api.post(`/requests/${request.id}/send`), 'E-mail enviado.')}>Enviar agora</Button>
        )}
        {request.status === 'replied' && (
          <Button disabled={busy}
            onClick={() => action(() => api.post(`/requests/${request.id}/followup`), 'Acompanhamento gerado (aguardando aprovação).')}>Gerar acompanhamento</Button>
        )}
        <span className="text-xs text-slate-400 self-center">
          Responda diretamente pelo seu Gmail — as respostas aparecem aqui automaticamente.
        </span>
      </div>
    </>
  );
}
