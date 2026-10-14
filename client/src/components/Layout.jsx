import { NavLink, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../hooks/useAuth.jsx';
import { api } from '../lib/api.js';

const NAV = [
  { to: '/', label: 'Dashboard', icon: '📊', end: true },
  { to: '/processos', label: 'Processos escolares', icon: '🗂️' },
  { to: '/caixa-entrada', label: 'Caixa de entrada', icon: '✉️' },
  { to: '/respostas', label: 'Respostas enviadas', icon: '↩️' },
  { to: '/documentos', label: 'Documentos', icon: '📎' },
  { to: '/automacao', label: 'Automação', icon: '⚙️' },
  { to: '/novidades', label: 'O que há de novo?', icon: '✨' },
  { to: '/configuracoes', label: 'Configurações', icon: '🔐' },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [stopping, setStopping] = useState(false);

  async function emergencyStop() {
    if (!confirm('Interromper TODAS as automações imediatamente?')) return;
    setStopping(true);
    try {
      await api.post('/settings/emergency-stop');
      alert('🛑 Todas as automações foram interrompidas.');
    } catch (e) {
      alert(e.message);
    } finally {
      setStopping(false);
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside
        className={`fixed md:static z-30 inset-y-0 left-0 w-64 bg-brand-900 text-white flex flex-col transition-transform ${
          open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div className="px-5 py-5 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-white/15 flex items-center justify-center font-bold text-white">E</div>
            <div>
              <div className="font-bold text-lg leading-tight">EduGestão</div>
              <div className="text-xs text-brand-200">Atendimento</div>
            </div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive ? 'bg-white/15 font-medium' : 'text-brand-100 hover:bg-white/10'
                }`
              }
            >
              <span>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-white/10">
          <button
            onClick={emergencyStop}
            disabled={stopping}
            className="w-full bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg py-2 transition-colors disabled:opacity-50"
          >
            🛑 Parada de emergência
          </button>
        </div>
      </aside>

      {open && (
        <div className="fixed inset-0 bg-black/40 z-20 md:hidden" onClick={() => setOpen(false)} />
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-slate-200 px-5 py-3 flex items-center justify-between sticky top-0 z-10">
          <button className="md:hidden text-slate-600" onClick={() => setOpen(true)}>
            ☰
          </button>
          <div className="text-sm text-slate-500 hidden md:block">
            Sistema independente de simulação de solicitações escolares
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-600">{user?.email}</span>
            <button
              onClick={() => {
                logout();
                navigate('/login');
              }}
              className="text-sm text-slate-500 hover:text-red-600"
            >
              Sair
            </button>
          </div>
        </header>
        <main className="flex-1 p-5 max-w-7xl w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
