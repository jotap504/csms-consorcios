import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { getEffectiveTheme, toggleTheme, watchSystemTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';

// Boton de tema claro/oscuro. El estado real vive en <html class="dark|light">
// (ver lib/theme.js) - este componente solo refleja/dispara ese cambio, asi
// que se puede montar en cualquier layout (AdminLayout, Layout, Landing) sin
// contexto compartido.
export default function ThemeToggle({ className }) {
  const [theme, setThemeState] = useState(() => getEffectiveTheme());

  useEffect(() => watchSystemTheme(setThemeState), []);

  function handleClick() {
    setThemeState(toggleTheme());
  }

  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={handleClick}
      title={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      aria-label={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      className={cn(
        'flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
        className,
      )}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
