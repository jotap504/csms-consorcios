// Recordatorios por Telegram de tareas con vencimiento (ver
// schema_gestion_telegram.sql). tickRecordatorios() se llama periodicamente
// (setInterval en index.js, mismo patron que tickRamp en campaniaRamp.js) -
// idempotente via avisado_en, asi que un tick repetido o un reinicio no manda
// el mismo aviso dos veces.

const { pool } = require('../db');
const { telegramConfigurado, enviarMensajeTelegram } = require('./telegram');

async function tickRecordatorios() {
  if (!telegramConfigurado()) return { avisados: 0 };

  const { rows: pendientes } = await pool.query(
    `SELECT t.id, t.titulo, t.vence_en, t.asignado_a_usuario_id, t.creado_por_usuario_id,
            n.nombre AS negocio_nombre
       FROM gestion_tareas t JOIN gestion_negocios n ON n.id = t.negocio_id
       WHERE t.vence_en IS NOT NULL AND t.avisado_en IS NULL AND t.estado != 'hecho'
         AND t.vence_en - (COALESCE(t.aviso_previo_minutos, 60) * INTERVAL '1 minute') <= NOW()`,
  );

  let avisados = 0;
  for (const tarea of pendientes) {
    const usuarioId = tarea.asignado_a_usuario_id || tarea.creado_por_usuario_id;
    // eslint-disable-next-line no-await-in-loop
    const vinculo = usuarioId ? await pool.query('SELECT chat_id FROM telegram_vinculos WHERE usuario_id = $1', [usuarioId]) : { rows: [] };
    const chatId = vinculo.rows[0]?.chat_id;
    const fecha = new Intl.DateTimeFormat('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    }).format(tarea.vence_en);
    if (chatId) {
      // eslint-disable-next-line no-await-in-loop
      await enviarMensajeTelegram(chatId, `Recordatorio (${tarea.negocio_nombre}): ${tarea.titulo} - ${fecha}hs`);
      avisados += 1;
    } else {
      console.warn(`[telegram] Tarea ${tarea.id} sin chat de Telegram vinculado para avisar.`);
    }
    // Se marca avisado igual sin chat vinculado - evita reintentar para
    // siempre una tarea de un usuario que nunca se vinculo.
    // eslint-disable-next-line no-await-in-loop
    await pool.query('UPDATE gestion_tareas SET avisado_en = NOW() WHERE id = $1', [tarea.id]);
  }
  return { avisados };
}

module.exports = { tickRecordatorios };
