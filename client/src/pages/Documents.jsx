import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { Card, CardHeader, Spinner, EmptyState } from '../components/ui.jsx';

function fmtSize(n) {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

export default function Documents() {
  const [rows, setRows] = useState(null);
  async function load() { setRows(await api.get('/central/documents')); }
  useEffect(() => { load(); }, []);

  if (!rows) return <Spinner />;
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-800">Documentos</h1>
      <p className="text-xs text-slate-400">Anexos recebidos e enviados, organizados por processo.</p>
      <Card>
        <CardHeader title="Arquivos" />
        {rows.length === 0 ? <EmptyState>Nenhum documento ainda.</EmptyState> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-left">
                <tr>
                  <th className="px-4 py-2 font-medium">Arquivo</th>
                  <th className="px-4 py-2 font-medium">Processo</th>
                  <th className="px-4 py-2 font-medium">Tipo</th>
                  <th className="px-4 py-2 font-medium">Tamanho</th>
                  <th className="px-4 py-2 font-medium">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2 font-medium text-slate-800">{a.filename}</td>
                    <td className="px-4 py-2 text-slate-500">{a.public_id}</td>
                    <td className="px-4 py-2 text-slate-400">{a.mime_type}</td>
                    <td className="px-4 py-2 text-slate-400">{fmtSize(a.size_bytes)}</td>
                    <td className="px-4 py-2">
                      <a href={`/api/central/attachments/${a.id}/download`} target="_blank" rel="noreferrer"
                        className="text-brand-700 hover:underline">Baixar ↓</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="text-xs text-slate-400">Os arquivos são buscados sob demanda no Gmail; links quebrados não são exibidos como válidos.</p>
    </div>
  );
}
