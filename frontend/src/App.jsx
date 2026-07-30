import { Routes, Route, Navigate } from 'react-router-dom';
import Login from '@/pages/Login';
import SuperAdminDashboard from '@/pages/SuperAdminDashboard';
import ConsorcioDashboard from '@/pages/ConsorcioDashboard';
import ResidenteDashboard from '@/pages/ResidenteDashboard';
import ProtectedRoute from '@/components/ProtectedRoute';
import { getSession, homeForRole } from '@/lib/auth';

function RootRedirect() {
  const session = getSession();
  return <Navigate to={session ? homeForRole(session.rol) : '/login'} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/login" element={<Login />} />
      <Route
        path="/superadmin"
        element={
          <ProtectedRoute role="superadmin">
            <SuperAdminDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/consorcio"
        element={
          <ProtectedRoute role="consorcio_admin">
            <ConsorcioDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/residente"
        element={
          <ProtectedRoute role="residente">
            <ResidenteDashboard />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<RootRedirect />} />
    </Routes>
  );
}
