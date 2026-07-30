require('dotenv').config();
const amqp = require('amqplib');
const { Pool } = require('pg');

const AMQP_URL = process.env.AMQP_URL;
const DATABASE_URL = process.env.DATABASE_URL;
const CITRINEOS_REST_URL = process.env.CITRINEOS_REST_URL || 'http://citrineos-core:8080';
const EXCHANGE = 'citrineos';
const QUEUE = 'csms_saas_transaction_listener';
const MIN_AMPS = 6; // IEC 61851 minimum safe charging current
const REBALANCE_INTERVAL_MS = 60000;

const pool = new Pool({ connectionString: DATABASE_URL });

// transactionId is only unique per station, so key by station+transactionId.
// In-memory only: if the listener restarts mid-session, the Ended handler
// falls back to reading precio_kwh_aplicado off the open row instead of
// crashing, but the starting kWh reading is lost for that one session.
const openSessions = new Map();

function sessionKey(stationId, transactionId) {
  return `${stationId}::${transactionId}`;
}

function energyWh(meterValue) {
  if (!Array.isArray(meterValue) || meterValue.length === 0) return null;
  const last = meterValue[meterValue.length - 1];
  const sample = (last.sampledValue || []).find(
    (sv) => !sv.measurand || sv.measurand === 'Energy.Active.Import.Register',
  );
  if (!sample) return null;
  const value = Number(sample.value);
  const unit = sample.unitOfMeasure?.unit;
  return unit === 'kWh' ? value * 1000 : value;
}

function powerKw(meterValue) {
  if (!Array.isArray(meterValue) || meterValue.length === 0) return null;
  const last = meterValue[meterValue.length - 1];
  const sample = (last.sampledValue || []).find((sv) => sv.measurand === 'Power.Active.Import');
  if (!sample) return null;
  const value = Number(sample.value);
  const unit = sample.unitOfMeasure?.unit;
  return unit === 'W' ? value / 1000 : value;
}

