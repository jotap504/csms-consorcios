const crypto = require('crypto');

// Token simple para el link de "darse de baja" en campañas: no hace falta
// login para clickearlo desde el mail, pero tampoco queremos que cualquiera
// pueda dar de baja a otro contacto adivinando su id.
function tokenBaja(contactoId) {
  return crypto.createHmac('sha256', process.env.JWT_SECRET || 'dev-secret').update(String(contactoId)).digest('hex').slice(0, 16);
}

module.exports = { tokenBaja };
