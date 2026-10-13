import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useEvents } from '../hooks/useEvents.js';
import { Card, CardHeader, StatusBadge, Button, Spinner } from '../components/ui.jsx';

function dt(ts) { return ts ? new Date((ts || '').replace(' ', 'T') + 'Z').toLocaleString('pt-BR') : '—'; }

export default function Dashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [updatedAt, setUpdatedAt] = useState(null);
  const [live, setLive] = useState(false);

  async function load() {
    try { setData(await api.get('/reports/dashboard')); setUpdatedAt(new Date()); }
    catch (e) { setErr(e.message); }
  }
  useEffect(() => { load(); const t = setInterval(load, 10000); return () => clearInterval(t); }, []);
  useEvents(() => { setLive(true); load(); });

  if (err) return <p className="text-red-600">{err}</p>;
  if (!data) return <Spinner />;

  const sc = data.statusCounts || {};
  const total = data.totals?.requests || 0;
  const aguardando = (sc.replied || 0) + (sc.awaiting_reply || 0);
  const respondidos = sc.completed || 0;
  const concluidos = sc.concluido || 0;
  const gmail = data.gmail || {};
  const runtime = data.runtime || {};

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Dashboard</h1>
          <p className="text-xs text-slate-400">
            {live ? '🟢 Tempo real' : '🔄 Atualização automática'} · atualizado em {updatedAt ? updatedAt.toLocaleTimeString('pt-BR') : '—'}
          </p>
        </div>
        {!gmail.connected && <Button onClick={() => navigate('/gmail')}>Conectar Gmail</Button>}
      </div>

      {/* 4 indicadores principais */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Total de solicitações" value={total} to="/processos" />
        <Stat label="Aguardando resposta" value={aguardando} to="/processos" />
        <Stat label="Respondidos" value={respondidos} to="/respostas" />
        <Stat label="Concluídos" value={concluidos} to="/processos" />
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader title="Integração e sincronização" />
          <div className="p-5 space-y-3 text-sm">
            <Row label="Gmail conectado">{gmail.connected ? `✅ ${gmail.email}` : '❌ Não conectado'}</Row>
            {gmail.lastError && <Row label="Último erro Gmail"><span className="text-red-600">{gmail.lastError}</span></Row>}
            <Row label="Agendador">{runtime.startedAt ? '🟢 Em execução' : '—'}</Row>
            <Row label="Última sincronização">{dt(runtime.lastSyncAt)}</Row>
            <Row label="Última fila administrativa">{dt(runtime.lastQueueAt)}</Row>
            <Row label="Parada de emergência">{data.settings?.emergency_stop ? '🛑 ACIONADA' : 'Normal'}</Row>
          </div>
        </Card>

        <Card>
          <CardHeader title="Atividade recente" actions={<Link to="/processos" className="text-xs text-brand-700 hover:underline">ver processos</Link>} />
          <div className="divide-y divide-slate-100">
            {(data.lastExecutions || []).length === 0 && <p className="p-5 text-sm text-slate-400">Nenhuma ainda.</p>}
            {(data.lastExecutions || []).map((r) => (
              <Link key={r.id} to="/processos" className="flex items-center justify-between px-5 py-3 hover:bg-slate-50">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-800 truncate">{r.subject}</div>
                  <div className="text-xs text-slate-400">{r.public_id}</div>
                </div>
                <StatusBadge status={r.status} />
              </Link>
            ))}
          </div>
        </Card>
      </div>

      {(data.recentFailures || []).length > 0 && (
        <Card>
          <CardHeader title="Erros recentes" />
          <div className="divide-y divide-slate-100">
            {data.recentFailures.map((f) => (
              <div key={f.id} className="px-5 py-3">
                <div className="text-sm text-red-700">{f.message}</div>
                <div className="text-xs text-slate-400">{f.category} · {dt(f.created_at)}</div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value, to }) {
  const inner = (
    <Card className="p-5 hover:shadow-md transition-shadow">
      <div className="text-3xl font-bold text-brand-700">{value}</div>
      <div className="text-sm text-slate-500 mt-1">{label}</div>
    </Card>
  );
  return to ? <Link to={to}>{inner}</Link> : inner;
}
function Row({ label, children }) {
  return <div className="flex items-center justify-between"><span className="text-slate-500">{label}</span><span className="font-medium text-slate-800 text-right">{children}</span></div>;
}
