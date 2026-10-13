import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import { api } from '../lib/api.js';
import { Card, CardHeader, StatusBadge, Spinner, FictitiousBanner } from '../components/ui.jsx';

const STATUS_ORDER = [
  'scheduled', 'sent', 'awaiting_reply', 'replied',
  'awaiting_approval', 'completed', 'paused', 'error',
];
const STATUS_LABELS = {
  scheduled: 'Agendadas', sent: 'Enviadas', awaiting_reply: 'Aguardando resposta',
  replied: 'Respondidas', awaiting_approval: 'Aguardando aprovação',
  completed: 'Concluídas', paused: 'Pausadas', error: 'Com erro',
};
const PIE_COLORS = ['#3563f0', '#06b6d4', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444'];

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  async function load() {
    try {
      setData(await api.get('/reports/dashboard'));
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  if (error) return <p className="text-red-600">{error}</p>;
  if (!data) return <Spinner />;

  const { statusCounts, totals, lastExecutions, recentFailures, nextRun, byCategory, gmail } = data;
  const categoryData = byCategory.map((c) => ({ name: c.category, value: c.c }));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">Dashboard</h1>
      </div>
      <FictitiousBanner />

      {/* Top indicators */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Indicator label="Solicitações" value={totals.requests} />
        <Indicator label="Automações ativas" value={totals.automationsActive} />
        <Indicator label="Serviços habilitados" value={totals.services} />
        <Indicator label="Perfis fictícios" value={totals.profiles} />
      </div>

      {/* Status breakdown */}
      <Card>
        <CardHeader title="Status das solicitações" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-5">
          {STATUS_ORDER.map((s) => (
            <div key={s} className="rounded-lg border border-slate-100 p-3">
              <div className="text-2xl font-bold text-slate-800">{statusCounts[s] || 0}</div>
              <div className="text-xs text-slate-500 mt-1">{STATUS_LABELS[s]}</div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid lg:grid-cols-2 gap-5">
        {/* Gmail + next run indicators */}
        <Card>
          <CardHeader title="Integração e atividade" />
          <div className="p-5 space-y-3 text-sm">
            <Row label="Gmail configurado">
              {gmail.configured ? '✅ Sim' : '⚠️ Não (defina credenciais)'}
            </Row>
            <Row label="Gmail conectado">
              {gmail.connected ? `✅ ${gmail.email}` : '❌ Não conectado'}
            </Row>
            {gmail.lastError && (
              <Row label="Último erro Gmail"><span className="text-red-600">{gmail.lastError}</span></Row>
            )}
            <Row label="Próxima execução">
              {nextRun ? `${nextRun.name} — ${new Date(nextRun.next_run_at).toLocaleString('pt-BR')}` : '—'}
            </Row>
            <Row label="Modo de teste">
              {data.settings.test_mode ? '🧪 Ativo (apenas destinatário autorizado)' : 'Desativado'}
            </Row>
            <Row label="Parada de emergência">
              {data.settings.emergency_stop ? '🛑 ACIONADA' : 'Normal'}
            </Row>
          </div>
        </Card>

        {/* Category chart */}
        <Card>
          <CardHeader title="Solicitações por categoria" />
          <div className="p-5 h-64">
            {categoryData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={categoryData} dataKey="value" nameKey="name" outerRadius={90} label>
                    {categoryData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-slate-400 text-sm">Sem dados ainda.</p>
            )}
          </div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        {/* Last executions */}
        <Card>
          <CardHeader title="Últimas execuções" />
          <div className="divide-y divide-slate-100">
            {lastExecutions.length === 0 && <p className="p-5 text-sm text-slate-400">Nenhuma ainda.</p>}
            {lastExecutions.map((r) => (
              <Link
                key={r.id}
                to={`/solicitacoes/${r.id}`}
                className="flex items-center justify-between px-5 py-3 hover:bg-slate-50"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-800 truncate">{r.subject}</div>
                  <div className="text-xs text-slate-400">{r.public_id}</div>
                </div>
                <StatusBadge status={r.status} />
              </Link>
            ))}
          </div>
        </Card>

        {/* Recent failures */}
        <Card>
          <CardHeader title="Falhas recentes" />
          <div className="divide-y divide-slate-100">
            {recentFailures.length === 0 && <p className="p-5 text-sm text-slate-400">Nenhuma falha. 🎉</p>}
            {recentFailures.map((f) => (
              <div key={f.id} className="px-5 py-3">
                <div className="text-sm text-red-700">{f.message}</div>
                <div className="text-xs text-slate-400">
                  {f.category} · {new Date(f.created_at).toLocaleString('pt-BR')}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Indicator({ label, value }) {
  return (
    <Card className="p-5">
      <div className="text-3xl font-bold text-brand-700">{value}</div>
      <div className="text-sm text-slate-500 mt-1">{label}</div>
    </Card>
  );
}

function Row({ label, children }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-800 text-right">{children}</span>
    </div>
  );
}
