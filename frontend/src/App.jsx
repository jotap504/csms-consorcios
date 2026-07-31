import { Routes, Route, Navigate } from 'react-router-dom';
import Login from '@/pages/Login';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import SuperAdminDashboard from '@/pages/SuperAdminDashboard';
import InstaladorHome from '@/pages/InstaladorHome';
import AdminConsorcio from '@/pages/AdminConsorcio';
import ConsorcioDashboard from '@/pages/ConsorcioDashboard';
import ResidenteDashboard from '@/pages/ResidenteDashboard';
import CargarCarga from '@/pages/CargarCarga';
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
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route
        path="/superadmin"
        element={
          <ProtectedRoute role="superadmin">
            <SuperAdminDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/instalador"
        element={
          <ProtectedRoute role="instalador">
            <InstaladorHome />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/consorcio/:id"
        element={
          <ProtectedRoute roles={['superadmin', 'instalador']}>
            <AdminConsorcio />
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
      <Route
        path="/cargar/:ocppId"
        element={
          <ProtectedRoute role="residente">
            <CargarCarga />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<RootRedirect />} />
    </Routes>
  );
}
