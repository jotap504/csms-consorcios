import { NavLink, useNavigate } from 'react-router-dom';
import { LogOut, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { clearSession, getSession } from '@/lib/auth';

export default function Layout({ title, navItems, children }) {
  const navigate = useNavigate();
  const session = getSession();

  function handleLogout() {
    clearSession();
    navigate('/login');
  }

  return (
    <div className="min-h-dvh md:flex">
      <aside className="flex shrink-0 flex-col border-b border-border bg-primary text-primary-foreground md:h-dvh md:w-60 md:border-b-0 md:border-r">
        <div className="flex items-center gap-2 px-5 py-5">
          <Zap className="h-5 w-5" />
          <span className="font-semibold tracking-tight">CSMS Consorcios</span>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive ? 'bg-white/15 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white',
                )
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-white/10 px-3 py-4">
          <button
            onClick={handleLogout}
            className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesion
          </button>
        </div>
      </aside>

      <div className="flex-1">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-white/80 px-6 py-4 backdrop-blur">
          <h1 className="text-lg font-semibold">{title}</h1>
          {session && <span className="text-sm text-muted-foreground">{session.rol}</span>}
        </header>
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
