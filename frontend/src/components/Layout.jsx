import { Link, useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { clearSession, getSession } from '@/lib/auth';

export default function Layout({ title, navItems, children }) {
  const navigate = useNavigate();
  const session = getSession();
  const homeTo = navItems?.[0]?.to ?? '/';

  function handleLogout() {
    clearSession();
    navigate('/login');
  }

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-border bg-white/80 px-6 py-3 backdrop-blur">
        <div className="flex items-center gap-4">
          <Link to={homeTo}>
            <img src="/logo.png" alt="Bilon Smart Buildings" className="h-8 w-auto" />
          </Link>
          <h1 className="text-lg font-semibold">{title}</h1>
        </div>
        <div className="flex items-center gap-4">
          {session && <span className="text-sm text-muted-foreground">{session.rol}</span>}
          <button
            onClick={handleLogout}
            className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesion
          </button>
        </div>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
