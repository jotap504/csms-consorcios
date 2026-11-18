const crypto = require('crypto');

// Token simple para el link de "darse de baja" en campañas: no hace falta
// login para clickearlo desde el mail, pero tampoco queremos que cualquiera
// pueda dar de baja a otro contacto adivinando su id.
function tokenBaja(contactoId) {
  return crypto.createHmac('sha256', process.env.JWT_SECRET || 'dev-secret').update(String(contactoId)).digest('hex').slice(0, 16);
}

// Mismo esquema que tokenBaja, pero para el pixel de apertura (namespace
// "pixel:" para que no valga el mismo token entre los dos usos).
function tokenPixel(destinatarioId) {
  return crypto.createHmac('sha256', process.env.JWT_SECRET || 'dev-secret').update(`pixel:${destinatarioId}`).digest('hex').slice(0, 16);
}

// Mismo esquema, namespace "click:" - firma el destinatarioId para el
// redirect de tracking de clicks (no la URL de destino: esa viaja en claro
// en el query, no hace falta firmarla para este caso de uso).
function tokenClick(destinatarioId) {
  return crypto.createHmac('sha256', process.env.JWT_SECRET || 'dev-secret').update(`click:${destinatarioId}`).digest('hex').slice(0, 16);
}

module.exports = { tokenBaja, tokenPixel, tokenClick };
