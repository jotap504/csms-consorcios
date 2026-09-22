// Rampa de "warm-up" para envios masivos de campanias: manda de a lotes
// crecientes por dia (en vez de todo junto) para no quemar la reputacion de
// un dominio/remitente nuevo en Elastic Email, y se auto-pausa si sube la
// tasa de rebotes/quejas. Ver schema_comercial_envios.sql.
//
// tickRamp() se llama periodicamente (setInterval en index.js, mismo patron
// que revisarBandeja en services/mail.js) y es idempotente: si ya se mando
// el lote de hoy para una corrida, no hace nada; si el proceso se reinicio a
// mitad de un lote, retoma desde donde quedo sin duplicar envios.

const { pool } = require('../db');
const { elasticEmailConfigurado, enviarViaElasticEmail, ElasticEmailPermanentError } = require('./elasticEmail');
const { prepararImagenesInline, personalizarCuerpo } = require('./campaniaEnvioHelpers');
const { tokenBaja } = require('../lib/tokenBaja');

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://192.168.1.38';

const RAMP_SCHEDULE_DEFAULT = [200, 200, 400, 400, 600, 600, 1000, 1000]; // dia 1..8, resto en el dia siguiente
const BOUNCE_RATE_PAUSA = 0.03; // 3% acumulado de la corrida
const QUEJA_RATE_PAUSA = 0.001; // 0.1% acumulado de la corrida
const QUEJA_ABS_MINIMA = 3; // no pausar por 1-2 quejas aisladas con pocos envios todavia
const DELAY_ENTRE_ENVIOS_MS = 250;
const FALLO_LOTE_ABORTAR_RATIO = 0.5; // si mas de la mitad del lote falla, asumimos caida transitoria

function rampSchedule() {
  const override = process.env.CAMPANIA_RAMP_SCHEDULE_OVERRIDE;
  if (!override) return RAMP_SCHEDULE_DEFAULT;
  return override.split(',').map((n) => Number(n.trim())).filter((n) => Number.isFinite(n) && n > 0);
}

function objetivoAcumulado(dia, schedule) {
  if (dia <= 0) return 0;
  if (dia <= schedule.length) return schedule.slice(0, dia).reduce((a, b) => a + b, 0);
  return Infinity; // pasado el largo del schedule: mandar todo lo que quede
}

const EVENTOS_API_URL = 'https://api.elasticemail.com/v4/events?limit=1000';

// Motivo por tipo de evento - se guarda en comercial_contactos.motivo_baja y
// en comercial_contactos_bajas_automaticas, visible en la UI de contactos.
function motivoPorEvento(categoria) {
  if (categoria.includes('bounce')) return { campo: 'rebotado', motivo: 'Rebote duro (campaña)' };
  if (categoria.includes('complaint') || categoria.includes('abuse') || categoria.includes('spam')) return { campo: 'queja', motivo: 'Queja de spam (campaña)' };
  if (categoria.includes('unsubscribe')) return { campo: null, motivo: 'Dado de baja (link en mail)' };
  return null;
}

