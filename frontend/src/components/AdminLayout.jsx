import { NavLink, useNavigate } from 'react-router-dom';
import { LogOut, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { clearSession, getSession } from '@/lib/auth';
import { Toaster } from '@/components/ui';
import ThemeToggle from '@/components/ThemeToggle';
import Logo from '@/components/Logo';
import ChangePasswordDialog from '@/components/ChangePasswordDialog';

// Shell tipo CRM (sidebar + topbar) para el lado de gestion interna
// (superadmin/instalador). Los paneles de uso final (residente, proveedor,
// consorcio_admin) siguen con el Layout simple de barra superior - son de un
// solo proposito, no necesitan navegacion entre secciones.
//
// Sidebar responsive: rail angosto de solo iconos por debajo de md (768px,
// donde tampoco entra un mouse para hover-tooltips, por eso el title nativo
// del NavLink como fallback), sidebar completo con etiquetas de ahi para arriba.
export default function AdminLayout({
  title, navItems, breadcrumb, children,
}) {
  const navigate = useNavigate();
  const session = getSession();

  function handleLogout() {
    clearSession();
    navigate('/login');
  }

  return (
    <div className="flex min-h-dvh">
      <aside className="flex w-[3.2rem] shrink-0 flex-col border-r border-border bg-card md:w-48">
        <div className="flex h-16 items-center justify-center border-b border-border md:justify-start md:px-5">
          <Logo className="hidden h-7 w-auto md:block" />
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-teal-400 to-cyan-600 text-white md:hidden">
            <Zap className="h-4 w-4" />
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 p-2 md:p-3">
          {navItems.map(({
            to, label, icon: Icon, end, section,
          }, i) => (
            <div key={to}>
              {section && (
                <div className={cn('border-t border-border', i === 0 ? 'hidden' : 'my-2')}>
                  <p className="mt-2 hidden px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:block">{section}</p>
                </div>
              )}
              <NavLink
                to={to}
                end={end}
                title={label}
                className={({ isActive }) => cn(
                  'flex items-center justify-center gap-2.5 rounded-lg border-l-[3px] px-3 py-3 text-sm font-medium transition-colors md:justify-start md:py-2',
                  isActive
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-transparent text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {Icon && <Icon className="h-5 w-5 shrink-0 md:h-4 md:w-4" />}
                <span className="hidden md:inline">{label}</span>
              </NavLink>
            </div>
          ))}
        </nav>
        <div className="border-t border-border p-2 md:p-3">
          <div className="mb-2 hidden px-3 text-xs text-muted-foreground md:block">{session?.rol}</div>
          <ChangePasswordDialog />
          <button
            onClick={handleLogout}
            title="Cerrar sesion"
            className="flex w-full cursor-pointer items-center justify-center gap-2.5 rounded-lg px-3 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:justify-start md:py-2"
          >
            <LogOut className="h-5 w-5 shrink-0 md:h-4 md:w-4" />
            <span className="hidden md:inline">Cerrar sesion</span>
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-3 border-b border-border bg-card/80 px-4 backdrop-blur md:px-6">
          {breadcrumb && (
            <span className="hidden items-center gap-2 sm:flex">
              <span className="text-sm text-muted-foreground">{breadcrumb}</span>
              <span className="text-sm text-muted-foreground">/</span>
            </span>
          )}
          <h1 className="truncate text-base font-semibold md:text-lg">{title}</h1>
          <ThemeToggle className="ml-auto" />
        </header>
        <main className="flex-1 overflow-x-hidden p-4 pb-24 md:p-6">{children}</main>
      </div>
      <Toaster />
    </div>
  );
}
