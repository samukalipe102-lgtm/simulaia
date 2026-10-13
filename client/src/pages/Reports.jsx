import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { Card, CardHeader, Select, Spinner, EmptyState } from '../components/ui.jsx';

const LEVEL_STYLES = { info: 'text-slate-600', warn: 'text-amber-600', error: 'text-red-600' };

export default function Reports() {
  const [rows, setRows] = useState(null);
  const [level, setLevel] = useState('');
  const [category, setCategory] = useState('');

  async function load() {
    const p = new URLSearchParams();
    if (level) p.set('level', level);
    if (category) p.set('category', category);
    setRows(await api.get(`/reports/activity?${p.toString()}`));
  }
  useEffect(() => { load(); }, [level, category]);

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-slate-800">Relatórios</h1>
      <p className="text-sm text-slate-500">Registro de atividades, auditoria e falhas do sistema.</p>

      <Card>
        <div className="flex flex-wrap gap-3 p-4 border-b border-slate-100">
          <Select label="Nível" value={level} onChange={(e) => setLevel(e.target.value)} className="w-40">
            <option value="">Todos</option>
            <option value="info">info</option>
            <option value="warn">warn</option>
            <option value="error">error</option>
          </Select>
          <Select label="Categoria" value={category} onChange={(e) => setCategory(e.target.value)} className="w-48">
            <option value="">Todas</option>
            <option value="scheduler">scheduler</option>
            <option value="gmail">gmail</option>
            <option value="auth">auth</option>
            <option value="automation">automation</option>
            <option value="ai">ai</option>
          </Select>
        </div>
        {!rows ? <Spinner /> : rows.length === 0 ? <EmptyState>Sem registros.</EmptyState> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-left">
                <tr>
                  <th className="px-4 py-2 font-medium">Data</th>
                  <th className="px-4 py-2 font-medium">Nível</th>
                  <th className="px-4 py-2 font-medium">Categoria</th>
                  <th className="px-4 py-2 font-medium">Mensagem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-2 text-slate-400 whitespace-nowrap">{new Date(r.created_at).toLocaleString('pt-BR')}</td>
                    <td className={`px-4 py-2 font-medium ${LEVEL_STYLES[r.level]}`}>{r.level}</td>
                    <td className="px-4 py-2 text-slate-500">{r.category}</td>
                    <td className="px-4 py-2 text-slate-700">{r.message}</td>
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
