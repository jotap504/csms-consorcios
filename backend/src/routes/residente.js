const express = require('express');
const { pool } = require('../db');
const { authenticate, requireRole } = require('../auth/middleware');
const { ensureAuthorized } = require('../lib/citrineAuth');

const router = express.Router();
router.use(authenticate, requireRole('residente'));
const CITRINEOS_REST_URL = process.env.CITRINEOS_REST_URL || 'http://citrineos-core:8080';
const METER_STALE_MS = 90000;
const ASSUMED_VOLTS = 220;

// Misma logica que rebalanceGroup en listener/index.js - duplicada aca
// porque backend y listener son procesos/deploys separados sin modulo
// compartido. Si se toca una, tocar la otra.
async function getConsumoMedidoAmps({ consorcioId, sectorId }) {
  const r = await pool.query(
    sectorId != null
      ? `SELECT amps_l1, amps_l2, amps_l3, potencia_kw, "timestamp"
         FROM lecturas_sector WHERE sector_id = $1 ORDER BY "timestamp" DESC LIMIT 1`
      : `SELECT amps_l1, amps_l2, amps_l3, potencia_kw, "timestamp"
         FROM lecturas_consorcio WHERE consorcio_id = $1 ORDER BY "timestamp" DESC LIMIT 1`,
    [sectorId != null ? sectorId : consorcioId],
  );
  if (r.rowCount === 0) return null;
  const row = r.rows[0];
  const ageMs = Date.now() - new Date(row.timestamp).getTime();
  if (ageMs > METER_STALE_MS) return null;

  const fases = [row.amps_l1, row.amps_l2, row.amps_l3].filter((v) => v != null).map(Number);
  if (fases.length > 0) return Math.max(...fases);
  if (row.potencia_kw != null) return (Number(row.potencia_kw) * 1000) / ASSUMED_VOLTS;
  return null;
}

async function getAmpsAsignadosTotales(consorcioId) {
  const r = await pool.query(
    `SELECT COALESCE(SUM(ce.amps_asignados), 0) AS total
     FROM cargador_estado_actual ce
     JOIN cargadores ca ON ca.ocpp_id = ce.cargador_ocpp_id
     WHERE ca.consorcio_id = $1
       AND EXISTS (
         SELECT 1 FROM liquidacion_sesiones ls
         WHERE ls.cargador_ocpp_id = ce.cargador_ocpp_id AND ls.fecha_fin IS NULL
       )`,
    [consorcioId],
  );
  return Number(r.rows[0].total);
}

// Mismo criterio que listener/index.js:getOcppVersion y admin.js - backend/
// listener son procesos separados sin modulo compartido, se duplica.
async function getOcppVersion(stationId) {
  const cs = await pool.query('SELECT protocol FROM "ChargingStations" WHERE id = $1', [stationId]);
  const protocol = cs.rows[0]?.protocol;
  if (protocol) return protocol.includes('1.6') ? '1.6' : '2.0.1';
  const r = await pool.query('SELECT ocpp_version FROM cargadores WHERE ocpp_id = $1', [stationId]);
  return r.rows[0]?.ocpp_version ?? '2.0.1';
}

// Mismo patron que admin.js/public.js - el REST de CitrineOS es fire-and-
// forget, la respuesta real del cargador llega async a su tabla OCPPMessages.
const CONFIRMATION_TIMEOUT_MS = 5000;
const CONFIRMATION_POLL_MS = 400;
async function sendAndAwaitConfirmation(ocppId, action, url, body) {
  const sentAt = new Date();
  const dispatchRes = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const dispatchData = await dispatchRes.json();
  const dispatch = Array.isArray(dispatchData) ? dispatchData[0] : dispatchData;
  if (!dispatch?.success) return { dispatched: false, payload: dispatch?.payload };

  const deadline = Date.now() + CONFIRMATION_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, CONFIRMATION_POLL_MS));
    const row = await pool.query(
      `SELECT message FROM "OCPPMessages"
       WHERE "stationId" = $1 AND action = $2 AND state = '2' AND "timestamp" >= $3
       ORDER BY "timestamp" ASC LIMIT 1`,
      [ocppId, action, sentAt],
    );
    if (row.rowCount > 0) return { dispatched: true, payload: row.rows[0].message?.[2] ?? null };
  }
  return { dispatched: true, payload: null };
}

