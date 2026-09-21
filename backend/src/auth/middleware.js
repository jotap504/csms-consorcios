const { verifyToken } = require('./jwt');
const { hasPermiso } = require('./permissions');

function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Falta token de autenticacion.' });
  }
  try {
    req.user = verifyToken(header.slice('Bearer '.length));
    next();
  } catch {
    return res.status(401).json({ error: 'Token invalido o expirado.' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.rol)) {
      return res.status(403).json({ error: 'No autorizado para este recurso.' });
    }
    next();
  };
}

// RBAC real: chequea contra rol_permisos (editable desde la pantalla
// Permission) en vez de una lista de roles hardcodeada en el codigo.
// superadmin nunca consulta rol_permisos - bypass estructural para que sea
// imposible auto-bloquear a todos los superadmin editando permisos desde
// la propia UI (ver plan RBAC).
function requirePermission(permKey) {
  return (req, res, next) => {
    if (!req.user) return res.status(403).json({ error: 'No autorizado para este recurso.' });
    if (req.user.rol === 'superadmin') return next();
    if (!hasPermiso(req.user.rol, permKey)) {
      return res.status(403).json({ error: 'No autorizado para este recurso.' });
    }
    next();
  };
}

module.exports = { authenticate, requireRole, requirePermission };
