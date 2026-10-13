import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { Card, CardHeader, Button, Input, Toggle, Spinner } from '../components/ui.jsx';

export default function Signatures() {
  const [rows, setRows] = useState(null);
  const [inst, setInst] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [drafts, setDrafts] = useState({});

  async function load() {
    const [sigs, institution] = await Promise.all([
      api.get('/edugestao/signatures'),
      api.get('/edugestao/institution'),
    ]);
    setRows(sigs);
    setInst(institution);
    const d = {};
    sigs.forEach((s) => (d[s.id] = { display_name: s.display_name, body: s.body }));
    setDrafts(d);
  }
  useEffect(() => { load(); }, []);

  async function saveInstitution() {
    setBusy(true); setMsg('');
    try { await api.put('/edugestao/institution', inst); setMsg('Identidade institucional salva.'); await load(); }
    catch (e) { setMsg(`Erro: ${e.message}`); }
    finally { setBusy(false); }
  }
  async function saveSig(s) {
    setBusy(true); setMsg('');
    try { await api.put(`/edugestao/signatures/${s.id}`, drafts[s.id]); setMsg(`Assinatura “${s.display_name}” salva.`); await load(); }
    catch (e) { setMsg(`Erro: ${e.message}`); }
    finally { setBusy(false); }
  }
  async function makeDefault(s) {
    setBusy(true);
    try { await api.put(`/edugestao/signatures/${s.id}`, { is_default: true }); await load(); }
    finally { setBusy(false); }
  }

  if (!rows || !inst) return <Spinner />;

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-slate-800">Assinaturas institucionais</h1>
      {msg && <div className="text-sm bg-slate-100 rounded-lg px-3 py-2">{msg}</div>}

      <Card>
        <CardHeader title="Identidade institucional (EduGestão)" />
        <div className="p-5 grid md:grid-cols-3 gap-3 items-end">
          <Input label="Nome institucional" value={inst.institution_name} onChange={(e) => setInst({ ...inst, institution_name: e.target.value })} />
          <Input label="E-mail institucional" value={inst.institution_email} onChange={(e) => setInst({ ...inst, institution_email: e.target.value })} />
          <Input label="Setor padrão" value={inst.default_sector} onChange={(e) => setInst({ ...inst, default_sector: e.target.value })} />
          <Button onClick={saveInstitution} disabled={busy}>Salvar identidade</Button>
        </div>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        {rows.map((s) => (
          <Card key={s.id}>
            <CardHeader
              title={s.display_name}
              subtitle={`Setor: ${s.sector}`}
              actions={s.is_default ? <span className="text-xs text-emerald-700 font-medium">Padrão</span> : (
                <button className="text-xs text-brand-700 hover:underline" onClick={() => makeDefault(s)}>Tornar padrão</button>
              )}
            />
            <div className="p-5 space-y-3">
              <Input label="Nome de exibição" value={drafts[s.id]?.display_name || ''} onChange={(e) => setDrafts({ ...drafts, [s.id]: { ...drafts[s.id], display_name: e.target.value } })} />
              <label className="block">
                <span className="block text-sm font-medium text-slate-700 mb-1">Texto da assinatura</span>
                <textarea rows={5}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none text-sm font-mono"
                  value={drafts[s.id]?.body || ''}
                  onChange={(e) => setDrafts({ ...drafts, [s.id]: { ...drafts[s.id], body: e.target.value } })} />
              </label>
              <div className="flex items-center justify-between">
                <Toggle checked={!!s.enabled} onChange={async (v) => { await api.put(`/edugestao/signatures/${s.id}`, { enabled: v }); load(); }} label={s.enabled ? 'Ativa' : 'Inativa'} />
                <Button onClick={() => saveSig(s)} disabled={busy}>Salvar</Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
      <p className="text-xs text-slate-400">
        A assinatura padrão é aplicada automaticamente aos envios, sem duplicar quando já presente.
        Não incluímos campos vazios nem marcadores de preenchimento nas mensagens.
      </p>
    </div>
  );
}
