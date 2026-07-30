import { Navigate } from 'react-router-dom';
import { getSession } from '@/lib/auth';

export default function ProtectedRoute({ role, roles, children }) {
  const allowed = roles ?? [role];
  const session = getSession();
  if (!session) return <Navigate to="/login" replace />;
  if (!allowed.includes(session.rol)) return <Navigate to="/login" replace />;
  return children;
}
