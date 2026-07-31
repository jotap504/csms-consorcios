import { Navigate, useLocation } from 'react-router-dom';
import { getSession } from '@/lib/auth';

export default function ProtectedRoute({ role, roles, children }) {
  const allowed = roles ?? [role];
  const session = getSession();
  const location = useLocation();
  const next = encodeURIComponent(location.pathname + location.search);
  if (!session) return <Navigate to={`/login?next=${next}`} replace />;
  if (!allowed.includes(session.rol)) return <Navigate to={`/login?next=${next}`} replace />;
  return children;
}