// Timed Charging: push adicional de SetChargingProfile con purpose
// TxDefaultProfile (NO ChargingStationMaxProfile) para no chocar con el DLB
// del listener (rebalanceGroup empuja ChargingStationMaxProfile en cada
// tick/cambio de grupo y lo pisaria). El limite EFECTIVO en el cargador es
// el minimo entre perfiles de distinto purpose evaluados juntos por el
// propio equipo (regla del spec OCPP) - asi conviven sin pisarse. Sin cron:
// el cargador hace cumplir el horario solo, via los 2 periodos del schedule.
async function pushTimedChargingProfile(ocppId, ampsNormal, horaInicio) {
  const version = await getOcppVersion(ocppId);
  if (version !== '2.0.1') return; // 1.6 usa otro shape de schedule, no soportado en esta primera version
  const segundosHastaInicio = Math.max(0, Math.floor((new Date(horaInicio).getTime() - Date.now()) / 1000));
  if (segundosHastaInicio === 0) return; // la hora ya paso o es "ahora", no hace falta perfil especial
  const profileId = Date.now() % 1000000;
  const url = `${CITRINEOS_REST_URL}/ocpp/2.0.1/smartcharging/setChargingProfile?identifier=${encodeURIComponent(ocppId)}&tenantId=1`;
  const body = {
    evseId: 0,
    chargingProfile: {
      id: profileId,
      stackLevel: 0,
      chargingProfilePurpose: 'TxDefaultProfile',
      chargingProfileKind: 'Absolute',
      chargingSchedule: [{
        id: profileId,
        chargingRateUnit: 'A',
        startSchedule: new Date().toISOString(),
        chargingSchedulePeriod: [
          { startPeriod: 0, limit: 0 },
          { startPeriod: segundosHastaInicio, limit: ampsNormal },
        ],
      }],
    },
  };
  try {
    await sendAndAwaitConfirmation(ocppId, 'SetChargingProfile', url, body);
  } catch (err) {
    console.warn(`No se pudo programar carga horaria para ${ocppId}:`, err.message);
  }
}

router.get('/consumos', async (req, res) => {
  const { periodo } = req.query;
  const result = await pool.query(
    `SELECT transaction_id_ocpp, cargador_ocpp_id, fecha_inicio, fecha_fin,
            kwh_consumidos, precio_kwh_aplicado, monto_total_expensa, periodo_expensa
     FROM liquidacion_sesiones
     WHERE uf_id = $1 ${periodo ? 'AND periodo_expensa = $2' : ''}
     ORDER BY fecha_inicio DESC`,
    periodo ? [req.user.ufId, periodo] : [req.user.ufId],
  );
  res.json(result.rows);
});

router.get('/cargadores', async (req, res) => {
  const result = await pool.query(
    'SELECT ocpp_id, etiqueta FROM cargadores WHERE uf_id = $1 ORDER BY etiqueta, ocpp_id',
    [req.user.ufId],
  );
  res.json(result.rows);
});

router.get('/tarjetas', async (req, res) => {
  const result = await pool.query(
    'SELECT id, id_tag_ocpp, activa, saldo FROM tarjetas_rfid WHERE uf_id = $1 ORDER BY id',
    [req.user.ufId],
  );
  res.json(result.rows);
});

// Vehiculos propios - dato informativo, no autoriza ni bloquea nada OCPP.
router.get('/vehiculos', async (req, res) => {
  const result = await pool.query('SELECT * FROM vehiculos WHERE uf_id = $1 ORDER BY id', [req.user.ufId]);
  res.json(result.rows);
});

