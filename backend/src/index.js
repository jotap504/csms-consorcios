require('dotenv').config();
const app = require('./app');
const { mailConfigurado, revisarBandeja } = require('./services/mail');
const { reloadPermissionsCache } = require('./auth/permissions');

const PORT = process.env.PORT || 3001;

reloadPermissionsCache().catch((err) => console.error('[permisos] Error cargando cache inicial:', err.message));

app.listen(PORT, () => {
  console.log(`CSMS backend escuchando en puerto ${PORT}`);
});

// Revisa la bandeja de entrada comercial cada 10 minutos y crea seguimientos
// automaticamente para los contactos que respondieron. Si falla una vuelta
// (ej. Gmail no responde), simplemente lo reintenta en la siguiente.
if (mailConfigurado()) {
  setInterval(() => {
    revisarBandeja()
      .then(({ procesados }) => {
        if (procesados.length > 0) console.log(`[bandeja] ${procesados.length} mail(s) procesado(s) automaticamente.`);
      })
      .catch((err) => console.error('[bandeja] Error en revision automatica:', err.message));
  }, 10 * 60 * 1000);
}
