const { pool } = require('../db');

// Cache en memoria (rol -> Set<clave>) - proceso Node unico, sin cluster/PM2
// (confirmado via Dockerfile/index.js), asi que no hace falta invalidacion
// entre procesos. Se recarga al guardar un cambio en la pantalla Permission,
// asi que un edit aplica en el siguiente request del usuario afectado sin
// esperar restart ni re-login (el rol va en el JWT, el permiso se chequea
// en vivo contra esta cache).
let cache = new Map();

async function reloadPermissionsCache() {
  const { rows } = await pool.query(
    `SELECT rp.rol, p.clave FROM rol_permisos rp JOIN permisos p ON p.id = rp.permiso_id`,
  );
  const next = new Map();
  for (const r of rows) {
    if (!next.has(r.rol)) next.set(r.rol, new Set());
    next.get(r.rol).add(r.clave);
  }
  cache = next;
}

function hasPermiso(rol, clave) {
  return cache.get(rol)?.has(clave) ?? false;
}

module.exports = { reloadPermissionsCache, hasPermiso };