// Reemplazo del webhook de Elastic Email (resultó ser función PRO, "Access
// Denied" en el plan free) - consulta el log de eventos de la cuenta y
// aplica rebotes/quejas/bajas a los destinatarios todavia 'enviado'. Sin
// cursor/paginacion persistida: reescanear los ultimos 1000 eventos en cada
// tick es barato con el volumen de esta cuenta, y es idempotente porque un
// destinatario ya resuelto no vuelve a matchear 'enviado'.
async function sincronizarEventosElasticEmail() {
  let response;
  try {
    response = await fetch(EVENTOS_API_URL, { headers: { 'X-ElasticEmail-ApiKey': process.env.ELASTIC_EMAIL_API_KEY } });
  } catch (err) {
    console.error('[envios] Error consultando /v4/events:', err.message);
    return;
  }
  if (!response.ok) return;
  const eventos = await response.json().catch(() => []);
  const runsAfectados = new Set();

  // eslint-disable-next-line no-restricted-syntax
  for (const evento of eventos) {
    const categoria = String(evento?.EventType || '').toLowerCase();
    const info = motivoPorEvento(categoria);
    if (!info || !evento?.TransactionID) continue; // eslint-disable-line no-continue

    // eslint-disable-next-line no-await-in-loop
    const destRes = await pool.query(
      `SELECT id AS destinatario_id, envio_id, contacto_id FROM comercial_campania_envios_destinatarios
         WHERE elastic_message_id = $1 AND estado = 'enviado'`,
      [evento.TransactionID],
    );
    const dest = destRes.rows[0];
    if (!dest) continue; // eslint-disable-line no-continue

    if (info.campo === 'rebotado') {
      // eslint-disable-next-line no-await-in-loop
      await pool.query(`UPDATE comercial_campania_envios_destinatarios SET estado = 'rebotado' WHERE id = $1`, [dest.destinatario_id]);
      // eslint-disable-next-line no-await-in-loop
      await pool.query(`UPDATE comercial_campania_envios SET rebotados = rebotados + 1, actualizado_en = NOW() WHERE id = $1`, [dest.envio_id]);
    } else if (info.campo === 'queja') {
      // eslint-disable-next-line no-await-in-loop
      await pool.query(`UPDATE comercial_campania_envios_destinatarios SET estado = 'queja' WHERE id = $1`, [dest.destinatario_id]);
      // eslint-disable-next-line no-await-in-loop
      await pool.query(`UPDATE comercial_campania_envios SET quejas = quejas + 1, actualizado_en = NOW() WHERE id = $1`, [dest.envio_id]);
    }

    if (dest.contacto_id) {
      // eslint-disable-next-line no-await-in-loop
      await pool.query(
        `UPDATE comercial_contactos SET no_contactar = TRUE, motivo_baja = $2 WHERE id = $1`,
        [dest.contacto_id, info.motivo],
      );
      // eslint-disable-next-line no-await-in-loop
      await pool.query(
        `INSERT INTO comercial_contactos_bajas_automaticas (contacto_id, envio_id, email, motivo) VALUES ($1, $2, $3, $4)`,
        [dest.contacto_id, dest.envio_id, evento.To || '', info.motivo],
      );
    }

    runsAfectados.add(dest.envio_id);
  }

  // eslint-disable-next-line no-restricted-syntax
  for (const envioId of runsAfectados) {
    // eslint-disable-next-line no-await-in-loop
    const runRes = await pool.query('SELECT * FROM comercial_campania_envios WHERE id = $1', [envioId]);
    // eslint-disable-next-line no-await-in-loop
    if (runRes.rows[0]) await evaluarUmbrales(runRes.rows[0]);
  }
}

