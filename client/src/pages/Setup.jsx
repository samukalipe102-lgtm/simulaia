import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { Card, CardHeader, Button, Input, Toggle, Spinner, FictitiousBanner } from '../components/ui.jsx';

// Assistente de configuração inicial ÚNICA. Reúne tudo em um só processo e,
// ao concluir, o sistema passa a operar automaticamente no servidor.
const DAYS = [
  { v: 1, l: 'Seg' }, { v: 2, l: 'Ter' }, { v: 3, l: 'Qua' },
  { v: 4, l: 'Qui' }, { v: 5, l: 'Sex' }, { v: 6, l: 'Sáb' }, { v: 0, l: 'Dom' },
];
const CATS = [
  { v: 'declaracao', l: 'Declarações' },
  { v: 'historico', l: 'Históricos' },
  { v: 'documento', l: 'Documentos' },
  { v: 'esclarecimento', l: 'Esclarecimentos' },
];

export default function Setup() {
  const navigate = useNavigate();
  const [gmail, setGmail] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState({
    authorized_recipient: '',
    enabled_categories: ['declaracao', 'historico', 'documento', 'esclarecimento'],
    max_per_day: 5,
    interval_minutes: 60,
    allowed_days: '1,2,3,4,5',
    start_hour: 8,
    end_hour: 18,
    duration_days: 30,
    max_attempts: 3,
    max_followups_per_conversation: 3,
    auto_mode: true,
    auto_followup: false, // começa exigindo aprovação (segurança)
    poll_interval_minutes: 2,
  });

  useEffect(() => {
    (async () => {
      const [st, cfg] = await Promise.all([api.get('/gmail/status'), api.get('/settings')]);
      setGmail(st);
      if (cfg.authorized_recipient) {
        setForm((f) => ({ ...f, authorized_recipient: cfg.authorized_recipient }));
      }
    })();
  }, []);

  function toggleDay(v) {
    const set = new Set(form.allowed_days.split(',').filter(Boolean).map(Number));
    set.has(v) ? set.delete(v) : set.add(v);
    setForm({ ...form, allowed_days: [...set].sort().join(',') });
  }
  function toggleCat(v) {
    const set = new Set(form.enabled_categories);
    set.has(v) ? set.delete(v) : set.add(v);
    setForm({ ...form, enabled_categories: [...set] });
  }

  async function finish() {
    if (!form.authorized_recipient) { setMsg('Informe o e-mail autorizado.'); return; }
    setBusy(true); setMsg('');
    try {
      await api.post('/settings/setup', {
        ...form,
        test_mode: true,
        auto_followup_approved: form.auto_followup, // autorização inicial opcional
      });
      setMsg('✅ Configuração concluída! Redirecionando para o painel...');
      setTimeout(() => navigate('/'), 1200);
    } catch (e) { setMsg(`❌ ${e.message}`); }
    finally { setBusy(false); }
  }

  if (!gmail) return <Spinner />;

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Assistente de configuração inicial</h1>
        <p className="text-sm text-slate-500 mt-1">
          Configure tudo uma única vez. Depois, o sistema opera sozinho no servidor —
          sua única tarefa diária será responder aos e-mails no seu Gmail.
        </p>
      </div>
      <FictitiousBanner />

      {/* 1. Gmail */}
      <Card>
        <CardHeader title="1. Conta de Gmail" subtitle="Credenciais e conexão (OAuth real)" />
        <div className="p-5 text-sm space-y-2">
          <Row label="Credenciais Google">{gmail.configured ? '✅ Configuradas' : '⚠️ Faltando'}</Row>
          <Row label="Conta conectada">{gmail.connected ? `✅ ${gmail.email}` : '❌ Não conectada'}</Row>
          {!gmail.connected && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
              Vá à página <strong>Integração com Gmail</strong> para informar as credenciais e
              conectar a conta. Você pode concluir este assistente e conectar o Gmail em seguida —
              a automação só envia depois que o Gmail estiver conectado.
            </p>
          )}
        </div>
      </Card>

      {/* 2. Destinatário */}
      <Card>
        <CardHeader title="2. Destinatário autorizado" subtitle="Em modo de teste, só este endereço recebe e-mails" />
        <div className="p-5">
          <Input
            label="E-mail autorizado"
            type="email"
            value={form.authorized_recipient}
            onChange={(e) => setForm({ ...form, authorized_recipient: e.target.value })}
            placeholder="voce@gmail.com"
          />
        </div>
      </Card>

      {/* 3. Serviços */}
      <Card>
        <CardHeader title="3. Serviços permitidos" subtitle="Categorias que a IA pode usar (perfis e serviços são gerados automaticamente)" />
        <div className="p-5 flex flex-wrap gap-2">
          {CATS.map((c) => {
            const active = form.enabled_categories.includes(c.v);
            return (
              <button key={c.v} type="button" onClick={() => toggleCat(c.v)}
                className={`px-3 py-1.5 rounded-lg text-sm border ${active ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-600 border-slate-300'}`}>
                {c.l}
              </button>
            );
          })}
        </div>
      </Card>

      {/* 4. Limites e horários */}
      <Card>
        <CardHeader title="4. Limites, intervalos e horários" />
        <div className="p-5 grid md:grid-cols-3 gap-4">
          <Input label="Máx. e-mails por dia" type="number" min="1" value={form.max_per_day} onChange={(e) => setForm({ ...form, max_per_day: e.target.value })} />
          <Input label="Intervalo entre envios (min)" type="number" min="1" value={form.interval_minutes} onChange={(e) => setForm({ ...form, interval_minutes: e.target.value })} />
          <Input label="Duração da simulação (dias)" type="number" min="1" value={form.duration_days} onChange={(e) => setForm({ ...form, duration_days: e.target.value })} />
          <Input label="Hora início (0-23)" type="number" min="0" max="23" value={form.start_hour} onChange={(e) => setForm({ ...form, start_hour: e.target.value })} />
          <Input label="Hora fim (0-23)" type="number" min="0" max="23" value={form.end_hour} onChange={(e) => setForm({ ...form, end_hour: e.target.value })} />
          <Input label="Checagem de respostas (min)" type="number" min="1" value={form.poll_interval_minutes} onChange={(e) => setForm({ ...form, poll_interval_minutes: e.target.value })} />
          <div className="md:col-span-3">
            <span className="block text-sm font-medium text-slate-700 mb-2">Dias permitidos</span>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((d) => {
                const active = form.allowed_days.split(',').map(Number).includes(d.v);
                return (
                  <button key={d.v} type="button" onClick={() => toggleDay(d.v)}
                    className={`px-3 py-1 rounded-lg text-sm border ${active ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-600 border-slate-300'}`}>
                    {d.l}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </Card>

      {/* 5. Acompanhamentos e segurança */}
      <Card>
        <CardHeader title="5. Acompanhamentos e segurança" />
        <div className="p-5 space-y-4">
          <Input label="Máx. de mensagens de acompanhamento por conversa" type="number" min="0" value={form.max_followups_per_conversation} onChange={(e) => setForm({ ...form, max_followups_per_conversation: e.target.value })} />
          <Input label="Tentativas em caso de erro" type="number" min="1" value={form.max_attempts} onChange={(e) => setForm({ ...form, max_attempts: e.target.value })} />
          <Toggle checked={form.auto_mode} onChange={(v) => setForm({ ...form, auto_mode: v })}
            label="Ativar modo automático (gerar e enviar solicitações iniciais sozinho)" />
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <Toggle checked={form.auto_followup} onChange={(v) => setForm({ ...form, auto_followup: v })}
              label="Autorizar ENVIO AUTOMÁTICO de acompanhamentos (sem aprovar cada um)" />
            <p className="text-xs text-amber-700 mt-2">
              Recomendado começar DESLIGADO: a IA prepara os acompanhamentos e você aprova os
              primeiros. Depois dos testes, ligue aqui (ou em Automações) para o envio 100% automático.
            </p>
          </div>
        </div>
      </Card>

      {msg && <div className="text-sm bg-slate-100 rounded-lg px-3 py-2">{msg}</div>}
      <div className="flex justify-end">
        <Button onClick={finish} disabled={busy}>
          {busy ? 'Salvando...' : 'Concluir configuração'}
        </Button>
      </div>
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-800 text-right">{children}</span>
    </div>
  );
}
