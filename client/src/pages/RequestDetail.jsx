import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { Card, CardHeader, StatusBadge, Button, Spinner } from '../components/ui.jsx';

export default function RequestDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function load() {
    setData(await api.get(`/requests/${id}`));
  }
  useEffect(() => { load(); }, [id]);

  async function action(fn, okMsg) {
    setBusy(true); setMsg('');
    try { await fn(); setMsg(okMsg); await load(); }
    catch (e) { setMsg(`Erro: ${e.message}`); }
    finally { setBusy(false); }
  }

  if (!data) return <Spinner />;
  const { request, messages } = data;

  return (
    <div className="space-y-5">
      <Link to="/solicitacoes" className="text-sm text-brand-700 hover:underline">← Voltar</Link>

      <Card>
        <CardHeader
          title={request.subject}
          subtitle={`${request.public_id} · perfil fictício: ${request.profile_name} (${request.profile_role})`}
          actions={<StatusBadge status={request.status} />}
        />
        <div className="p-5 grid md:grid-cols-2 gap-3 text-sm">
          <Info label="Categoria" value={request.category} />
          <Info label="Destinatário" value={request.recipient || '—'} />
          <Info label="Tentativas" value={request.attempts} />
          <Info label="Fictícia" value={request.fictitious ? 'Sim' : 'Não'} />
          <Info label="Gmail thread" value={request.gmail_thread_id || '—'} />
          <Info label="Gmail message" value={request.gmail_message_id || '—'} />
          <Info label="Enviada em" value={request.sent_at || '—'} />
          <Info label="Última atualização" value={request.updated_at} />
          {request.last_error && <Info label="Último erro" value={request.last_error} error />}
        </div>
        <div className="px-5 pb-5 flex flex-wrap gap-2">
          {['generated', 'scheduled', 'error'].includes(request.status) && (
            <Button variant="success" onClick={() => action(() => api.post(`/requests/${id}/send`), 'Enviado.')} disabled={busy}>
              Enviar e-mail
            </Button>
          )}
          <Button variant="secondary" onClick={() => action(() => api.post('/requests/sync'), 'Sincronizado.')} disabled={busy}>
            Sincronizar respostas
          </Button>
          {request.status === 'replied' && (
            <Button onClick={() => action(() => api.post(`/requests/${id}/followup`), 'Acompanhamento gerado (aguardando aprovação).')} disabled={busy}>
              Gerar acompanhamento (IA)
            </Button>
          )}
        </div>
      </Card>

      {msg && <div className="text-sm bg-slate-100 rounded-lg px-3 py-2">{msg}</div>}

      <Card>
        <CardHeader title="Histórico cronológico" subtitle="Mensagens enviadas e respostas recebidas" />
        <div className="p-5 space-y-4">
          {messages.length === 0 && <p className="text-slate-400 text-sm">Nenhuma mensagem ainda.</p>}
          {messages.map((m) => (
            <div
              key={m.id}
              className={`rounded-lg border p-4 ${
                m.direction === 'outbound' ? 'border-brand-100 bg-brand-50' : 'border-emerald-100 bg-emerald-50'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-slate-600">
                  {m.direction === 'outbound' ? '→ Enviada' : '← Recebida'} · {m.author || '—'}
                  {m.is_followup ? ' · acompanhamento' : ''}
                </span>
                <span className="text-xs text-slate-400">{new Date(m.created_at).toLocaleString('pt-BR')}</span>
              </div>
              {m.subject && <div className="text-sm font-medium text-slate-800">{m.subject}</div>}
              <pre className="text-sm text-slate-700 whitespace-pre-wrap font-sans mt-1">{m.body}</pre>

              {m.approval_status === 'pending' && (
                <div className="flex gap-2 mt-3">
                  <Button variant="success" className="!px-3 !py-1"
                    onClick={() => action(() => api.post(`/requests/messages/${m.id}/approve`), 'Acompanhamento aprovado e enviado.')} disabled={busy}>
                    Aprovar e enviar
                  </Button>
                  <Button variant="danger" className="!px-3 !py-1"
                    onClick={() => action(() => api.post(`/requests/messages/${m.id}/reject`), 'Acompanhamento rejeitado.')} disabled={busy}>
                    Rejeitar
                  </Button>
                  <span className="text-xs text-purple-700 self-center">Aguardando aprovação do administrador</span>
                </div>
              )}
              {m.approval_status && m.approval_status !== 'pending' && (
                <div className="text-xs text-slate-500 mt-2">Status de aprovação: {m.approval_status}</div>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Info({ label, value, error }) {
  return (
    <div>
      <div className="text-xs text-slate-400">{label}</div>
      <div className={`font-medium ${error ? 'text-red-600' : 'text-slate-800'} break-all`}>{String(value)}</div>
    </div>
  );
}
