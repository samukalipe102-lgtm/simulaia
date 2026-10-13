import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { Card, CardHeader, Button, Input, Spinner } from '../components/ui.jsx';

export default function Settings() {
  const [settings, setSettings] = useState(null);
  const [pwd, setPwd] = useState({ currentPassword: '', newPassword: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function load() { setSettings(await api.get('/settings')); }
  useEffect(() => { load(); }, []);

  async function save() {
    setBusy(true); setMsg('');
    try {
      await api.put('/settings', {
        authorized_recipient: settings.authorized_recipient,
        poll_interval_minutes: Number(settings.poll_interval_minutes) || 2,
      });
      setMsg('Configurações salvas.');
      await load();
    } catch (e) { setMsg(e.message); } finally { setBusy(false); }
  }
  async function emergency(action) {
    setBusy(true); setMsg('');
    try { await api.post(`/settings/${action}`); await load(); setMsg(action === 'emergency-stop' ? '🛑 Envios automáticos interrompidos.' : 'Parada de emergência liberada.'); }
    catch (e) { setMsg(e.message); } finally { setBusy(false); }
  }
  async function changePassword(e) {
    e.preventDefault();
    setBusy(true); setMsg('');
    try { await api.post('/auth/change-password', pwd); setPwd({ currentPassword: '', newPassword: '' }); setMsg('Senha alterada com sucesso.'); }
    catch (e) { setMsg(e.message); } finally { setBusy(false); }
  }

  if (!settings) return <Spinner />;

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-slate-800">Configurações</h1>
      {msg && <div className="text-sm bg-slate-100 rounded-lg px-3 py-2">{msg}</div>}

      <Card>
        <CardHeader title="Conexão Gmail" subtitle="Integração oficial via OAuth 2.0" />
        <div className="p-5 text-sm text-slate-600 flex items-center justify-between">
          <span>Conecte e gerencie a conta de e-mail na página de integração.</span>
          <Link to="/gmail"><Button variant="secondary">Abrir Integração Gmail</Button></Link>
        </div>
      </Card>

      <Card>
        <CardHeader title="Sincronização e cópia administrativa" />
        <div className="p-5 space-y-4">
          <Input label="E-mail para cópia administrativa / destinatário autorizado"
            value={settings.authorized_recipient || ''}
            onChange={(e) => setSettings({ ...settings, authorized_recipient: e.target.value })}
            placeholder="adminedugestao@gmail.com" />
          <Input label="Intervalo de verificação da caixa (minutos)" type="number" min="1"
            value={settings.poll_interval_minutes || 2}
            onChange={(e) => setSettings({ ...settings, poll_interval_minutes: e.target.value })} />
          <Button onClick={save} disabled={busy}>Salvar</Button>
          <p className="text-xs text-slate-500">
            O sistema sincroniza os e-mails recebidos e as respostas que você envia pelo Gmail.
            Ele <strong>nunca</strong> responde automaticamente a alunos ou responsáveis.
          </p>
        </div>
      </Card>

      <Card>
        <CardHeader title="Parada de emergência" subtitle="Interrompe imediatamente os envios automáticos administrativos" />
        <div className="p-5 flex items-center gap-3">
          {settings.emergency_stop ? (
            <>
              <span className="text-red-600 font-medium">🛑 Parada ativa</span>
              <Button variant="secondary" onClick={() => emergency('emergency-clear')} disabled={busy}>Liberar</Button>
            </>
          ) : (
            <Button variant="danger" onClick={() => emergency('emergency-stop')} disabled={busy}>Acionar parada de emergência</Button>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="Alterar senha de administrador" />
        <form onSubmit={changePassword} className="p-5 grid md:grid-cols-3 gap-3 items-end">
          <Input label="Senha atual" type="password" value={pwd.currentPassword} onChange={(e) => setPwd({ ...pwd, currentPassword: e.target.value })} required />
          <Input label="Nova senha (mín. 8)" type="password" value={pwd.newPassword} onChange={(e) => setPwd({ ...pwd, newPassword: e.target.value })} required />
          <Button type="submit" disabled={busy}>Alterar senha</Button>
        </form>
      </Card>
    </div>
  );
}
