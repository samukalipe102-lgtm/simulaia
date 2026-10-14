import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth.jsx';
import { Spinner } from './components/ui.jsx';
import Layout from './components/Layout.jsx';

import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Processes from './pages/Processes.jsx';
import Inbox from './pages/Inbox.jsx';
import Sent from './pages/Sent.jsx';
import Documents from './pages/Documents.jsx';
import AdminAutomation from './pages/AdminAutomation.jsx';
import Gmail from './pages/Gmail.jsx';
import Settings from './pages/Settings.jsx';
import Updates from './pages/Updates.jsx';

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Protected><Dashboard /></Protected>} />
      <Route path="/processos" element={<Protected><Processes /></Protected>} />
      <Route path="/caixa-entrada" element={<Protected><Inbox /></Protected>} />
      <Route path="/respostas" element={<Protected><Sent /></Protected>} />
      <Route path="/documentos" element={<Protected><Documents /></Protected>} />
      <Route path="/automacao" element={<Protected><AdminAutomation /></Protected>} />
      <Route path="/novidades" element={<Protected><Updates /></Protected>} />
      <Route path="/gmail" element={<Protected><Gmail /></Protected>} />
      <Route path="/configuracoes" element={<Protected><Settings /></Protected>} />
      {/* Compatibilidade com rotas antigas */}
      <Route path="/conversas" element={<Navigate to="/processos" replace />} />
      <Route path="/solicitacoes" element={<Navigate to="/processos" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
