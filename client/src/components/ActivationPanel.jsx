import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { Card, CardHeader, Button, Input } from './ui.jsx';

const STATE_UI = {
  ok: { icon: '✅', cls: 'text-emerald-700' },
  nao_conectado: { icon: '⚪', cls: 'text-slate-500' },
  autenticacao_necessaria: { icon: '🔑', cls: 'text-amber-700' },
  permissao_insuficiente: { icon: '⚠️', cls: 'text-amber-700' },
  falha_no_envio: { icon: '❌', cls: 'text-red-700' },
  falha_no_recebimento: { icon: '❌', cls: 'text-red-700' },
  verificando: { icon: '⏳', cls: 'text-blue-700' },
};

export default function ActivationPanel() {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [testTo, setTestTo] = useState('');
  const [testResult, setTestResult] = useState(null);

  async function load() { setStatus(await api.get('/activation/status')); }
  useEffect(() => { load(); }, []);

  async function activate() {
    setBusy(true); setToast('');
    try {
      const r = await api.post('/activation/activate');
      setStatus((s) => ({ ...s, ...r }));
      setToast('✅ Serviço ativo! A IA vai gerar e enviar as solicitações ao Outlook.');
    } catch (e) {
      // 409 traz as pendências
      await load();
      setToast(`⚠️ Ainda não é possível ativar: ${e.message}. Resolva as pendências abaixo.`);
    } finally { setBusy(false); }
  }
  async function deactivate() {
    setBusy(true);
    try { await api.post('/activation/deactivate'); await load(); setToast('IA desativada.'); }
    finally { setBusy(false); }
  }
  async function testSend() {
    setBusy(true); setTestResult(null);
    try {
      const r = await api.post('/activation/test-send', { to: testTo });
      setTestResult({ ok: true, msg: `E-mail de teste aceito pelo provedor (id ${r.messageId}). Verifique a caixa de ${r.to}.` });
    } catch (e) {
      setTestResult({ ok: false, msg: e.message });
    } finally { setBusy(false); }
  }

  if (!status) return null;
  const serviceActive = status.auto_mode;

  return (
    <Card className={serviceActive ? 'border-emerald-200' : 'border-brand-200'}>
      <CardHeader
        title="Ativação do serviço de e-mails"
        subtitle="Executa verificações reais no backend antes de ligar a IA"
        actions={<span className={`text-sm font-medium ${serviceActive ? 'text-emerald-700' : 'text-slate-500'}`}>{serviceActive ? '🟢 Serviço ativo' : '⚪ Inativo'}</span>}
      />
      <div className="p-5 space-y-4">
        {/* Botão principal */}
        <div className="flex flex-wrap gap-2">
          {!serviceActive ? (
            <button onClick={activate} disabled={busy}
              className="px-5 py-3 rounded-xl bg-gradient-to-r from-brand-600 to-brand-700 text-white font-semibold shadow-sm hover:shadow-md hover:from-brand-700 hover:to-brand-800 transition-all disabled:opacity-60">
              {busy ? 'Verificando…' : '⚡ ATIVAR E TESTAR ENVIO DE E-MAILS'}
            </button>
          ) : (
            <Button variant="secondary" onClick={deactivate} disabled={busy}>Desativar IA</Button>
          )}
          <Button variant="ghost" onClick={load} disabled={busy}>Reverificar</Button>
        </div>

        {toast && <div className="text-sm bg-slate-100 rounded-lg px-3 py-2">{toast}</div>}

        {/* Resultado de cada verificação */}
        <div className="space-y-2">
          {(status.steps || []).map((s) => {
            const ui = STATE_UI[s.state] || STATE_UI.nao_conectado;
            return (
              <div key={s.key} className="flex items-start gap-2 text-sm">
                <span>{ui.icon}</span>
                <div>
                  <span className={`font-medium ${ui.cls}`}>{s.label}</span>
                  {s.detail && <span className="text-slate-500"> — {s.detail}</span>}
                  {s.fix && s.state !== 'ok' && <div className="text-xs text-amber-700">Como resolver: {s.fix}</div>}
                </div>
              </div>
            );
          })}
        </div>

        {/* Envio de teste */}
        <div className="border-t border-slate-100 pt-4">
          <div className="text-sm font-medium text-slate-700 mb-2">Enviar e-mail de teste</div>
          <div className="flex flex-wrap gap-2 items-end">
            <Input label="Enviar para" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="seu-email@exemplo.com" className="max-w-xs" />
            <Button onClick={testSend} disabled={busy || !testTo}>Enviar teste</Button>
          </div>
          {testResult && (
            <div className={`text-sm mt-2 rounded-lg px-3 py-2 ${testResult.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>
              {testResult.ok ? '✅ ' : '❌ '}{testResult.msg}
            </div>
          )}
          <p className="text-xs text-slate-400 mt-1">
            O provedor aceitar o envio não garante a entrega — confirme na caixa do destinatário.
          </p>
        </div>
      </div>
    </Card>
  );
}
