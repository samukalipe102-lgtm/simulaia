import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { Card, CardHeader, Button, Spinner, EmptyState } from '../components/ui.jsx';

const CAT = {
  correcao: { label: 'Correção', cls: 'bg-red-100 text-red-700' },
  melhoria: { label: 'Melhoria', cls: 'bg-brand-100 text-brand-700' },
  seguranca: { label: 'Segurança', cls: 'bg-purple-100 text-purple-700' },
  desempenho: { label: 'Desempenho', cls: 'bg-amber-100 text-amber-700' },
};
const FILTERS = [['', 'Todas'], ['correcao', 'Correções'], ['melhoria', 'Melhorias'], ['seguranca', 'Segurança'], ['desempenho', 'Desempenho']];

export default function Updates() {
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState('');

  async function load() { setData(await api.get('/updates/changelog')); }
  useEffect(() => { load(); }, []);

  async function markSeen() { await api.post('/updates/changelog/seen'); await load(); }

  if (!data) return <Spinner />;
  const items = data.items.filter((i) => !filter || i.category === filter);
  const unseenCount = data.items.filter((i) => i.unseen).length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">O que há de novo?</h1>
          <p className="text-xs text-slate-400">Versão atual: {data.currentVersion}{unseenCount > 0 ? ` · ${unseenCount} nova(s)` : ''}</p>
        </div>
        {unseenCount > 0 && <Button variant="secondary" onClick={markSeen}>Marcar como visto</Button>}
      </div>

      <div className="flex flex-wrap gap-1">
        {FILTERS.map(([v, l]) => (
          <button key={v} onClick={() => setFilter(v)}
            className={`px-3 py-1 rounded-full text-xs border ${filter === v ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-600 border-slate-200'}`}>{l}</button>
        ))}
      </div>

      {items.length === 0 ? <EmptyState>Nenhuma novidade nesta categoria.</EmptyState> : (
        <div className="space-y-4">
          {items.map((it) => {
            const cat = CAT[it.category] || CAT.melhoria;
            return (
              <Card key={it.version} className={it.unseen ? 'border-brand-300 ring-1 ring-brand-100' : ''}>
                <div className="p-5">
                  <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cat.cls}`}>{cat.label}</span>
                      <span className="font-semibold text-slate-800">v{it.version}</span>
                      {it.unseen && <span className="text-[11px] bg-brand-600 text-white px-2 py-0.5 rounded-full">novo</span>}
                    </div>
                    <span className="text-xs text-slate-400">{new Date(it.date).toLocaleDateString('pt-BR')}</span>
                  </div>
                  {it.title && <div className="font-medium text-slate-800 mb-2">{it.title}</div>}
                  <Field label="Problema identificado" value={it.problem} />
                  <Field label="Alteração realizada" value={it.change} />
                  <Field label="Benefícios" value={it.benefit} />
                  <Field label="Resultado dos testes" value={it.tests} />
                  {it.pr && (
                    <a href={it.pr} target="_blank" rel="noreferrer" className="text-sm text-brand-700 hover:underline">
                      Ver registro no GitHub ↗
                    </a>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Field({ label, value }) {
  if (!value) return null;
  return (
    <div className="mb-2">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="text-sm text-slate-700">{value}</div>
    </div>
  );
}
