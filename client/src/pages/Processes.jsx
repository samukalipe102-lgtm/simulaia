import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { useEvents } from '../hooks/useEvents.js';
import { Card, StatusBadge, Button, Input, Select, Spinner, EmptyState } from '../components/ui.jsx';

const STATUS = [
  { v: '', l: 'Todos' },
  { v: 'replied', l: 'Aguardando resposta' },
  { v: 'completed', l: 'Respondido' },
  { v: 'concluido', l: 'Concluído' },
];
const STATUS_LABEL = {
  replied: 'Aguardando resposta', awaiting_reply: 'Aguardando resposta',
  completed: 'Respondido', concluido: 'Concluído', generated: 'Aguardando análise',
};

function dt(ts) { return ts ? new Date((ts || '').replace(' ', 'T') + 'Z').toLocaleString('pt-BR') : '—'; }

export default function Processes() {
  const [rows, setRows] = useState(null);
  const [sel, setSel] = useState(null);
  const [detail, setDetail] = useState(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');

  async function load() {
    const p = new URLSearchParams();
    if (status) p.set('status', status);
    if (q) p.set('q', q);
    const list = await api.get(`/central/processes?${p}`);
    setRows(list);
    if (!sel && list.length) setSel(list[0].id);
  }
  async function loadDetail(id) { if (id) setDetail(await api.get(`/central/processes/${id}`)); }

  useEffect(() => { load(); }, [status]);
  useEffect(() => { loadDetail(sel); }, [sel]);
  useEvents(() => { load(); loadDetail(sel); });
  useEffect(() => { const t = setInterval(() => { load(); loadDetail(sel); }, 12000); return () => clearInterval(t); }, [sel]);

  async function sync() {
    setBusy(true); setToast('');
    try { const r = await api.post('/central/sync'); setToast(`${r.processes || 0} novo(s) processo(s), ${r.imported || 0} mensagem(ns).`); await load(); loadDetail(sel); }
    catch (e) { setToast(`Erro: ${e.message}`); }
    finally { setBusy(false); }
  }
  async function setStatusManual(id, s) {
    await api.put(`/central/processes/${id}/status`, { status: s });
    await load(); await loadDetail(sel);
  }

  if (!rows) return <Spinner />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Processos escolares</h1>
          <p className="text-xs text-slate-400">Solicitações recebidas por e-mail · acompanhamento</p>
        </div>
        <Button variant="secondary" onClick={sync} disabled={busy}>↻ Sincronizar e-mails</Button>
      </div>
      {toast && <div className="text-sm bg-slate-100 rounded-lg px-3 py-2">{toast}</div>}

      <div className="grid lg:grid-cols-[380px_1fr] gap-4 h-[calc(100vh-230px)] min-h-[520px]">
        <Card className="flex flex-col overflow-hidden">
          <div className="p-3 border-b border-slate-100 space-y-2">
            <Input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} placeholder="🔎 Nome, e-mail, assunto, protocolo" />
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUS.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}
            </Select>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {rows.length === 0 ? <EmptyState>Nenhum processo. Sincronize os e-mails.</EmptyState> : rows.map((r) => (
              <button key={r.id} onClick={() => setSel(r.id)}
                className={`w-full text-left px-4 py-3 hover:bg-slate-50 ${sel === r.id ? 'bg-brand-50 border-l-2 border-brand-600' : ''}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-800 truncate">{r.profile_name || r.sender_email || 'Remetente'}</span>
                  <span className="text-[11px] text-slate-400 shrink-0">{dt(r.updated_at)}</span>
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

        <Card className="flex flex-col overflow-hidden">
          {!detail ? <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">Selecione um processo.</div> : (
            <Detail detail={detail} onStatus={setStatusManual} />
          )}
        </Card>
      </div>
    </div>
  );
}

function Detail({ detail, onStatus }) {
  const { request, messages, attachments } = detail;
  return (
    <>
      <div className="p-4 border-b border-slate-100">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-semibold text-slate-800 truncate">{request.subject}</h2>
            <p className="text-xs text-slate-400">
              {request.public_id} · {request.sender_email || request.profile_name} · recebido {dt(request.sent_at || request.created_at)}
            </p>
          </div>
          <StatusBadge status={request.status} />
        </div>
        <div className="flex gap-2 mt-3">
          <select defaultValue="" onChange={(e) => e.target.value && onStatus(request.id, e.target.value)}
            className="text-xs border border-slate-300 rounded-lg px-2 py-1">
            <option value="">Ajustar status…</option>
            <option value="replied">Aguardando resposta</option>
            <option value="completed">Respondido</option>
            <option value="concluido">Concluído</option>
          </select>
          <span className="text-xs text-slate-400 self-center">Responda pelo seu Gmail — a resposta aparece aqui ao sincronizar.</span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
        {messages.map((m) => (
          <div key={m.id} className={`max-w-[85%] rounded-xl border p-3 text-sm ${m.direction === 'outbound' ? 'ml-auto bg-brand-600 text-white border-brand-600' : 'bg-white border-slate-200 text-slate-800'}`}>
            <div className={`text-[11px] mb-1 ${m.direction === 'outbound' ? 'text-brand-100' : 'text-slate-400'}`}>
              {m.direction === 'outbound' ? '↩️ Resposta enviada' : `✉️ ${m.author || 'Recebida'}`}
              {m.has_attachments ? ' · 📎 anexo' : ''} · {dt(m.created_at)}
            </div>
            <pre className={`whitespace-pre-wrap font-sans ${m.direction === 'outbound' ? 'text-white' : 'text-slate-700'}`}>{m.body}</pre>
          </div>
        ))}
      </div>
      {attachments.length > 0 && (
        <div className="p-3 border-t border-slate-100">
          <div className="text-xs font-medium text-slate-500 mb-2">📎 Documentos deste processo</div>
          <div className="flex flex-wrap gap-2">
            {attachments.map((a) => (
              <a key={a.id} href={`/api/central/attachments/${a.id}/download`} target="_blank" rel="noreferrer"
                className="text-xs bg-slate-100 hover:bg-slate-200 rounded-lg px-3 py-1.5 text-slate-700">
                {a.filename} ↓
              </a>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
