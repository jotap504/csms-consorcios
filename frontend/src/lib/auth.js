export function saveSession({ token, rol, consorcioId, ufId }) {
  localStorage.setItem('csms_token', token);
  localStorage.setItem('csms_user', JSON.stringify({ rol, consorcioId, ufId }));
}

export function getSession() {
  const token = localStorage.getItem('csms_token');
  const raw = localStorage.getItem('csms_user');
  if (!token || !raw) return null;
  return { token, ...JSON.parse(raw) };
}

export function clearSession() {
  localStorage.removeItem('csms_token');
  localStorage.removeItem('csms_user');
}

export function homeForRole(rol) {
  switch (rol) {
    case 'superadmin':
      return '/superadmin';
    case 'instalador':
      return '/instalador';
    case 'consorcio_admin':
      return '/consorcio';
    case 'residente':
      return '/residente';
    default:
      return '/login';
  }
}
