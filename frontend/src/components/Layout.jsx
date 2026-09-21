import { Link, useNavigate } from 'react-router-dom';
import { LogOut, KeyRound } from 'lucide-react';
import { clearSession, getSession } from '@/lib/auth';
import { Toaster } from '@/components/ui';
import ThemeToggle from '@/components/ThemeToggle';
import Logo from '@/components/Logo';
import ChangePasswordDialog from '@/components/ChangePasswordDialog';

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
      <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card/80 px-4 py-3 backdrop-blur sm:px-6">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <Link to={homeTo} className="shrink-0">
            <Logo className="h-8 w-auto" />
          </Link>
          <h1 className="truncate text-lg font-semibold">{title}</h1>
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          {session && <span className="hidden text-sm text-muted-foreground sm:inline">{session.rol}</span>}
          <ThemeToggle />
          <ChangePasswordDialog
            trigger={(
              <button
                type="button"
                title="Cambiar contrasena"
                className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <KeyRound className="h-4 w-4" />
                <span className="hidden sm:inline">Cambiar contrasena</span>
              </button>
            )}
          />
          <button
            onClick={handleLogout}
            className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Cerrar sesion</span>
          </button>
        </div>
      </header>
      <main className="p-4 sm:p-6">{children}</main>
      <Toaster />
    </div>
  );
}
