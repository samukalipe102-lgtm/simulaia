import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useEvents } from '../hooks/useEvents.js';
import { Card, CardHeader, Button, Input, StatusBadge, Spinner, EmptyState } from '../components/ui.jsx';

const DAYS = [
  { v: 1, l: 'Seg' }, { v: 2, l: 'Ter' }, { v: 3, l: 'Qua' },
  { v: 4, l: 'Qui' }, { v: 5, l: 'Sex' }, { v: 6, l: 'Sáb' }, { v: 0, l: 'Dom' },
];
const QSTATUS = { pending: 'Pendente', processing: 'Processando', sent: 'Enviado', failed: 'Falha' };
function dt(ts) { return ts ? new Date((ts || '').replace(' ', 'T') + 'Z').toLocaleString('pt-BR') : '—'; }

export default function AdminAutomation() {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [enq, setEnq] = useState({ subject: '', body: '' });
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');

  async function load() {
    const d = await api.get('/central/admin-automation');
    setData(d);
    if (!form) setForm({
      daily_limit: d.config.daily_limit, interval_minutes: d.config.interval_minutes,
      start_hour: d.config.start_hour, end_hour: d.config.end_hour, allowed_days: d.config.allowed_days,
    });
  }
  useEffect(() => { load(); }, []);
  useEvents(load);
  useEffect(() => { const t = setInterval(load, 10000); return () => clearInterval(t); }, []);

  function toggleDay(v) {
    const set = new Set(String(form.allowed_days).split(',').filter(Boolean).map(Number));
    set.has(v) ? set.delete(v) : set.add(v);
    setForm({ ...form, allowed_days: [...set].sort().join(',') });
  }
  async function save() {
    setBusy(true); setToast('');
    try { await api.put('/central/admin-automation', { ...form, daily_limit: Number(form.daily_limit), interval_minutes: Number(form.interval_minutes), start_hour: Number(form.start_hour), end_hour: Number(form.end_hour) }); setToast('Configuração salva.'); await load(); }
    catch (e) { setToast(`Erro: ${e.message}`); } finally { setBusy(false); }
  }
  async function act(a) { setBusy(true); try { await api.post(`/central/admin-automation/${a}`); await load(); } finally { setBusy(false); } }
  async function doEnqueue() {
    setBusy(true); setToast('');
    try { const r = await api.post('/central/admin-automation/enqueue', enq); setToast(r.duplicated ? 'Já estava na fila (duplicado evitado).' : 'Adicionado à fila.'); setEnq({ subject: '', body: '' }); await load(); }
    catch (e) { setToast(`Erro: ${e.message}`); } finally { setBusy(false); }
  }

  if (!data || !form) return <Spinner />;
  const { config, stats, queue } = data;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Automação de envios administrativos</h1>
          <p className="text-xs text-slate-400">Envia apenas mensagens administrativas autorizadas — nunca responde a solicitações.</p>
        </div>
        <StatusBadge status={config.status === 'active' ? 'active' : 'paused'} />
      </div>
      {toast && <div className="text-sm bg-slate-100 rounded-lg px-3 py-2">{toast}</div>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Enviados hoje" value={stats.sent_today} />
        <Stat label="Limite diário" value={stats.daily_limit} />
        <Stat label="Restантes hoje" value={stats.remaining ?? '∞'} />
        <Stat label="Na fila" value={stats.counts.pending} />
      </div>

      <Card>
        <CardHeader title="Regras de envio" subtitle="Aplicadas no servidor (um envio por vez, respeitando o intervalo)" />
        <div className="p-5 grid md:grid-cols-3 gap-4">
          <Input label="Limite diário (0 = sem limite)" type="number" min="0" value={form.daily_limit} onChange={(e) => setForm({ ...form, daily_limit: e.target.value })} />
          <Input label="Intervalo entre envios (min)" type="number" min="1" value={form.interval_minutes} onChange={(e) => setForm({ ...form, interval_minutes: e.target.value })} />
          <div />
          <Input label="Hora início (0-23)" type="number" min="0" max="23" value={form.start_hour} onChange={(e) => setForm({ ...form, start_hour: e.target.value })} />
          <Input label="Hora fim (0-23)" type="number" min="0" max="24" value={form.end_hour} onChange={(e) => setForm({ ...form, end_hour: e.target.value })} />
          <div />
          <div className="md:col-span-3">
            <span className="block text-sm font-medium text-slate-700 mb-2">Dias permitidos</span>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((d) => {
                const active = String(form.allowed_days).split(',').map(Number).includes(d.v);
                return <button key={d.v} type="button" onClick={() => toggleDay(d.v)}
                  className={`px-3 py-1 rounded-lg text-sm border ${active ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-600 border-slate-300'}`}>{d.l}</button>;
              })}
            </div>
          </div>
          <div className="md:col-span-3 flex gap-2">
            <Button onClick={save} disabled={busy}>Salvar regras</Button>
            {config.status === 'active'
              ? <Button variant="secondary" onClick={() => act('pause')} disabled={busy}>Pausar</Button>
              : <Button variant="success" onClick={() => act('activate')} disabled={busy}>Ativar</Button>}
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Adicionar e-mail administrativo à fila" subtitle="Enviado ao destinatário autorizado conforme as regras acima" />
        <div className="p-5 space-y-3">
          <Input label="Assunto" value={enq.subject} onChange={(e) => setEnq({ ...enq, subject: e.target.value })} />
          <label className="block">
            <span className="block text-sm font-medium text-slate-700 mb-1">Mensagem</span>
            <textarea rows={4} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" value={enq.body} onChange={(e) => setEnq({ ...enq, body: e.target.value })} />
          </label>
          <Button onClick={doEnqueue} disabled={busy || !enq.subject || !enq.body}>Adicionar à fila</Button>
        </div>
      </Card>

      <Card>
        <CardHeader title="Fila de envios" subtitle="Pendentes, processados e com falha" />
        {queue.length === 0 ? <EmptyState>Fila vazia.</EmptyState> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-left">
                <tr><th className="px-4 py-2">Destinatário</th><th className="px-4 py-2">Assunto</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">Enviado</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {queue.map((q) => (
                  <tr key={q.id}>
                    <td className="px-4 py-2 text-slate-600">{q.recipient}</td>
                    <td className="px-4 py-2 text-slate-800">{q.subject}</td>
                    <td className="px-4 py-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${q.status === 'sent' ? 'bg-green-100 text-green-700' : q.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{QSTATUS[q.status] || q.status}</span>
                      {q.last_error && <div className="text-[11px] text-red-500">{q.last_error}</div>}
                    </td>
                    <td className="px-4 py-2 text-slate-400">{dt(q.sent_at)}</td>
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

function Stat({ label, value }) {
  return <Card className="p-5"><div className="text-3xl font-bold text-brand-700">{value}</div><div className="text-sm text-slate-500 mt-1">{label}</div></Card>;
}
