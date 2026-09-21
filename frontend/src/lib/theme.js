const STORAGE_KEY = 'bilon-theme'; // 'light' | 'dark' | null (null = seguir al sistema)

function systemPrefersDark() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

export function getStoredTheme() {
  const v = localStorage.getItem(STORAGE_KEY);
  return v === 'light' || v === 'dark' ? v : null;
}

export function getEffectiveTheme() {
  return getStoredTheme() ?? (systemPrefersDark() ? 'dark' : 'light');
}

// Aplica la clase en <html> - index.css redefine todas las --color-* (y las
// --lp-* de .landing) bajo :root.dark, asi que este toggle alcanza para que
// TODA la app (paneles internos incluidos) cambie de tema sin tocar
// componente por componente.
export function applyTheme(theme) {
  const root = document.documentElement;
  root.classList.remove('dark', 'light');
  if (theme) root.classList.add(theme);
}

export function setTheme(theme) {
  if (theme) localStorage.setItem(STORAGE_KEY, theme);
  else localStorage.removeItem(STORAGE_KEY);
  applyTheme(theme ?? (systemPrefersDark() ? 'dark' : 'light'));
}

export function toggleTheme() {
  const next = getEffectiveTheme() === 'dark' ? 'light' : 'dark';
  setTheme(next);
  return next;
}

// Si el usuario nunca eligio manualmente, seguir los cambios de preferencia
// del sistema en vivo (por ejemplo si el celular pasa a modo oscuro solo de
// noche). Se re-suscribe solo mientras no haya override guardado.
export function watchSystemTheme(onChange) {
  const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
  if (!mq) return () => {};
  const handler = () => {
    if (!getStoredTheme()) {
      applyTheme(systemPrefersDark() ? 'dark' : 'light');
      onChange?.(getEffectiveTheme());
    }
  };
  mq.addEventListener('change', handler);
  return () => mq.removeEventListener('change', handler);
}
