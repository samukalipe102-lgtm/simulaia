import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { Card, CardHeader, Button, Toggle, Spinner, EmptyState } from '../components/ui.jsx';

export default function Processes() {
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);

  async function load() { setRows(await api.get('/edugestao/processes')); }
  useEffect(() => { load(); }, []);

  async function toggle(p) {
    setBusy(true);
    try { await api.put(`/edugestao/processes/${p.id}`, { enabled: !p.enabled }); await load(); }
    finally { setBusy(false); }
  }

  if (!rows) return <Spinner />;

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-slate-800">Processos escolares</h1>
      <p className="text-sm text-slate-500">
        Catálogo de processos administrativos. Cada um define requisitos, etapas, setor
        responsável, prazo (SLA), modelo de resposta e critérios de conclusão.
      </p>

      {rows.length === 0 ? (
        <EmptyState>Nenhum processo cadastrado.</EmptyState>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {rows.map((p) => (
            <Card key={p.id}>
              <CardHeader
                title={p.name}
                subtitle={`${p.category} · ${p.responsible_sector} · prazo ${p.sla_days} dia(s)`}
                actions={<Toggle checked={!!p.enabled} onChange={() => toggle(p)} />}
              />
              <div className="p-5 text-sm space-y-2">
                <Field label="Descrição" value={p.description} />
                <Field label="Requisitos" value={p.requirements} />
                <Field label="Etapas" value={p.steps} />
                <Field label="Modelo de resposta" value={p.response_template} />
                <Field label="Conclusão" value={p.completion_criteria} />
              </div>
            </Card>
          ))}
        </div>
      )}
      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
        A emissão e o envio de documentos oficiais seguem controles de autorização apropriados.
        O sistema não inventa prazos legais, documentos emitidos ou assinaturas oficiais.
      </p>
    </div>
  );
}

function Field({ label, value }) {
  if (!value) return null;
  return (
    <div>
      <div className="text-xs text-slate-400">{label}</div>
      <div className="text-slate-700">{value}</div>
    </div>
  );
}
