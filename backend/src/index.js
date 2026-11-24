require('dotenv').config();
const app = require('./app');
const { mailConfigurado, revisarBandeja } = require('./services/mail');
const { elasticEmailConfigurado } = require('./services/elasticEmail');
const { tickRamp } = require('./services/campaniaRamp');
const { telegramConfigurado } = require('./services/telegram');
const { tickRecordatorios } = require('./services/telegramRecordatorios');
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

// Rampa de warm-up de envios masivos de campanias: cada 20 minutos revisa si
// alguna corrida "en_curso" necesita el lote de hoy (ver services/campaniaRamp.js).
if (elasticEmailConfigurado()) {
  setInterval(() => {
    tickRamp()
      .then(({ procesados }) => {
        if (procesados > 0) console.log(`[envios] ${procesados} envio(s) de campania procesados.`);
      })
      .catch((err) => console.error('[envios] Error en ramp automatico:', err.message));
  }, 20 * 60 * 1000);
}

// Recordatorios de tareas con vencimiento (ver schema_gestion_telegram.sql)
// cada 5 minutos - el margen contra aviso_previo_minutos no necesita mas
// resolucion que esa.
if (telegramConfigurado()) {
  setInterval(() => {
    tickRecordatorios()
      .then(({ avisados }) => {
        if (avisados > 0) console.log(`[telegram] ${avisados} recordatorio(s) mandado(s).`);
      })
      .catch((err) => console.error('[telegram] Error en recordatorios automaticos:', err.message));
  }, 5 * 60 * 1000);
}
