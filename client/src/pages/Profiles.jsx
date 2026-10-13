import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { Card, CardHeader, Button, Input, Select, Toggle, Spinner, EmptyState, FictitiousBanner } from '../components/ui.jsx';

const ROLES = ['responsavel', 'professor', 'coordenador', 'funcionario'];

export default function Profiles() {
  const [rows, setRows] = useState(null);
  const [form, setForm] = useState({ name: '', role: 'responsavel', context: '' });
  const [busy, setBusy] = useState(false);

  async function load() { setRows(await api.get('/profiles')); }
  useEffect(() => { load(); }, []);

  async function create(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/profiles', form);
      setForm({ name: '', role: 'responsavel', context: '' });
      await load();
    } finally { setBusy(false); }
  }
  async function toggle(p) {
    await api.put(`/profiles/${p.id}`, { enabled: !p.enabled });
    await load();
  }
  async function remove(id) {
    if (!confirm('Excluir perfil?')) return;
    await api.del(`/profiles/${id}`);
    await load();
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-slate-800">Perfis simulados</h1>
      <FictitiousBanner />

      <Card>
        <CardHeader title="Novo perfil fictício" />
        <form onSubmit={create} className="p-5 grid md:grid-cols-4 gap-3 items-end">
          <Input label="Nome (fictício)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Select label="Papel" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </Select>
          <Input label="Contexto" value={form.context} onChange={(e) => setForm({ ...form, context: e.target.value })} placeholder="opcional" />
          <Button type="submit" disabled={busy}>Adicionar</Button>
        </form>
      </Card>

      <Card>
        <CardHeader title="Perfis cadastrados" />
        {!rows ? <Spinner /> : rows.length === 0 ? <EmptyState>Nenhum perfil.</EmptyState> : (
          <div className="divide-y divide-slate-100">
            {rows.map((p) => (
              <div key={p.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <div className="font-medium text-slate-800">
                    {p.name} <span className="text-xs text-amber-600">(fictício)</span>
                  </div>
                  <div className="text-xs text-slate-400">{p.role} · {p.context}</div>
                </div>
                <div className="flex items-center gap-4">
                  <Toggle checked={!!p.enabled} onChange={() => toggle(p)} label={p.enabled ? 'Habilitado' : 'Desabilitado'} />
                  <button onClick={() => remove(p.id)} className="text-sm text-red-600 hover:underline">Excluir</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