function delay(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

// Compartida entre el tick y el webhook de Elastic Email (un rebote/queja
// puede llegar minutos despues de que un lote ya termino de mandarse).
async function evaluarUmbrales(run) {
  const enviadosBase = Math.max(run.enviados, 1);
  const tasaRebote = run.rebotados / enviadosBase;
  const tasaQueja = run.quejas / enviadosBase;
  let motivo = null;
  if (tasaRebote > BOUNCE_RATE_PAUSA) motivo = 'Tasa de rebote > 3%';
  else if (run.quejas >= QUEJA_ABS_MINIMA && tasaQueja > QUEJA_RATE_PAUSA) motivo = 'Tasa de quejas > 0.1%';
  if (motivo) {
    await pool.query(
      `UPDATE comercial_campania_envios SET estado = 'pausado', pausado_motivo = $2, actualizado_en = NOW() WHERE id = $1 AND estado = 'en_curso'`,
      [run.id, motivo],
    );
  }
  return motivo;
}

async function procesarRun(run) {
  const hoy = new Date().toISOString().slice(0, 10);
  if (run.ultimo_lote_en && run.ultimo_lote_en.toISOString().slice(0, 10) >= hoy) return; // ya se mando hoy

  const schedule = run.ramp_schedule && run.ramp_schedule.length > 0 ? run.ramp_schedule : rampSchedule();
  const diaSiguiente = run.dia_actual + 1;
  const objetivo = objetivoAcumulado(diaSiguiente, schedule);
  const batchSize = objetivo === Infinity ? run.total_destinatarios : Math.max(objetivo - run.enviados, 0);
  if (batchSize === 0 && objetivo !== Infinity) {
    // Nada que mandar todavia en el objetivo de hoy (no deberia pasar salvo
    // schedule mal configurado), igual avanzamos el dia para no trabarnos.
    await pool.query('UPDATE comercial_campania_envios SET dia_actual = $2, ultimo_lote_en = $3 WHERE id = $1', [run.id, diaSiguiente, hoy]);
    return;
  }

  const { rows: pendientes } = await pool.query(
    `SELECT id, contacto_id, email FROM comercial_campania_envios_destinatarios
       WHERE envio_id = $1 AND estado = 'pendiente' ORDER BY id LIMIT $2`,
    [run.id, batchSize],
  );

  if (pendientes.length === 0) {
    await pool.query(
      `UPDATE comercial_campania_envios SET estado = 'completado', actualizado_en = NOW() WHERE id = $1`,
      [run.id],
    );
    await pool.query(
      `UPDATE comercial_campanias SET veces_enviada = veces_enviada + 1, ultimo_envio_en = NOW() WHERE id = $1`,
      [run.campania_id],
    );
    return;
  }

  const { cuerpoConImagenesInline, attachmentsBase } = prepararImagenesInline(run.cuerpo_html_snapshot, run.campania_id);

  let enviadosEsteLote = 0;
  let fallidosEsteLote = 0;
  let abortadoPorCaida = false;

  for (const [i, destinatario] of pendientes.entries()) {
    // eslint-disable-next-line no-await-in-loop
    if (i > 0) await delay(DELAY_ENTRE_ENVIOS_MS);
    const bajaUrl = `${FRONTEND_URL}/api/comercial/baja?c=${destinatario.contacto_id}&t=${tokenBaja(destinatario.contacto_id)}`;
    try {
      // eslint-disable-next-line no-await-in-loop
      const contactoRow = await pool.query('SELECT nombre, apellido FROM comercial_contactos WHERE id = $1', [destinatario.contacto_id]);
      const contacto = contactoRow.rows[0] || {};
      const { html, text } = personalizarCuerpo({ cuerpoConImagenesInline, contacto, bajaUrl });
      // eslint-disable-next-line no-await-in-loop
      const { messageId } = await enviarViaElasticEmail({
        to: destinatario.email, subject: run.asunto_snapshot, html, text, attachments: attachmentsBase,
      });
      // eslint-disable-next-line no-await-in-loop
      await pool.query(
        `UPDATE comercial_campania_envios_destinatarios SET estado = 'enviado', elastic_message_id = $2, enviado_en = NOW() WHERE id = $1`,
        [destinatario.id, messageId],
      );
      enviadosEsteLote += 1;
    } catch (err) {
      if (err instanceof ElasticEmailPermanentError) {
        // eslint-disable-next-line no-await-in-loop
        await pool.query(
          `UPDATE comercial_campania_envios_destinatarios SET estado = 'fallido', error = $2 WHERE id = $1`,
          [destinatario.id, err.message],
        );
        fallidosEsteLote += 1;
      } else {
        // Error transitorio (red/5xx): dejamos este y el resto del lote
        // como 'pendiente' (no tocamos nada) y abortamos - se reintenta en
        // el proximo tick en vez de perder el resto del dia.
        console.error(`[envios] Error transitorio en run ${run.id}, contacto ${destinatario.contacto_id}:`, err.message);
        abortadoPorCaida = true;
        break;
      }
    }
  }

  if (abortadoPorCaida && enviadosEsteLote === 0) return; // nada que persistir, reintentar todo el proximo tick
  if (!abortadoPorCaida && pendientes.length > 0 && fallidosEsteLote / pendientes.length > FALLO_LOTE_ABORTAR_RATIO) {
    // Demasiados fallos permanentes de una - probablemente algo esta mal
    // (ej. remitente bloqueado), no avanzamos el dia para no quemar el resto
    // del schedule contra un problema sistemico.
    console.error(`[envios] Run ${run.id}: ${fallidosEsteLote}/${pendientes.length} fallos en el lote, no se avanza el dia.`);
    return;
  }

  await pool.query(
    `UPDATE comercial_campania_envios
       SET enviados = enviados + $2, fallidos = fallidos + $3, dia_actual = $4, ultimo_lote_en = $5, actualizado_en = NOW()
       WHERE id = $1`,
    [run.id, enviadosEsteLote, fallidosEsteLote, diaSiguiente, hoy],
  );

  const actualizado = await pool.query('SELECT * FROM comercial_campania_envios WHERE id = $1', [run.id]);
  const runActualizado = actualizado.rows[0];
  const motivoPausa = await evaluarUmbrales(runActualizado);
  if (!motivoPausa) {
    const { rows: quedanPendientes } = await pool.query(
      `SELECT 1 FROM comercial_campania_envios_destinatarios WHERE envio_id = $1 AND estado = 'pendiente' LIMIT 1`,
      [run.id],
    );
    if (quedanPendientes.length === 0) {
      await pool.query(
        `UPDATE comercial_campania_envios SET estado = 'completado', actualizado_en = NOW() WHERE id = $1`,
        [run.id],
      );
      await pool.query(
        `UPDATE comercial_campanias SET veces_enviada = veces_enviada + 1, ultimo_envio_en = NOW() WHERE id = $1`,
        [run.campania_id],
      );
    }
  }
}

async function tickRamp() {
  if (!elasticEmailConfigurado()) return { procesados: 0 };
  await sincronizarEventosElasticEmail();
  const { rows: runs } = await pool.query(`SELECT * FROM comercial_campania_envios WHERE estado = 'en_curso' ORDER BY id`);
  let procesados = 0;
  // eslint-disable-next-line no-restricted-syntax
  for (const run of runs) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await procesarRun(run);
      procesados += 1;
    } catch (err) {
      console.error(`[envios] Error procesando run ${run.id}:`, err.message);
    }
  }
  return { procesados };
}

module.exports = { tickRamp, evaluarUmbrales };
