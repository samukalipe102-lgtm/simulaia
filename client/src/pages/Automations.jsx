import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { Card, CardHeader, Button, Input, Toggle, StatusBadge, Spinner, EmptyState } from '../components/ui.jsx';

const DAYS = [
  { v: 1, l: 'Seg' }, { v: 2, l: 'Ter' }, { v: 3, l: 'Qua' },
  { v: 4, l: 'Qui' }, { v: 5, l: 'Sex' }, { v: 6, l: 'Sáb' }, { v: 0, l: 'Dom' },
];

const REASON_LABELS = {
  emergency_stop: 'Parada de emergência ativa',
  not_active: 'Pausada',
  not_started: 'Fora da janela (não iniciou)',
  ended: 'Duração encerrada',
  day_not_allowed: 'Dia não permitido',
  hour_not_allowed: 'Fora do horário permitido',
  daily_cap_reached: 'Limite diário atingido',
  interval_not_elapsed: 'Aguardando intervalo',
};

const DEFAULT = {
  name: '', max_per_day: 5, interval_minutes: 30, allowed_days: '1,2,3,4,5',
  start_hour: 8, end_hour: 18, categories: '', profile_ids: '',
  duration_days: 7, recipient: '', require_approval: true, max_attempts: 3,
};

export default function Automations() {
  const [rows, setRows] = useState(null);
  const [form, setForm] = useState(DEFAULT);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function load() { setRows(await api.get('/automations')); }
  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  function toggleDay(v) {
    const set = new Set(form.allowed_days.split(',').filter(Boolean).map(Number));
    set.has(v) ? set.delete(v) : set.add(v);
    setForm({ ...form, allowed_days: [...set].sort().join(',') });
  }

  async function create(e) {
    e.preventDefault();
    setBusy(true); setMsg('');
    try {
      await api.post('/automations', {
        ...form,
        max_per_day: Number(form.max_per_day),
        interval_minutes: Number(form.interval_minutes),
        start_hour: Number(form.start_hour),
        end_hour: Number(form.end_hour),
        duration_days: Number(form.duration_days),
        max_attempts: Number(form.max_attempts),
      });
      setForm(DEFAULT);
      await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(false); }
  }

  async function act(id, action) {
    setBusy(true); setMsg('');
    try { await api.post(`/automations/${id}/${action}`); await load(); }
    catch (e) { setMsg(e.message); }
    finally { setBusy(false); }
  }
  async function remove(id) {
    if (!confirm('Excluir automação?')) return;
    await api.del(`/automations/${id}`);
    await load();
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-slate-800">Automações e agendamentos</h1>
      <p className="text-sm text-slate-500">
        O agendador roda no <strong>servidor</strong> e continua funcionando com o navegador fechado.
      </p>
      {msg && <div className="text-sm bg-red-50 text-red-700 rounded-lg px-3 py-2">{msg}</div>}

      <Card>
        <CardHeader title="Nova automação" />
        <form onSubmit={create} className="p-5 grid md:grid-cols-3 gap-4">
          <Input label="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Input label="Máx. e-mails por dia" type="number" min="1" value={form.max_per_day} onChange={(e) => setForm({ ...form, max_per_day: e.target.value })} />
          <Input label="Intervalo entre envios (min)" type="number" min="1" value={form.interval_minutes} onChange={(e) => setForm({ ...form, interval_minutes: e.target.value })} />
          <Input label="Hora início (0-23)" type="number" min="0" max="23" value={form.start_hour} onChange={(e) => setForm({ ...form, start_hour: e.target.value })} />
          <Input label="Hora fim (0-23)" type="number" min="0" max="23" value={form.end_hour} onChange={(e) => setForm({ ...form, end_hour: e.target.value })} />
          <Input label="Duração (dias)" type="number" min="1" value={form.duration_days} onChange={(e) => setForm({ ...form, duration_days: e.target.value })} />
          <Input label="Categorias (vazio = todas)" value={form.categories} onChange={(e) => setForm({ ...form, categories: e.target.value })} placeholder="declaracao,historico" />
          <Input label="IDs de perfis (vazio = todos)" value={form.profile_ids} onChange={(e) => setForm({ ...form, profile_ids: e.target.value })} placeholder="1,2" />
          <Input label="Destinatário autorizado" value={form.recipient} onChange={(e) => setForm({ ...form, recipient: e.target.value })} placeholder="(usa o global se vazio)" />
          <Input label="Tentativas em caso de erro" type="number" min="1" value={form.max_attempts} onChange={(e) => setForm({ ...form, max_attempts: e.target.value })} />

          <div className="md:col-span-3">
            <span className="block text-sm font-medium text-slate-700 mb-2">Dias permitidos</span>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((d) => {
                const active = form.allowed_days.split(',').map(Number).includes(d.v);
                return (
                  <button type="button" key={d.v} onClick={() => toggleDay(d.v)}
                    className={`px-3 py-1 rounded-lg text-sm border ${active ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-600 border-slate-300'}`}>
                    {d.l}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="md:col-span-3 flex items-center justify-between">
            <Toggle checked={form.require_approval} onChange={(v) => setForm({ ...form, require_approval: v })}
              label="Exigir aprovação manual para acompanhamentos" />
            <Button type="submit" disabled={busy}>Criar automação</Button>
          </div>
        </form>
      </Card>

      <Card>
        <CardHeader title="Automações" subtitle="Ative, pause ou retome a qualquer momento" />
        {!rows ? <Spinner /> : rows.length === 0 ? <EmptyState>Nenhuma automação.</EmptyState> : (
          <div className="divide-y divide-slate-100">
            {rows.map((a) => (
              <div key={a.id} className="px-5 py-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <div className="font-medium text-slate-800 flex items-center gap-2">
                      {a.name} <StatusBadge status={a.status} />
                    </div>
                    <div className="text-xs text-slate-400 mt-1">
                      {a.max_per_day}/dia · intervalo {a.interval_minutes}min · {a.start_hour}h–{a.end_hour}h ·
                      dias [{a.allowed_days}] · tentativas {a.max_attempts} ·
                      enviados hoje: {a.sent_today}
                    </div>
                    {a.status === 'active' && a.check && !a.check.ok && (
                      <div className="text-xs text-amber-600 mt-1">
                        Agora: {REASON_LABELS[a.check.reason] || a.check.reason}
                      </div>
                    )}
                    {a.next_run_at && (
                      <div className="text-xs text-slate-400">Próxima execução estimada: {new Date(a.next_run_at).toLocaleString('pt-BR')}</div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {a.status !== 'active' ? (
                      <Button variant="success" className="!px-3 !py-1" onClick={() => act(a.id, 'activate')} disabled={busy}>Ativar</Button>
                    ) : (
                      <Button variant="secondary" className="!px-3 !py-1" onClick={() => act(a.id, 'pause')} disabled={busy}>Pausar</Button>
                    )}
                    {a.status === 'paused' && (
                      <Button variant="ghost" className="!px-3 !py-1" onClick={() => act(a.id, 'resume')} disabled={busy}>Retomar</Button>
                    )}
                    <button onClick={() => remove(a.id)} className="text-sm text-red-600 hover:underline px-2">Excluir</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
