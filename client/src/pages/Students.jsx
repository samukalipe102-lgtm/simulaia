import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { Card, CardHeader, Button, Input, Spinner, EmptyState } from '../components/ui.jsx';

export default function Students() {
  const [data, setData] = useState(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function load() { setData(await api.get('/edugestao/students')); }
  useEffect(() => { load(); }, []);

  async function importAll() {
    setBusy(true); setMsg('');
    try {
      const s = await api.post('/edugestao/students/import');
      setMsg(`Importação concluída — ${s.studentsInserted} novos, ${s.studentsUpdated} atualizados, ${s.unchanged} inalterados${s.conflicts?.length ? `, ${s.conflicts.length} conflito(s)` : ''}.`);
      await load();
    } catch (e) { setMsg(`Erro: ${e.message}`); }
    finally { setBusy(false); }
  }

  if (!data) return <Spinner />;
  const items = (data.items || []).filter((it) =>
    !q || it.name.toLowerCase().includes(q.toLowerCase()) || (it.guardian_name || '').toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-slate-800">Alunos e responsáveis</h1>
        <Button onClick={importAll} disabled={busy}>Importar / sincronizar (61 pares)</Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <Stat label="Alunos cadastrados" value={data.students} />
        <Stat label="Responsáveis" value={data.guardians} />
        <Stat label="Exibindo" value={items.length} />
      </div>

      {msg && <div className="text-sm bg-slate-100 rounded-lg px-3 py-2">{msg}</div>}

      <Card>
        <div className="p-4 border-b border-slate-100">
          <Input label="Buscar aluno ou responsável" value={q} onChange={(e) => setQ(e.target.value)} placeholder="digite um nome" className="max-w-md" />
        </div>
        {items.length === 0 ? (
          <EmptyState>Nenhum registro. Clique em “Importar / sincronizar”.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-left">
                <tr>
                  <th className="px-4 py-2 font-medium">Aluno</th>
                  <th className="px-4 py-2 font-medium">Responsável</th>
                  <th className="px-4 py-2 font-medium">Matrícula</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((it) => (
                  <tr key={it.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2 font-medium text-slate-800">{it.name}</td>
                    <td className="px-4 py-2 text-slate-600">{it.guardian_name || '—'}</td>
                    <td className="px-4 py-2 text-slate-400">{it.enrollment || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="text-xs text-slate-400">
        🔒 Dados protegidos por autenticação. Não enviamos mensagens a estas pessoas apenas por
        estarem cadastradas; o atendimento real exige validação de destinatários e autorizações.
      </p>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <Card className="p-5">
      <div className="text-3xl font-bold text-brand-700">{value ?? 0}</div>
      <div className="text-sm text-slate-500 mt-1">{label}</div>
    </Card>
  );
}
