import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { Card, CardHeader, Button, Input, Select, Toggle, Spinner, EmptyState } from '../components/ui.jsx';

const CATEGORIES = ['declaracao', 'historico', 'documento', 'esclarecimento'];

export default function Services() {
  const [rows, setRows] = useState(null);
  const [form, setForm] = useState({ name: '', category: 'declaracao', description: '' });
  const [busy, setBusy] = useState(false);

  async function load() { setRows(await api.get('/services')); }
  useEffect(() => { load(); }, []);

  async function create(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/services', form);
      setForm({ name: '', category: 'declaracao', description: '' });
      await load();
    } finally { setBusy(false); }
  }

  async function toggle(s) {
    await api.put(`/services/${s.id}`, { enabled: !s.enabled });
    await load();
  }
  async function remove(id) {
    if (!confirm('Excluir serviço?')) return;
    await api.del(`/services/${id}`);
    await load();
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-slate-800">Serviços escolares</h1>
      <p className="text-sm text-slate-500">Somente serviços <strong>habilitados</strong> podem ser usados pela IA nas simulações.</p>

      <Card>
        <CardHeader title="Novo serviço" />
        <form onSubmit={create} className="p-5 grid md:grid-cols-4 gap-3 items-end">
          <Input label="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Select label="Categoria" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
          <Input label="Descrição" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <Button type="submit" disabled={busy}>Adicionar</Button>
        </form>
      </Card>

      <Card>
        <CardHeader title="Serviços cadastrados" />
        {!rows ? <Spinner /> : rows.length === 0 ? <EmptyState>Nenhum serviço.</EmptyState> : (
          <div className="divide-y divide-slate-100">
            {rows.map((s) => (
              <div key={s.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <div className="font-medium text-slate-800">{s.name}</div>
                  <div className="text-xs text-slate-400">{s.category} · {s.description}</div>
                </div>
                <div className="flex items-center gap-4">
                  <Toggle checked={!!s.enabled} onChange={() => toggle(s)} label={s.enabled ? 'Habilitado' : 'Desabilitado'} />
                  <button onClick={() => remove(s.id)} className="text-sm text-red-600 hover:underline">Excluir</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