router.post('/vehiculos', async (req, res) => {
  const {
    patente, vin, alias, marca, modelo,
  } = req.body ?? {};
  const result = await pool.query(
    `INSERT INTO vehiculos (uf_id, patente, vin, alias, marca, modelo)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [req.user.ufId, patente ?? null, vin ?? null, alias ?? null, marca ?? null, modelo ?? null],
  );
  res.status(201).json(result.rows[0]);
});

// QR landing: confirms this cargador is actually assigned to the caller's
// own unidad funcional before showing anything.
router.get('/cargadores/:ocppId', async (req, res) => {
  const result = await pool.query(
    `SELECT ca.ocpp_id, ca.etiqueta, co.costo_kwh_electricidad
     FROM cargadores ca
     JOIN consorcios co ON co.id = ca.consorcio_id
     WHERE ca.ocpp_id = $1 AND ca.uf_id = $2`,
    [req.params.ocppId, req.user.ufId],
  );
  if (result.rowCount === 0) {
    return res.status(404).json({ error: 'Este cargador no esta asignado a tu unidad.' });
  }
  res.json(result.rows[0]);
});

router.get('/cargadores/:ocppId/estado', async (req, res) => {
  const own = await pool.query(
    'SELECT consorcio_id, sector_id FROM cargadores WHERE ocpp_id = $1 AND uf_id = $2',
    [req.params.ocppId, req.user.ufId],
  );
  if (own.rowCount === 0) {
    return res.status(404).json({ error: 'Este cargador no esta asignado a tu unidad.' });
  }
  const { consorcio_id: consorcioId, sector_id: sectorId } = own.rows[0];

  const estadoActual = await pool.query(
    'SELECT amps_asignados, en_cola, conectado, status_ocpp FROM cargador_estado_actual WHERE cargador_ocpp_id = $1',
    [req.params.ocppId],
  );
  const conectado = estadoActual.rows[0]?.conectado ?? null;

  // "conectado" arriba es el auto enchufado o no (OCPP connector state);
  // "online" es si el equipo tiene la conexion websocket abierta con
  // CitrineOS - son cosas distintas. Sin esto el frontend no tenia forma de
  // saber que el cargador estaba offline y dejaba habilitado "Iniciar carga".
  const chargingStation = await pool.query(
    'SELECT "isOnline" AS online FROM "ChargingStations" WHERE id = $1',
    [req.params.ocppId],
  );
  const online = chargingStation.rows[0]?.online ?? null;

  const sesion = await pool.query(
    `SELECT transaction_id_ocpp, fecha_inicio FROM liquidacion_sesiones
     WHERE cargador_ocpp_id = $1 AND uf_id = $2 AND fecha_fin IS NULL
     ORDER BY fecha_inicio DESC LIMIT 1`,
    [req.params.ocppId, req.user.ufId],
  );
  if (sesion.rowCount === 0) {
    return res.json({ activo: false, conectado, online });
  }

  const { transaction_id_ocpp: txId, fecha_inicio: conectadoDesde } = sesion.rows[0];
  const enCola = estadoActual.rows[0]?.en_cola ?? false;

  let posicionEnCola = null;
  if (enCola) {
    const cola = await pool.query(
      `SELECT ls.cargador_ocpp_id FROM liquidacion_sesiones ls
       JOIN cargador_estado_actual ce ON ce.cargador_ocpp_id = ls.cargador_ocpp_id
       JOIN cargadores ca ON ca.ocpp_id = ls.cargador_ocpp_id
       WHERE ls.fecha_fin IS NULL AND ce.en_cola = TRUE
         AND ca.consorcio_id = $1
         AND (($2::int IS NOT NULL AND ca.sector_id = $2) OR ($2::int IS NULL AND ca.sector_id IS NULL))
       ORDER BY ls.fecha_inicio ASC`,
      [consorcioId, sectorId],
    );
    const idx = cola.rows.findIndex((r) => r.cargador_ocpp_id === req.params.ocppId);
    posicionEnCola = idx >= 0 ? idx + 1 : null;
  }

  const lecturas = await pool.query(
    `SELECT kwh_acumulado, potencia_kw FROM lecturas_medidor
     WHERE transaction_id_ocpp = $1 ORDER BY "timestamp" ASC`,
    [txId],
  );
  const first = lecturas.rows[0];
  const last = lecturas.rows[lecturas.rows.length - 1];
  const kwhSesion = first && last ? Number(last.kwh_acumulado) - Number(first.kwh_acumulado) : 0;

  // Aproximacion: no guardamos tension por consorcio, asumimos 220V
  // monofasico (mismo default que usa hardware-sim) solo para esta metrica
  // visual de "cuanto de tu cupo asignado estas usando ahora".
  const ASSUMED_VOLTS = 220;
  const ampsAsignados = estadoActual.rows[0]?.amps_asignados ?? null;
  const potenciaKw = last?.potencia_kw ?? null;
  let utilizacionPct = null;
  if (ampsAsignados && potenciaKw != null) {
    const maxKw = (ampsAsignados * ASSUMED_VOLTS) / 1000;
    utilizacionPct = maxKw > 0 ? Math.min(100, Math.round((Number(potenciaKw) / maxKw) * 100)) : null;
  }

  res.json({
    activo: true,
    en_cola: enCola,
    posicion_en_cola: posicionEnCola,
    conectado,
    online,
    conectado_desde: conectadoDesde,
    potencia_actual_kw: potenciaKw,
    kwh_sesion: Math.max(0, kwhSesion),
    amps_asignados: ampsAsignados,
    utilizacion_pct: utilizacionPct,
  });
});

router.get('/cargadores/:ocppId/historial', async (req, res) => {
  const own = await pool.query(
    'SELECT 1 FROM cargadores WHERE ocpp_id = $1 AND uf_id = $2',
    [req.params.ocppId, req.user.ufId],
  );
  if (own.rowCount === 0) {
    return res.status(404).json({ error: 'Este cargador no esta asignado a tu unidad.' });
  }

  const result = await pool.query(
    `SELECT transaction_id_ocpp, fecha_inicio, fecha_fin, kwh_consumidos, monto_total_expensa
     FROM liquidacion_sesiones
     WHERE cargador_ocpp_id = $1 AND uf_id = $2 AND fecha_fin IS NOT NULL
     ORDER BY fecha_inicio DESC LIMIT 20`,
    [req.params.ocppId, req.user.ufId],
  );
  res.json(result.rows);
});

// Preview de capacidad: "si tocara Iniciar ahora mismo, cuantos amps me
// tocarian" - no reserva nada, solo informa antes de arrancar de verdad.
router.get('/cargadores/:ocppId/disponibilidad', async (req, res) => {
  const own = await pool.query(
    'SELECT consorcio_id, sector_id FROM cargadores WHERE ocpp_id = $1 AND uf_id = $2',
    [req.params.ocppId, req.user.ufId],
  );
  if (own.rowCount === 0) {
    return res.status(404).json({ error: 'Este cargador no esta asignado a tu unidad.' });
  }
  const { consorcio_id: consorcioId, sector_id: sectorId } = own.rows[0];

  let limite;
  if (sectorId != null) {
    const sector = await pool.query('SELECT limite_amperios_totales, usar_medidor_dinamico FROM sectores WHERE id = $1', [sectorId]);
    limite = sector.rows[0]?.limite_amperios_totales;
    if (sector.rows[0]?.usar_medidor_dinamico && limite) {
      const consumoMedido = await getConsumoMedidoAmps({ sectorId });
      if (consumoMedido != null) {
        limite = Math.max(0, Math.floor(limite - consumoMedido));
      }
    }
  } else {
    const consorcio = await pool.query('SELECT limite_amperios_totales, usar_medidor_dinamico FROM consorcios WHERE id = $1', [consorcioId]);
    limite = consorcio.rows[0]?.limite_amperios_totales;
    if (consorcio.rows[0]?.usar_medidor_dinamico && limite) {
      // Medidor general en la acometida principal ve todo el edificio,
      // wallboxes incluidos - hay que descontar lo que ya les asignamos a
      // los autos para aislar el consumo real del resto (mismo criterio que
      // rebalanceGroup en el listener).
      const consumoMedido = await getConsumoMedidoAmps({ consorcioId });
      if (consumoMedido != null) {
        const amperiosAsignadosAutos = await getAmpsAsignadosTotales(consorcioId);
        const restoEdificio = Math.max(0, consumoMedido - amperiosAsignadosAutos);
        limite = Math.max(0, Math.floor(limite - restoEdificio));
      }
    }
  }
  if (!limite) {
    return res.json({ disponible: true, amps_estimados: null });
  }

  const MIN_AMPS = 6;
  const activos = await pool.query(
    `SELECT COUNT(DISTINCT ls.cargador_ocpp_id) AS n FROM liquidacion_sesiones ls
     JOIN cargadores ca ON ca.ocpp_id = ls.cargador_ocpp_id
     WHERE ls.fecha_fin IS NULL AND ls.cargador_ocpp_id != $1
       AND ca.consorcio_id = $2
       AND (($3::int IS NOT NULL AND ca.sector_id = $3) OR ($3::int IS NULL AND ca.sector_id IS NULL))`,
    [req.params.ocppId, consorcioId, sectorId],
  );
  const activeCount = Number(activos.rows[0].n);
  const maxCupos = Math.floor(limite / MIN_AMPS);

  if (activeCount < maxCupos) {
    return res.json({ disponible: true, amps_estimados: Math.floor(limite / (activeCount + 1)) });
  }
  res.json({ disponible: false, amps_estimados: 0 });
});

router.post('/cargadores/:ocppId/iniciar', async (req, res) => {
  const { horaInicio } = req.body ?? {};
  const cargador = await pool.query(
    'SELECT id, ocpp_version, consorcio_id FROM cargadores WHERE ocpp_id = $1 AND uf_id = $2',
    [req.params.ocppId, req.user.ufId],
  );
  if (cargador.rowCount === 0) {
    return res.status(404).json({ error: 'Este cargador no esta asignado a tu unidad.' });
  }

  const chargingStation = await pool.query(
    'SELECT "isOnline" FROM "ChargingStations" WHERE id = $1',
    [req.params.ocppId],
  );
  if (chargingStation.rows[0]?.isOnline !== true) {
    return res.status(409).json({ error: 'El cargador esta desconectado en este momento. Avisa al administrador del edificio.' });
  }

  const tarjeta = await pool.query(
    'SELECT id, id_tag_ocpp, saldo FROM tarjetas_rfid WHERE uf_id = $1 AND activa = TRUE LIMIT 1',
    [req.user.ufId],
  );
  if (tarjeta.rowCount === 0) {
    return res.status(403).json({ error: 'No tenes una tarjeta activa asociada a tu unidad.' });
  }

  // Saldo prepago (opt-in por consorcio, ver schema_nivel2.sql) - consorcios
  // que no lo activaron siguen exactamente igual que antes, sin bloquear.
  const consorcio = await pool.query('SELECT usar_saldo_prepago FROM consorcios WHERE id = $1', [cargador.rows[0].consorcio_id]);
  if (consorcio.rows[0]?.usar_saldo_prepago && Number(tarjeta.rows[0].saldo) <= 0) {
    return res.status(402).json({ error: 'Saldo insuficiente. Recarga tu tarjeta para poder iniciar una carga.' });
  }

  // Reservations: si otro id_tag tiene el cargador reservado ahora mismo,
  // no se puede arrancar. Si la reserva es propia, se consume (libera el
  // cargador para el resto de forma inmediata, no hace falta esperar a que
  // expire sola).
  const reservaActiva = await pool.query(
    `SELECT id, id_tag_ocpp FROM reservas WHERE cargador_ocpp_id = $1 AND estado = 'activa' AND expira_en > NOW() LIMIT 1`,
    [req.params.ocppId],
  );
  if (reservaActiva.rowCount > 0) {
    if (reservaActiva.rows[0].id_tag_ocpp !== tarjeta.rows[0].id_tag_ocpp) {
      return res.status(409).json({ error: 'Este cargador esta reservado por otra unidad en este momento.' });
    }
    await pool.query(`UPDATE reservas SET estado = 'consumida' WHERE id = $1`, [reservaActiva.rows[0].id]);
  }

  const activa = await pool.query(
    'SELECT 1 FROM liquidacion_sesiones WHERE cargador_ocpp_id = $1 AND fecha_fin IS NULL',
    [req.params.ocppId],
  );
  if (activa.rowCount > 0) {
    return res.status(409).json({ error: 'Este cargador ya tiene una carga en curso.' });
  }

  await ensureAuthorized(pool, tarjeta.rows[0].id_tag_ocpp);

  const is16 = cargador.rows[0].ocpp_version === '1.6';
  const url = is16
    ? `${CITRINEOS_REST_URL}/ocpp/1.6/evdriver/remoteStartTransaction?identifier=${encodeURIComponent(req.params.ocppId)}&tenantId=1`
    : `${CITRINEOS_REST_URL}/ocpp/2.0.1/evdriver/requestStartTransaction?identifier=${encodeURIComponent(req.params.ocppId)}&tenantId=1`;
  const body = is16
    ? { connectorId: 1, idTag: tarjeta.rows[0].id_tag_ocpp }
    : { remoteStartId: Date.now() % 1000000, idToken: { idToken: tarjeta.rows[0].id_tag_ocpp, type: 'ISO14443' }, evseId: 1 };
  try {
    const citrineRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await citrineRes.json();
    const confirmation = Array.isArray(data) ? data[0] : data;
    if (!confirmation?.success) {
      return res.status(502).json({ error: 'El cargador rechazo el inicio remoto.', detail: confirmation });
    }
    if (horaInicio) {
      const MIN_AMPS = 6; // mismo piso IEC 61851 que usa el listener
      pushTimedChargingProfile(req.params.ocppId, MIN_AMPS, horaInicio).catch(() => {});
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('Error iniciando carga remota:', err);
    res.status(502).json({ error: 'No se pudo comunicar con el cargador.' });
  }
});

// Reservations self-service: el residente reserva su propio cargador para
// mas tarde. Solo 2.0.1 (ver nota en admin.js sobre el REST de CitrineOS).
router.post('/cargadores/:ocppId/reservas', async (req, res) => {
  const { expiraEn } = req.body ?? {};
  if (!expiraEn) return res.status(400).json({ error: 'expiraEn es requerido.' });

  const cargador = await pool.query(
    'SELECT ocpp_version, consorcio_id FROM cargadores WHERE ocpp_id = $1 AND uf_id = $2',
    [req.params.ocppId, req.user.ufId],
  );
  if (cargador.rowCount === 0) {
    return res.status(404).json({ error: 'Este cargador no esta asignado a tu unidad.' });
  }
  const version = await getOcppVersion(req.params.ocppId);
  if (version !== '2.0.1') {
    return res.status(400).json({ error: 'Este cargador no soporta reservas todavia (necesita OCPP 2.0.1).' });
  }
  const tarjeta = await pool.query(
    'SELECT id_tag_ocpp FROM tarjetas_rfid WHERE uf_id = $1 AND activa = TRUE LIMIT 1',
    [req.user.ufId],
  );
  if (tarjeta.rowCount === 0) {
    return res.status(403).json({ error: 'No tenes una tarjeta activa asociada a tu unidad.' });
  }

  const reserva = await pool.query(
    `INSERT INTO reservas (cargador_ocpp_id, consorcio_id, uf_id, id_tag_ocpp, expira_en, creado_por)
     VALUES ($1, $2, $3, $4, $5, 'residente') RETURNING id`,
    [req.params.ocppId, cargador.rows[0].consorcio_id, req.user.ufId, tarjeta.rows[0].id_tag_ocpp, expiraEn],
  );
  const reservaId = reserva.rows[0].id;

  const url = `${CITRINEOS_REST_URL}/ocpp/2.0.1/evdriver/reserveNow?identifier=${encodeURIComponent(req.params.ocppId)}&tenantId=1`;
  const body = { id: reservaId, expiryDateTime: expiraEn, idToken: { idToken: tarjeta.rows[0].id_tag_ocpp, type: 'ISO14443' }, evseId: 1 };
  try {
    const { dispatched, payload } = await sendAndAwaitConfirmation(req.params.ocppId, 'ReserveNow', url, body);
    if (!dispatched || payload?.status !== 'Accepted') {
      await pool.query(`UPDATE reservas SET estado = 'rechazada' WHERE id = $1`, [reservaId]);
      return res.status(409).json({ error: `El cargador rechazo la reserva: ${payload?.status ?? 'sin confirmacion'}` });
    }
    res.status(201).json({ id: reservaId, ok: true });
  } catch (err) {
    await pool.query(`UPDATE reservas SET estado = 'rechazada' WHERE id = $1`, [reservaId]);
    console.error('Error creando reserva OCPP:', err);
    res.status(502).json({ error: 'No se pudo comunicar con CitrineOS.' });
  }
});

router.get('/reservas', async (req, res) => {
  const result = await pool.query(
    `SELECT id, cargador_ocpp_id, expira_en, estado, creado_en FROM reservas
     WHERE uf_id = $1 ORDER BY creado_en DESC LIMIT 50`,
    [req.user.ufId],
  );
  res.json(result.rows);
});

router.delete('/reservas/:id', async (req, res) => {
  const reserva = await pool.query(
    `SELECT id, cargador_ocpp_id FROM reservas WHERE id = $1 AND uf_id = $2 AND estado = 'activa'`,
    [req.params.id, req.user.ufId],
  );
  if (reserva.rowCount === 0) return res.status(404).json({ error: 'Reserva no encontrada o ya no esta activa.' });

  const ocppId = reserva.rows[0].cargador_ocpp_id;
  const url = `${CITRINEOS_REST_URL}/ocpp/2.0.1/evdriver/cancelReservation?identifier=${encodeURIComponent(ocppId)}&tenantId=1`;
  try {
    await sendAndAwaitConfirmation(ocppId, 'CancelReservation', url, { reservationId: Number(req.params.id) });
  } catch (err) {
    console.warn('Error cancelando reserva en el cargador (se cancela igual en nuestra DB):', err.message);
  }
  await pool.query(`UPDATE reservas SET estado = 'cancelada' WHERE id = $1`, [req.params.id]);
  res.json({ ok: true });
});

router.post('/cargadores/:ocppId/detener', async (req, res) => {
  const cargador = await pool.query(
    'SELECT id, ocpp_version FROM cargadores WHERE ocpp_id = $1 AND uf_id = $2',
    [req.params.ocppId, req.user.ufId],
  );
  if (cargador.rowCount === 0) {
    return res.status(404).json({ error: 'Este cargador no esta asignado a tu unidad.' });
  }

  const sesion = await pool.query(
    `SELECT transaction_id_ocpp FROM liquidacion_sesiones
     WHERE cargador_ocpp_id = $1 AND uf_id = $2 AND fecha_fin IS NULL
     ORDER BY fecha_inicio DESC LIMIT 1`,
    [req.params.ocppId, req.user.ufId],
  );
  if (sesion.rowCount === 0) {
    return res.status(404).json({ error: 'No hay una carga activa para detener.' });
  }

  const is16 = cargador.rows[0].ocpp_version === '1.6';
  const url = is16
    ? `${CITRINEOS_REST_URL}/ocpp/1.6/evdriver/remoteStopTransaction?identifier=${encodeURIComponent(req.params.ocppId)}&tenantId=1`
    : `${CITRINEOS_REST_URL}/ocpp/2.0.1/evdriver/requestStopTransaction?identifier=${encodeURIComponent(req.params.ocppId)}&tenantId=1`;
  const body = is16
    ? { transactionId: Number(sesion.rows[0].transaction_id_ocpp) }
    : { transactionId: sesion.rows[0].transaction_id_ocpp };
  try {
    const citrineRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await citrineRes.json();
    const confirmation = Array.isArray(data) ? data[0] : data;
    if (!confirmation?.success) {
      return res.status(502).json({ error: 'El cargador rechazo la detencion remota.', detail: confirmation });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('Error deteniendo carga remota:', err);
    res.status(502).json({ error: 'No se pudo comunicar con el cargador.' });
  }
});

module.exports = router;
