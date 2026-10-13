import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth.jsx';
import { Spinner } from './components/ui.jsx';
import Layout from './components/Layout.jsx';

import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Requests from './pages/Requests.jsx';
import RequestDetail from './pages/RequestDetail.jsx';
import Conversations from './pages/Conversations.jsx';
import Automations from './pages/Automations.jsx';
import Services from './pages/Services.jsx';
import Profiles from './pages/Profiles.jsx';
import Reports from './pages/Reports.jsx';
import Gmail from './pages/Gmail.jsx';
import Settings from './pages/Settings.jsx';

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
      <Route path="/solicitacoes" element={<Protected><Requests /></Protected>} />
      <Route path="/solicitacoes/:id" element={<Protected><RequestDetail /></Protected>} />
      <Route path="/conversas" element={<Protected><Conversations /></Protected>} />
      <Route path="/automacoes" element={<Protected><Automations /></Protected>} />
      <Route path="/servicos" element={<Protected><Services /></Protected>} />
      <Route path="/perfis" element={<Protected><Profiles /></Protected>} />
      <Route path="/relatorios" element={<Protected><Reports /></Protected>} />
      <Route path="/gmail" element={<Protected><Gmail /></Protected>} />
      <Route path="/configuracoes" element={<Protected><Settings /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
