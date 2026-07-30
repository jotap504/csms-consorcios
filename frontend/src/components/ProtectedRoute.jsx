import { Navigate } from 'react-router-dom';
import { getSession } from '@/lib/auth';

export default function ProtectedRoute({ role, children }) {
  const session = getSession();
  if (!session) return <Navigate to="/login" replace />;
  if (session.rol !== role) return <Navigate to="/login" replace />;
  return children;
}
