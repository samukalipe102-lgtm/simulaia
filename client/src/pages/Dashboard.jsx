import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import { api } from '../lib/api.js';
import { useEvents } from '../hooks/useEvents.js';
import { Card, CardHeader, StatusBadge, Button, Toggle, Spinner, FictitiousBanner } from '../components/ui.jsx';

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

const AUTO_STATE = {
  ativa: { label: 'Automação ativa', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200', dot: 'bg-emerald-500' },
  pausada: { label: 'Pausada', cls: 'bg-zinc-100 text-zinc-700 border-zinc-200', dot: 'bg-zinc-400' },
  aguardando_autorizacao: { label: 'Aguardando autorização', cls: 'bg-amber-100 text-amber-800 border-amber-200', dot: 'bg-amber-500' },
  aguardando_gmail: { label: 'Aguardando conexão do Gmail', cls: 'bg-amber-100 text-amber-800 border-amber-200', dot: 'bg-amber-500' },
  configuracao_pendente: { label: 'Configuração pendente', cls: 'bg-blue-100 text-blue-800 border-blue-200', dot: 'bg-blue-500' },
  erro: { label: 'Com erro / parada de emergência', cls: 'bg-red-100 text-red-800 border-red-200', dot: 'bg-red-500' },
};

function fmt(ts) {
  return ts ? new Date(ts).toLocaleString('pt-BR') : '—';
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [live, setLive] = useState(false);

  async function load() {
    try {
      setData(await api.get('/reports/dashboard'));
      setUpdatedAt(new Date());
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
    const t = setInterval(load, 8000); // fallback de polling
    return () => clearInterval(t);
  }, []);

  // Tempo real via SSE: ao receber um evento do servidor, recarrega os dados.
  useEvents(() => { setLive(true); load(); });

  async function toggleAuto(enabled) {
    setBusy(true);
    try { await api.post('/settings/auto-mode', { enabled }); await load(); }
    finally { setBusy(false); }
  }
  async function approveAutoFollowup(approved) {
    setBusy(true);
    try { await api.post('/settings/approve-auto-followup', { approved }); await load(); }
    finally { setBusy(false); }
  }
  async function emergency(action) {
    setBusy(true);
    try { await api.post(`/settings/${action}`); await load(); }
    finally { setBusy(false); }
  }

  if (error) return <p className="text-red-600">{error}</p>;
  if (!data) return <Spinner />;

  const { statusCounts, totals, conversations, lastExecutions, recentFailures, nextRun, byCategory, gmail, runtime, automationState, settings, readiness } = data;
  const categoryData = byCategory.map((c) => ({ name: c.category, value: c.c }));
  const st = AUTO_STATE[automationState] || AUTO_STATE.configuracao_pendente;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Dashboard — Central de monitoramento</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {live ? '🟢 Tempo real (SSE)' : '🔄 Atualização automática'} ·
            {' '}atualizado em {updatedAt ? updatedAt.toLocaleTimeString('pt-BR') : '—'}
          </p>
        </div>
        <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-medium ${st.cls}`}>
          <span className={`w-2.5 h-2.5 rounded-full ${st.dot} animate-pulse`} />
          {st.label}
        </span>
      </div>
      <FictitiousBanner />

      {/* Call-to-action depending on state */}
      {automationState === 'configuracao_pendente' && (
        <Card className="p-5 flex items-center justify-between flex-wrap gap-3 border-blue-200 bg-blue-50">
          <div className="text-sm text-blue-800">Conclua a configuração inicial única para ativar a automação.</div>
          <Button onClick={() => navigate('/setup')}>Abrir assistente de configuração</Button>
        </Card>
      )}
      {automationState === 'aguardando_gmail' && (
        <Card className="p-5 flex items-center justify-between flex-wrap gap-3 border-amber-200 bg-amber-50">
          <div className="text-sm text-amber-800">Conecte a conta de Gmail para o sistema começar a operar.</div>
          <Button onClick={() => navigate('/gmail')}>Conectar Gmail</Button>
        </Card>
      )}

      {/* Readiness: o que falta para os e-mails serem enviados */}
      {readiness && !readiness.ready && (
        <Card className="border-amber-200">
          <CardHeader title="⚠️ Pendências para enviar e-mails" subtitle="Resolva os itens abaixo para o sistema começar a enviar" />
          <div className="p-5 space-y-2">
            {readiness.checks.map((c) => (
              <div key={c.key} className="flex items-start gap-2 text-sm">
                <span>{c.ok ? '✅' : '❌'}</span>
                <div>
                  <span className={c.ok ? 'text-slate-700' : 'text-slate-800 font-medium'}>{c.label}</span>
                  {!c.ok && <div className="text-xs text-amber-700">{c.fix}</div>}
                </div>
              </div>
            ))}
            <div className="pt-2 flex gap-2">
              <Button onClick={() => navigate('/setup')}>Abrir assistente</Button>
              {!gmail.connected && <Button variant="secondary" onClick={() => navigate('/gmail')}>Conectar Gmail</Button>}
            </div>
          </div>
        </Card>
      )}
      {readiness && readiness.ready && (
        <Card className="border-emerald-200 bg-emerald-50">
          <div className="p-4 text-sm text-emerald-800">
            ✅ Tudo pronto para enviar. O sistema vai gerar e enviar os e-mails ao destinatário autorizado conforme as regras.
          </div>
        </Card>
      )}

      {/* Automation control panel */}
      <Card>
        <CardHeader title="Controle da automação" subtitle="Opere o ciclo automático sem executar cada tarefa manualmente" />
        <div className="p-5 grid md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <Toggle checked={!!settings.auto_mode} onChange={toggleAuto}
              label="Modo automático (gerar e enviar solicitações sozinho)" />
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <Toggle checked={!!settings.auto_followup_approved} onChange={approveAutoFollowup}
                label="Envio automático de acompanhamentos autorizado" />
              <p className="text-xs text-amber-700 mt-1">
                Com isto ligado, a IA responde às suas respostas automaticamente dentro das regras.
                Desligado, ela apenas prepara os acompanhamentos para você aprovar.
              </p>
            </div>
          </div>
          <div className="space-y-2 text-sm">
            <Row label="Estado do agendador">{runtime?.startedAt ? '🟢 Em execução' : '—'}</Row>
            <Row label="Última sincronização">{fmt(runtime?.lastSyncAt)}</Row>
            <Row label="Última decisão de conversas">{fmt(runtime?.lastConversationRunAt)}</Row>
            <Row label="Próxima execução">
              {nextRun ? `${fmt(nextRun.next_run_at)}` : '—'}
            </Row>
            <div className="pt-2">
              {settings.emergency_stop ? (
                <Button variant="secondary" onClick={() => emergency('emergency-clear')} disabled={busy}>Liberar parada de emergência</Button>
              ) : (
                <Button variant="danger" onClick={() => emergency('emergency-stop')} disabled={busy}>🛑 Parada de emergência</Button>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Top indicators */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Indicator label="Solicitações criadas" value={totals.requests} />
        <Indicator label="Conversas em andamento" value={conversations?.inProgress ?? 0} />
        <Indicator label="Respostas identificadas" value={conversations?.repliesIdentified ?? 0} />
        <Indicator label="Conversas concluídas" value={conversations?.completed ?? 0} />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Indicator label="Aguardando aprovação" value={conversations?.awaitingApproval ?? 0} />
        <Indicator label="Precisam de intervenção" value={conversations?.needsAdmin ?? 0} warn={conversations?.needsAdmin > 0} />
        <Indicator label="Com erro" value={conversations?.errors ?? 0} warn={conversations?.errors > 0} />
        <Indicator label="Serviços habilitados" value={totals.services} />
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
        {/* Gmail + indicators */}
        <Card>
          <CardHeader title="Integração e atividade" />
          <div className="p-5 space-y-3 text-sm">
            <Row label="Gmail configurado">{gmail.configured ? '✅ Sim' : '⚠️ Não (defina credenciais)'}</Row>
            <Row label="Gmail conectado">{gmail.connected ? `✅ ${gmail.email}` : '❌ Não conectado'}</Row>
            {gmail.lastError && <Row label="Último erro Gmail"><span className="text-red-600">{gmail.lastError}</span></Row>}
            <Row label="Modo de teste">{settings.test_mode ? '🧪 Ativo (apenas destinatário autorizado)' : 'Desativado'}</Row>
            <Row label="Destinatário autorizado">{settings.authorized_recipient || '—'}</Row>
            <Row label="Configuração inicial">{settings.setup_completed ? '✅ Concluída' : '⚠️ Pendente'}</Row>
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
                    {categoryData.map((_, i) => (<Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />))}
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
        <Card>
          <CardHeader title="Últimas atividades" />
          <div className="divide-y divide-slate-100">
            {lastExecutions.length === 0 && <p className="p-5 text-sm text-slate-400">Nenhuma ainda.</p>}
            {lastExecutions.map((r) => (
              <Link key={r.id} to={`/solicitacoes/${r.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-slate-50">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-800 truncate">{r.subject}</div>
                  <div className="text-xs text-slate-400">{r.public_id}</div>
                </div>
                <StatusBadge status={r.status} />
              </Link>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Erros e tarefas pendentes" />
          <div className="divide-y divide-slate-100">
            {recentFailures.length === 0 && <p className="p-5 text-sm text-slate-400">Nenhuma falha. 🎉</p>}
            {recentFailures.map((f) => (
              <div key={f.id} className="px-5 py-3">
                <div className="text-sm text-red-700">{f.message}</div>
                <div className="text-xs text-slate-400">{f.category} · {fmt(f.created_at)}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Indicator({ label, value, warn }) {
  return (
    <Card className="p-5">
      <div className={`text-3xl font-bold ${warn ? 'text-red-600' : 'text-brand-700'}`}>{value}</div>
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
