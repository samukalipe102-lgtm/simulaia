import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { Card, CardHeader, Button, Input, Toggle, Spinner } from '../components/ui.jsx';

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
        test_mode: !!settings.test_mode,
        authorized_recipient: settings.authorized_recipient,
      });
      setMsg('Configurações salvas.');
      await load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(false); }
  }

  async function emergency(action) {
    setBusy(true); setMsg('');
    try {
      await api.post(`/settings/${action}`);
      await load();
      setMsg(action === 'emergency-stop' ? '🛑 Automações interrompidas.' : 'Parada de emergência liberada.');
    } catch (e) { setMsg(e.message); }
    finally { setBusy(false); }
  }

  async function changePassword(e) {
    e.preventDefault();
    setBusy(true); setMsg('');
    try {
      await api.post('/auth/change-password', pwd);
      setPwd({ currentPassword: '', newPassword: '' });
      setMsg('Senha alterada com sucesso.');
    } catch (e) { setMsg(e.message); }
    finally { setBusy(false); }
  }

  if (!settings) return <Spinner />;

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-slate-800">Configurações e segurança</h1>
      {msg && <div className="text-sm bg-slate-100 rounded-lg px-3 py-2">{msg}</div>}

      <Card>
        <CardHeader title="Modo de teste e destinatário autorizado" />
        <div className="p-5 space-y-4">
          <Toggle checked={!!settings.test_mode} onChange={(v) => setSettings({ ...settings, test_mode: v ? 1 : 0 })}
            label="Modo de teste (envia SOMENTE para o destinatário autorizado)" />
          <Input label="Destinatário autorizado (sua caixa de e-mail)"
            value={settings.authorized_recipient || ''}
            onChange={(e) => setSettings({ ...settings, authorized_recipient: e.target.value })}
            placeholder="voce@gmail.com" />
          <Button onClick={save} disabled={busy}>Salvar</Button>
        </div>
      </Card>

      <Card>
        <CardHeader title="Formato das mensagens" subtitle="Aparência profissional vs. rótulo de simulação" />
        <div className="p-5 space-y-3">
          <Toggle checked={!!settings.real_mode} onChange={(v) => setSettings({ ...settings, real_mode: v ? 1 : 0 })}
            label="Modo profissional (remove “[SIMULAÇÃO]”, rodapé de teste e “perfil fictício”)" />
          <p className="text-xs text-slate-500">
            Com o modo profissional ligado, as mensagens saem com aparência de atendimento real
            (sem marcadores de simulação). <strong>O destinatário continua sendo apenas a sua caixa
            autorizada</strong> — não há envio para terceiros. Lembre de clicar em “Salvar”.
          </p>
          <Button onClick={save} disabled={busy}>Salvar</Button>
        </div>
      </Card>

      <Card>
        <CardHeader title="Parada de emergência" subtitle="Interrompe imediatamente todas as automações" />
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