async function recordLectura(stationId, transactionId, consorcioId, timestamp, whReading) {
  await pool.query(
    `INSERT INTO lecturas_medidor (cargador_ocpp_id, transaction_id_ocpp, consorcio_id, "timestamp", kwh_acumulado, potencia_kw)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [stationId, String(transactionId), consorcioId, timestamp, whReading.wh / 1000, whReading.powerKw],
  );
}

async function getConsorcioIdForStation(stationId) {
  const cargador = await pool.query('SELECT consorcio_id FROM cargadores WHERE ocpp_id = $1', [stationId]);
  return cargador.rows[0]?.consorcio_id ?? null;
}

async function getActiveConsorcioForStation(stationId) {
  const r = await pool.query(
    'SELECT consorcio_id FROM liquidacion_sesiones WHERE cargador_ocpp_id = $1 AND fecha_fin IS NULL LIMIT 1',
    [stationId],
  );
  return r.rows[0]?.consorcio_id ?? null;
}

async function pushChargingProfile(ocppId, maxAmps) {
  const profileId = Date.now() % 1000000;
  const url = `${CITRINEOS_REST_URL}/ocpp/2.0.1/smartcharging/setChargingProfile?identifier=${encodeURIComponent(ocppId)}&tenantId=1`;
  const body = {
    evseId: 0,
    chargingProfile: {
      id: profileId,
      stackLevel: 0,
      chargingProfilePurpose: 'ChargingStationMaxProfile',
      chargingProfileKind: 'Absolute',
      chargingSchedule: [
        {
          id: profileId,
          chargingRateUnit: 'A',
          startSchedule: new Date().toISOString(),
          chargingSchedulePeriod: [{ startPeriod: 0, limit: maxAmps }],
        },
      ],
    },
  };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    const confirmation = Array.isArray(data) ? data[0] : data;
    if (!confirmation?.success) {
      console.warn(`[Balanceador] ${ocppId} rechazo el perfil de ${maxAmps}A:`, confirmation?.payload);
    }
  } catch (err) {
    console.warn(`[Balanceador] No se pudo enviar perfil a ${ocppId}:`, err.message);
  }
}

// Reparte limite_amperios_totales del consorcio en partes iguales entre los
// cargadores con una sesion activa en este momento. Estrategia simple
// (equal-share): no distingue capacidad del vehiculo ni fases, solo evita
// que la suma de todos supere la instalacion.
async function rebalanceConsorcio(consorcioId) {
  if (consorcioId == null) return;

  const consorcio = await pool.query(
    'SELECT limite_amperios_totales FROM consorcios WHERE id = $1',
    [consorcioId],
  );
  const limite = consorcio.rows[0]?.limite_amperios_totales;
  if (!limite) return; // sin limite configurado, no hay nada para repartir

  const activos = await pool.query(
    `SELECT DISTINCT cargador_ocpp_id FROM liquidacion_sesiones
     WHERE consorcio_id = $1 AND fecha_fin IS NULL`,
    [consorcioId],
  );
  const ocppIds = activos.rows.map((r) => r.cargador_ocpp_id);
  if (ocppIds.length === 0) return;

  const perAmps = Math.max(MIN_AMPS, Math.floor(limite / ocppIds.length));
  console.log(`[Balanceador] consorcio=${consorcioId} activos=${ocppIds.length} limite=${limite}A -> ${perAmps}A c/u`);
  await Promise.all(ocppIds.map((ocppId) => pushChargingProfile(ocppId, perAmps)));
}

async function handleStarted(context, payload) {
  const stationId = context.ocppConnectionName;
  const transactionId = payload.transactionInfo.transactionId;

  const cargador = await pool.query(
    'SELECT id, consorcio_id FROM cargadores WHERE ocpp_id = $1',
    [stationId],
  );
  if (cargador.rowCount === 0) {
    console.warn(`[Started] Cargador desconocido para el sistema SaaS: ${stationId}, se ignora la sesion.`);
    return;
  }
  const { consorcio_id: consorcioId } = cargador.rows[0];

  const consorcio = await pool.query(
    'SELECT costo_kwh_electricidad FROM consorcios WHERE id = $1',
    [consorcioId],
  );
  const precioKwh = consorcio.rows[0]?.costo_kwh_electricidad ?? 0;

  let ufId = null;
  const idTag = payload.idToken?.idToken;
  if (idTag) {
    const uf = await pool.query(
      `SELECT uf.id FROM unidades_funcionales uf
       JOIN tarjetas_rfid t ON t.uf_id = uf.id
       WHERE t.id_tag_ocpp = $1 AND t.activa = TRUE`,
      [idTag],
    );
    ufId = uf.rows[0]?.id ?? null;
  }

  const startWh = energyWh(payload.meterValue) ?? 0;

  await pool.query(
    `INSERT INTO liquidacion_sesiones
      (transaction_id_ocpp, consorcio_id, uf_id, cargador_ocpp_id, fecha_inicio,
       kwh_consumidos, precio_kwh_aplicado, monto_total_expensa, liquidado_en_expensas)
     VALUES ($1, $2, $3, $4, $5, 0, $6, 0, FALSE)`,
    [String(transactionId), consorcioId, ufId, stationId, payload.timestamp, precioKwh],
  );

  openSessions.set(sessionKey(stationId, transactionId), { startWh, precioKwh, consorcioId });
  await recordLectura(stationId, transactionId, consorcioId, payload.timestamp, {
    wh: startWh,
    powerKw: powerKw(payload.meterValue),
  });
  console.log(`[Started] ${stationId} tx=${transactionId} uf=${ufId ?? '-'} precioKwh=${precioKwh}`);
  await rebalanceConsorcio(consorcioId);
}

async function handleUpdated(context, payload) {
  const stationId = context.ocppConnectionName;
  const transactionId = payload.transactionInfo.transactionId;
  const key = sessionKey(stationId, transactionId);

  const wh = energyWh(payload.meterValue);
  if (wh == null) return; // no meter reading in this update, nothing to chart

  let consorcioId = openSessions.get(key)?.consorcioId;
  if (consorcioId === undefined) {
    consorcioId = await getConsorcioIdForStation(stationId);
  }
  if (consorcioId == null) return;

  await recordLectura(stationId, transactionId, consorcioId, payload.timestamp, {
    wh,
    powerKw: powerKw(payload.meterValue),
  });
}

async function handleEnded(context, payload) {
  const stationId = context.ocppConnectionName;
  const transactionId = payload.transactionInfo.transactionId;
  const key = sessionKey(stationId, transactionId);

  let { startWh, precioKwh, consorcioId } = openSessions.get(key) ?? {};
  if (startWh === undefined) {
    console.warn(`[Ended] No hay estado en memoria para ${key}; se intenta recuperar de la DB.`);
    const row = await pool.query(
      `SELECT precio_kwh_aplicado FROM liquidacion_sesiones
       WHERE transaction_id_ocpp = $1 AND cargador_ocpp_id = $2 AND fecha_fin IS NULL`,
      [String(transactionId), stationId],
    );
    if (row.rowCount === 0) {
      console.warn(`[Ended] No se encontro sesion abierta para ${key}, se ignora.`);
      return;
    }
    precioKwh = row.rows[0].precio_kwh_aplicado;
    startWh = 0;
    consorcioId = await getConsorcioIdForStation(stationId);
  }

  const endWh = energyWh(payload.meterValue) ?? startWh;
  const kwh = Math.max(0, (endWh - startWh) / 1000);
  const monto = kwh * precioKwh;
  const periodo = payload.timestamp.slice(0, 7);

  await pool.query(
    `UPDATE liquidacion_sesiones
     SET fecha_fin = $1, kwh_consumidos = $2, monto_total_expensa = $3, periodo_expensa = $4
     WHERE transaction_id_ocpp = $5 AND cargador_ocpp_id = $6 AND fecha_fin IS NULL`,
    [payload.timestamp, kwh, monto, periodo, String(transactionId), stationId],
  );

  if (consorcioId != null) {
    await recordLectura(stationId, transactionId, consorcioId, payload.timestamp, {
      wh: endWh,
      powerKw: 0,
    });
  }

  openSessions.delete(key);
  console.log(`[Ended] ${stationId} tx=${transactionId} kwh=${kwh.toFixed(3)} monto=${monto.toFixed(2)}`);
  await rebalanceConsorcio(consorcioId);
}

async function handleTransactionEvent(context, payload) {
  switch (payload.eventType) {
    case 'Started':
      return handleStarted(context, payload);
    case 'Updated':
      return handleUpdated(context, payload);
    case 'Ended':
      return handleEnded(context, payload);
    default:
      return;
  }
}

// Fail-safe default: whenever a station (re)connects, cap it at the minimum
// unless it's reconnecting mid-session (e.g. brief WiFi drop), in which case
// we restore its fair share instead of yanking an active car down to 6A.
async function handleBootNotification(context) {
  const stationId = context.ocppConnectionName;
  const activeConsorcioId = await getActiveConsorcioForStation(stationId);
  if (activeConsorcioId != null) {
    console.log(`[Boot] ${stationId} reconecto con sesion activa, rebalanceando consorcio ${activeConsorcioId}`);
    await rebalanceConsorcio(activeConsorcioId);
  } else {
    console.log(`[Boot] ${stationId} conecto sin sesion activa, aplicando piso de ${MIN_AMPS}A`);
    await pushChargingProfile(stationId, MIN_AMPS);
  }
}

async function main() {
  const conn = await amqp.connect(AMQP_URL);
  const channel = await conn.createChannel();
  await channel.prefetch(1);

  // The exchange is declared by CitrineOS itself; check (not assert) so we
  // don't fight over declaration args and instead fail loudly if it's missing.
  await channel.checkExchange(EXCHANGE);
  await channel.assertQueue(QUEUE, { durable: true });
  await channel.bindQueue(QUEUE, EXCHANGE, '', {
    'x-match': 'all',
    origin: 'cs',
    state: '1',
    action: 'TransactionEvent',
  });
  await channel.bindQueue(QUEUE, EXCHANGE, '', {
    'x-match': 'all',
    origin: 'cs',
    state: '1',
    action: 'BootNotification',
  });

  console.log(`Escuchando eventos TransactionEvent/BootNotification en cola "${QUEUE}"...`);

  // Safety net: re-balance periodically in case a Started/Ended event was
  // missed (e.g. listener was briefly down) and the last pushed profile is stale.
  setInterval(async () => {
    try {
      const result = await pool.query(
        'SELECT DISTINCT consorcio_id FROM liquidacion_sesiones WHERE fecha_fin IS NULL',
      );
      for (const { consorcio_id: consorcioId } of result.rows) {
        await rebalanceConsorcio(consorcioId);
      }
    } catch (err) {
      console.error('Error en el balanceo periodico:', err);
    }
  }, REBALANCE_INTERVAL_MS);

  channel.consume(QUEUE, async (msg) => {
    if (!msg) return;
    try {
      const body = JSON.parse(msg.content.toString('utf-8'));
      if (body.action === 'BootNotification') {
        await handleBootNotification(body.context);
      } else {
        await handleTransactionEvent(body.context, body.payload);
      }
      channel.ack(msg);
    } catch (err) {
      console.error('Error procesando mensaje, se descarta:', err);
      channel.nack(msg, false, false);
    }
  });

  // Without this handler, a transient network blip (e.g. ECONNRESET during a
  // heartbeat) throws an unhandled 'error' event and crashes the process
  // before the 'close' handler below even gets a chance to run.
  conn.on('error', (err) => {
    console.error('Error de conexion a RabbitMQ:', err.message);
  });

  conn.on('close', () => {
    console.error('Conexion a RabbitMQ cerrada, saliendo.');
    process.exit(1);
  });
}

main().catch((err) => {
  console.error('Fallo al iniciar el listener:', err);
  process.exit(1);
});
