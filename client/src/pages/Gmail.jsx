import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { Card, CardHeader, Button, Input, Spinner } from '../components/ui.jsx';

export default function Gmail() {
  const [status, setStatus] = useState(null);
  const [settings, setSettings] = useState(null);
  const [creds, setCreds] = useState({ google_client_id: '', google_client_secret: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function load() {
    const [st, cfg] = await Promise.all([api.get('/gmail/status'), api.get('/settings')]);
    setStatus(st);
    setSettings(cfg);
    setCreds((c) => ({ ...c, google_client_id: cfg.google_client_id || '' }));
  }
  useEffect(() => {
    load();
    const t = setInterval(() => api.get('/gmail/status').then(setStatus), 10000);
    return () => clearInterval(t);
  }, []);

  async function saveCreds() {
    setBusy(true); setMsg('');
    try {
      await api.put('/settings/google', {
        google_client_id: creds.google_client_id,
        // envia o secret só se o usuário digitou algo novo
        ...(creds.google_client_secret ? { google_client_secret: creds.google_client_secret } : {}),
      });
      setCreds((c) => ({ ...c, google_client_secret: '' }));
      setMsg('✅ Credenciais do Google salvas.');
      await load();
    } catch (e) { setMsg(`❌ ${e.message}`); }
    finally { setBusy(false); }
  }

  async function connect() {
    setBusy(true); setMsg('');
    try {
      const { url } = await api.get('/gmail/oauth/url');
      window.open(url, '_blank', 'width=520,height=640');
      setMsg('Autorize na janela aberta. O status atualiza automaticamente.');
    } catch (e) { setMsg(e.message); }
    finally { setBusy(false); }
  }

  async function test() {
    setBusy(true); setMsg('');
    try {
      const r = await api.post('/gmail/test');
      setMsg(`✅ Conexão OK: ${r.emailAddress} (${r.messagesTotal} mensagens)`);
    } catch (e) { setMsg(`❌ ${e.message}`); }
    finally { setBusy(false); }
  }

  async function disconnect() {
    if (!confirm('Desconectar a conta Gmail?')) return;
    await api.post('/gmail/disconnect');
    await load();
  }

  if (!status || !settings) return <Spinner />;

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-slate-800">Integração com Gmail</h1>

      {/* Configuração das credenciais Google direto na interface (modo desktop) */}
      <Card>
        <CardHeader
          title="Credenciais do Google (OAuth)"
          subtitle="Cole aqui o Client ID e o Client Secret do seu projeto no Google Cloud"
        />
        <div className="p-5 space-y-3">
          <Input
            label="Client ID"
            value={creds.google_client_id}
            onChange={(e) => setCreds({ ...creds, google_client_id: e.target.value })}
            placeholder="123...apps.googleusercontent.com"
          />
          <Input
            label={settings.google_client_secret_set ? 'Client Secret (já salvo — digite para substituir)' : 'Client Secret'}
            type="password"
            value={creds.google_client_secret}
            onChange={(e) => setCreds({ ...creds, google_client_secret: e.target.value })}
            placeholder={settings.google_client_secret_set ? '•••••••• (mantém o atual se vazio)' : 'GOCSPX-...'}
          />
          <Button onClick={saveCreds} disabled={busy}>Salvar credenciais</Button>
          <p className="text-xs text-slate-500">
            O Client Secret é guardado apenas no banco local e nunca é enviado de volta ao navegador.
          </p>
        </div>
      </Card>

      <Card>
        <CardHeader title="Status da conexão" />
        <div className="p-5 space-y-3 text-sm">
          <Row label="Credenciais configuradas">{status.configured ? '✅ Sim' : '⚠️ Não — informe o Client ID e o Secret acima'}</Row>
          <Row label="Conta conectada">{status.connected ? `✅ ${status.email}` : '❌ Não conectada'}</Row>
          {status.lastError && <Row label="Último erro"><span className="text-red-600">{status.lastError}</span></Row>}
        </div>
        <div className="px-5 pb-5 flex flex-wrap gap-2">
          <Button onClick={connect} disabled={busy || !status.configured}>Conectar conta Gmail</Button>
          <Button variant="secondary" onClick={test} disabled={busy || !status.connected}>Testar conexão</Button>
          {status.connected && <Button variant="danger" onClick={disconnect} disabled={busy}>Desconectar</Button>}
        </div>
        {msg && <div className="mx-5 mb-5 text-sm bg-slate-100 rounded-lg px-3 py-2">{msg}</div>}
      </Card>

      <Card>
        <CardHeader title="Como configurar (Google Cloud)" />
        <div className="p-5 text-sm text-slate-600 space-y-2">
          <ol className="list-decimal ml-5 space-y-1">
            <li>No <strong>Google Cloud Console</strong>, crie/selecione um projeto.</li>
            <li>Ative a <strong>Gmail API</strong> em “APIs e serviços”.</li>
            <li>Configure a <strong>tela de consentimento OAuth</strong> (tipo Externo; adicione seu e-mail como usuário de teste).</li>
            <li>Crie credenciais <strong>OAuth 2.0 Client ID</strong> do tipo <em>Aplicativo da Web</em>.</li>
            <li>Em “URIs de redirecionamento autorizados”, adicione exatamente o valor de <code>GOOGLE_REDIRECT_URI</code> (ex.: <code>http://localhost:4000/api/gmail/oauth/callback</code>).</li>
            <li>Copie o Client ID e o Client Secret para o <code>.env</code> do backend.</li>
            <li>Escopos usados: <code>gmail.send</code>, <code>gmail.readonly</code>, <code>gmail.modify</code>, <code>userinfo.email</code>.</li>
          </ol>
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 mt-3">
            Os tokens OAuth ficam somente no backend (banco de dados). Nunca são enviados ao navegador.
          </p>
          <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-3 mt-2 space-y-1">
            <p className="font-medium text-slate-700">Erros comuns ao conectar:</p>
            <p><strong>redirect_uri_mismatch</strong> — a URI de redirecionamento no Google Cloud
              precisa ser idêntica à usada pelo app. No desktop:
              <code> http://127.0.0.1:4137/api/gmail/oauth/callback</code>.</p>
            <p><strong>Erro 403: org_internal</strong> — a tela de consentimento foi criada como
              <em> Interna</em>. Mude o tipo para <strong>Externo</strong> e adicione seu e-mail em
              <em> Usuários de teste</em>. Se não houver a opção “Tornar externo”, crie o projeto
              OAuth em uma conta Gmail comum (não-Workspace).</p>
          </div>
        </div>
      </Card>
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
