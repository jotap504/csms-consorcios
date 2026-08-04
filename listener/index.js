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
const METER_STALE_MS = 90000; // lectura de medidor mas vieja que esto se ignora (fail-safe al limite estatico)
const ASSUMED_VOLTS = 220; // solo si el medidor manda potencia_kw en vez de amps por fase

const pool = new Pool({ connectionString: DATABASE_URL });

// transactionId is only unique per station, so key by station+transactionId.
// In-memory only: if the listener restarts mid-session, the Ended handler
// falls back to reading precio_kwh_aplicado off the open row instead of
// crashing, but the starting kWh reading is lost for that one session.
const openSessions = new Map();

function sessionKey(stationId, transactionId) {
  return `${stationId}::${transactionId}`;
}

// sampledValue units live at sv.unitOfMeasure.unit in OCPP 2.0.1 but flat at
// sv.unit in OCPP 1.6 - this reads whichever shape is present.
function sampleUnit(sv) {
  return sv.unitOfMeasure?.unit ?? sv.unit;
}

function energyWh(meterValue) {
  if (!Array.isArray(meterValue) || meterValue.length === 0) return null;
  const last = meterValue[meterValue.length - 1];
  const sample = (last.sampledValue || []).find(
    (sv) => !sv.measurand || sv.measurand === 'Energy.Active.Import.Register',
  );
  if (!sample) return null;
  const value = Number(sample.value);
  const unit = sampleUnit(sample);
  return unit === 'kWh' ? value * 1000 : value;
}

function powerKw(meterValue) {
  if (!Array.isArray(meterValue) || meterValue.length === 0) return null;
  const last = meterValue[meterValue.length - 1];
  const sample = (last.sampledValue || []).find((sv) => sv.measurand === 'Power.Active.Import');
  if (!sample) return null;
  const value = Number(sample.value);
  const unit = sampleUnit(sample);
  return unit === 'W' ? value / 1000 : value;
}

async function getOcppVersion(stationId) {
  const r = await pool.query('SELECT ocpp_version FROM cargadores WHERE ocpp_id = $1', [stationId]);
  if (r.rowCount > 0) return r.rows[0].ocpp_version;
  const p = await pool.query('SELECT ocpp_version FROM proveedor_cargadores WHERE ocpp_id = $1', [stationId]);
  return p.rows[0]?.ocpp_version ?? '2.0.1';
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

// Grupo de balanceo activo de una estacion que ya tiene sesion abierta:
// si el cargador tiene sector_id, el grupo es ese sector; si no, el consorcio.
async function getActiveGroupForStation(stationId) {
  const r = await pool.query(
    `SELECT ca.consorcio_id, ca.sector_id FROM liquidacion_sesiones ls
     JOIN cargadores ca ON ca.ocpp_id = ls.cargador_ocpp_id
     WHERE ls.cargador_ocpp_id = $1 AND ls.fecha_fin IS NULL LIMIT 1`,
    [stationId],
  );
  if (r.rowCount === 0) return null;
  return { consorcioId: r.rows[0].consorcio_id, sectorId: r.rows[0].sector_id };
}

async function setCargadorEstado(ocppId, ampsAsignados, enCola) {
  await pool.query(
    `INSERT INTO cargador_estado_actual (cargador_ocpp_id, amps_asignados, en_cola, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (cargador_ocpp_id) DO UPDATE SET amps_asignados = $2, en_cola = $3, updated_at = NOW()`,
    [ocppId, ampsAsignados, enCola],
  );
}

async function pushChargingProfile(ocppId, maxAmps) {
  const profileId = Date.now() % 1000000;
  const ocppVersion = await getOcppVersion(ocppId);
  const is16 = ocppVersion === '1.6';
  const url = is16
    ? `${CITRINEOS_REST_URL}/ocpp/1.6/smartcharging/setChargingProfile?identifier=${encodeURIComponent(ocppId)}&tenantId=1`
    : `${CITRINEOS_REST_URL}/ocpp/2.0.1/smartcharging/setChargingProfile?identifier=${encodeURIComponent(ocppId)}&tenantId=1`;
  const body = is16
    ? {
      connectorId: 1,
      csChargingProfiles: {
        chargingProfileId: profileId,
        stackLevel: 0,
        chargingProfilePurpose: 'ChargePointMaxProfile',
        chargingProfileKind: 'Absolute',
        chargingSchedule: {
          chargingRateUnit: 'A',
          startSchedule: new Date().toISOString(),
          chargingSchedulePeriod: [{ startPeriod: 0, limit: maxAmps }],
        },
      },
    }
    : {
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

// Ultima lectura del medidor de corriente de un sector (consumo del RESTO
// del edificio, sin contar los cargadores EV - ver nota de instalacion).
// Devuelve null si no hay lectura o si es demasiado vieja (fail-safe: en ese
// caso rebalanceGroup usa el limite estatico configurado, como si no
// tuviera medidor dinamico).
async function getConsumoMedidoAmps(sectorId) {
  const r = await pool.query(
    `SELECT amps_l1, amps_l2, amps_l3, potencia_kw, "timestamp"
     FROM lecturas_sector WHERE sector_id = $1 ORDER BY "timestamp" DESC LIMIT 1`,
    [sectorId],
  );
  if (r.rowCount === 0) return null;
  const row = r.rows[0];
  const ageMs = Date.now() - new Date(row.timestamp).getTime();
  if (ageMs > METER_STALE_MS) return null;

  const fases = [row.amps_l1, row.amps_l2, row.amps_l3].filter((v) => v != null).map(Number);
  if (fases.length > 0) return Math.max(...fases); // fase mas cargada, criterio conservador
  if (row.potencia_kw != null) return (Number(row.potencia_kw) * 1000) / ASSUMED_VOLTS;
  return null;
}

// Reparte el limite de amperios de un GRUPO (un sector especifico si el
// cargador pertenece a uno, o el consorcio entero para los que no tienen
// sector asignado) en partes iguales entre los cargadores con sesion activa
// en ese grupo, respetando un piso de MIN_AMPS por cargador. Si entran mas
// sesiones de las que el limite alcanza a cubrir con el piso, las mas nuevas
// (por fecha_inicio, FIFO) quedan "en cola" con 0A hasta que se libera un
// cupo (otra sesion del mismo grupo termina y se vuelve a llamar aca).
//
// Cada sector tiene su propio circuito/balanceo independiente del resto del
// edificio (ej: 3 subsuelos con acometidas separadas) - por eso el pool de
// amperios NUNCA se comparte entre sectores distintos ni entre un sector y
// el resto del consorcio sin sector.
async function rebalanceGroup({ consorcioId, sectorId }) {
  if (consorcioId == null) return;

  let limite;
  if (sectorId != null) {
    const sector = await pool.query(
      'SELECT limite_amperios_totales, usar_medidor_dinamico FROM sectores WHERE id = $1',
      [sectorId],
    );
    limite = sector.rows[0]?.limite_amperios_totales;
    if (sector.rows[0]?.usar_medidor_dinamico && limite) {
      const consumoMedido = await getConsumoMedidoAmps(sectorId);
      if (consumoMedido != null) {
        const limiteOriginal = limite;
        limite = Math.max(0, Math.floor(limite - consumoMedido));
        console.log(
          `[Balanceador] sector=${sectorId} medidor dinamico: resto_edificio=${consumoMedido.toFixed(1)}A, `
          + `${limiteOriginal}A contratado -> ${limite}A disponibles para autos`,
        );
      }
    }
  } else {
    const consorcio = await pool.query('SELECT limite_amperios_totales FROM consorcios WHERE id = $1', [consorcioId]);
    limite = consorcio.rows[0]?.limite_amperios_totales;
  }
  if (!limite) return; // sin limite configurado, no hay nada para repartir

  const activos = await pool.query(
    sectorId != null
      ? `SELECT DISTINCT ON (ls.cargador_ocpp_id) ls.cargador_ocpp_id, ls.fecha_inicio
         FROM liquidacion_sesiones ls
         JOIN cargadores ca ON ca.ocpp_id = ls.cargador_ocpp_id
         WHERE ca.sector_id = $1 AND ls.fecha_fin IS NULL
         ORDER BY ls.cargador_ocpp_id, ls.fecha_inicio ASC`
      : `SELECT DISTINCT ON (ls.cargador_ocpp_id) ls.cargador_ocpp_id, ls.fecha_inicio
         FROM liquidacion_sesiones ls
         JOIN cargadores ca ON ca.ocpp_id = ls.cargador_ocpp_id
         WHERE ca.consorcio_id = $1 AND ca.sector_id IS NULL AND ls.fecha_fin IS NULL
         ORDER BY ls.cargador_ocpp_id, ls.fecha_inicio ASC`,
    [sectorId != null ? sectorId : consorcioId],
  );
  const ordenados = activos.rows
    .sort((a, b) => new Date(a.fecha_inicio) - new Date(b.fecha_inicio))
    .map((r) => r.cargador_ocpp_id);
  if (ordenados.length === 0) return;

  const maxCupos = Math.max(0, Math.floor(limite / MIN_AMPS));
  const conCupo = ordenados.slice(0, maxCupos);
  const enCola = ordenados.slice(maxCupos);
  const perAmps = conCupo.length > 0 ? Math.floor(limite / conCupo.length) : 0;

  const grupoLabel = sectorId != null ? `sector=${sectorId}` : `consorcio=${consorcioId}`;
  console.log(
    `[Balanceador] ${grupoLabel} activos=${ordenados.length} cupos=${maxCupos} -> `
    + `${conCupo.length}x${perAmps}A, ${enCola.length} en cola`,
  );

  await Promise.all([
    ...conCupo.map((ocppId) => setCargadorEstado(ocppId, perAmps, false).then(() => pushChargingProfile(ocppId, perAmps))),
    ...enCola.map((ocppId) => setCargadorEstado(ocppId, 0, true).then(() => pushChargingProfile(ocppId, 0))),
  ]);
}

// Core session lifecycle, shared between OCPP 2.0.1 (TransactionEvent) and
// OCPP 1.6 (StartTransaction/MeterValues/StopTransaction) - each protocol's
// handler normalizes its payload shape into these params before calling in.
async function startSession({ stationId, transactionId, idTag, timestamp, startWh }) {
  const cargador = await pool.query(
    'SELECT id, consorcio_id, sector_id FROM cargadores WHERE ocpp_id = $1',
    [stationId],
  );
  if (cargador.rowCount === 0) {
    // Not a real (billed) consorcio charger - maybe a provider's test bench
    // unit instead. Those get live status but never touch billing/DLM.
    const proveedorCargador = await pool.query('SELECT 1 FROM proveedor_cargadores WHERE ocpp_id = $1', [stationId]);
    if (proveedorCargador.rowCount > 0) {
      await pool.query(
        `INSERT INTO cargador_estado_actual (cargador_ocpp_id, conectado, transaction_id_ocpp, updated_at)
         VALUES ($1, TRUE, $2, NOW())
         ON CONFLICT (cargador_ocpp_id) DO UPDATE SET conectado = TRUE, transaction_id_ocpp = $2, updated_at = NOW()`,
        [stationId, String(transactionId)],
      );
      console.log(`[Started][Proveedor] ${stationId} tx=${transactionId}`);
      return;
    }
    console.warn(`[Started] Cargador desconocido para el sistema SaaS: ${stationId}, se ignora la sesion.`);
    return;
  }
  const { consorcio_id: consorcioId, sector_id: sectorId } = cargador.rows[0];

  const consorcio = await pool.query(
    'SELECT costo_kwh_electricidad FROM consorcios WHERE id = $1',
    [consorcioId],
  );
  const precioKwh = consorcio.rows[0]?.costo_kwh_electricidad ?? 0;

  let ufId = null;
  if (idTag) {
    const uf = await pool.query(
      `SELECT uf.id FROM unidades_funcionales uf
       JOIN tarjetas_rfid t ON t.uf_id = uf.id
       WHERE t.id_tag_ocpp = $1 AND t.activa = TRUE`,
      [idTag],
    );
    ufId = uf.rows[0]?.id ?? null;
  }

  await pool.query(
    `INSERT INTO liquidacion_sesiones
      (transaction_id_ocpp, consorcio_id, uf_id, cargador_ocpp_id, fecha_inicio,
       kwh_consumidos, precio_kwh_aplicado, monto_total_expensa, liquidado_en_expensas)
     VALUES ($1, $2, $3, $4, $5, 0, $6, 0, FALSE)`,
    [String(transactionId), consorcioId, ufId, stationId, timestamp, precioKwh],
  );

  openSessions.set(sessionKey(stationId, transactionId), { startWh, precioKwh, consorcioId, sectorId });
  await recordLectura(stationId, transactionId, consorcioId, timestamp, { wh: startWh, powerKw: null });
  console.log(`[Started] ${stationId} tx=${transactionId} uf=${ufId ?? '-'} precioKwh=${precioKwh}`);
  await rebalanceGroup({ consorcioId, sectorId });
}

async function updateSession({ stationId, transactionId, timestamp, wh, powerKw: pKw }) {
  if (wh == null) return; // no meter reading in this update, nothing to chart
  const key = sessionKey(stationId, transactionId);

  let consorcioId = openSessions.get(key)?.consorcioId;
  if (consorcioId === undefined) {
    consorcioId = await getConsorcioIdForStation(stationId);
  }
  if (consorcioId == null) return;

  await recordLectura(stationId, transactionId, consorcioId, timestamp, { wh, powerKw: pKw ?? null });
}

async function endSession({ stationId, transactionId, timestamp, endWh: endWhInput }) {
  const key = sessionKey(stationId, transactionId);

  let { startWh, precioKwh, consorcioId, sectorId } = openSessions.get(key) ?? {};
  if (startWh === undefined) {
    console.warn(`[Ended] No hay estado en memoria para ${key}; se intenta recuperar de la DB.`);
    const row = await pool.query(
      `SELECT ls.precio_kwh_aplicado, ca.consorcio_id, ca.sector_id
       FROM liquidacion_sesiones ls
       JOIN cargadores ca ON ca.ocpp_id = ls.cargador_ocpp_id
       WHERE ls.transaction_id_ocpp = $1 AND ls.cargador_ocpp_id = $2 AND ls.fecha_fin IS NULL`,
      [String(transactionId), stationId],
    );
    if (row.rowCount === 0) {
      const proveedorCargador = await pool.query('SELECT 1 FROM proveedor_cargadores WHERE ocpp_id = $1', [stationId]);
      if (proveedorCargador.rowCount > 0) {
        await pool.query(
          `UPDATE cargador_estado_actual SET transaction_id_ocpp = NULL, conectado = FALSE, updated_at = NOW()
           WHERE cargador_ocpp_id = $1`,
          [stationId],
        );
        console.log(`[Ended][Proveedor] ${stationId} tx=${transactionId}`);
        return;
      }
      console.warn(`[Ended] No se encontro sesion abierta para ${key}, se ignora.`);
      return;
    }
    precioKwh = row.rows[0].precio_kwh_aplicado;
    startWh = 0;
    consorcioId = row.rows[0].consorcio_id;
    sectorId = row.rows[0].sector_id;
  }

  const endWh = endWhInput ?? startWh;
  const kwh = Math.max(0, (endWh - startWh) / 1000);
  const monto = kwh * precioKwh;
  const periodo = timestamp.slice(0, 7);

  await pool.query(
    `UPDATE liquidacion_sesiones
     SET fecha_fin = $1, kwh_consumidos = $2, monto_total_expensa = $3, periodo_expensa = $4
     WHERE transaction_id_ocpp = $5 AND cargador_ocpp_id = $6 AND fecha_fin IS NULL`,
    [timestamp, kwh, monto, periodo, String(transactionId), stationId],
  );

  if (consorcioId != null) {
    await recordLectura(stationId, transactionId, consorcioId, timestamp, { wh: endWh, powerKw: 0 });
  }

  openSessions.delete(key);
  console.log(`[Ended] ${stationId} tx=${transactionId} kwh=${kwh.toFixed(3)} monto=${monto.toFixed(2)}`);
  await rebalanceGroup({ consorcioId, sectorId });
}

async function handleTransactionEvent(context, payload) {
  const stationId = context.ocppConnectionName ?? context.stationId;
  const transactionId = payload.transactionInfo.transactionId;
  switch (payload.eventType) {
    case 'Started':
      return startSession({
        stationId,
        transactionId,
        idTag: payload.idToken?.idToken,
        timestamp: payload.timestamp,
        startWh: energyWh(payload.meterValue) ?? 0,
      });
    case 'Updated':
      return updateSession({
        stationId,
        transactionId,
        timestamp: payload.timestamp,
        wh: energyWh(payload.meterValue),
        powerKw: powerKw(payload.meterValue),
      });
    case 'Ended':
      return endSession({
        stationId,
        transactionId,
        timestamp: payload.timestamp,
        endWh: energyWh(payload.meterValue),
      });
    default:
      return;
  }
}

// OCPP 1.6: transactionId is assigned by the CSMS itself and only appears in
// the StartTransaction.conf (the response), not in the station's request. We
// stash the request's connectorId/idTag/meterStart here keyed by correlationId,
// then pick it up when the matching response arrives with the assigned id.
const pendingStarts16 = new Map();

function pendingKey16(stationId, correlationId) {
  return `${stationId}::${correlationId}`;
}

async function handleOcpp16StartRequest(context, payload) {
  pendingStarts16.set(pendingKey16(context.stationId, context.correlationId), {
    idTag: payload.idTag,
    startWh: Number(payload.meterStart) || 0,
    timestamp: payload.timestamp,
  });
}

async function handleOcpp16StartResponse(context, payload) {
  const key = pendingKey16(context.stationId, context.correlationId);
  const pending = pendingStarts16.get(key);
  pendingStarts16.delete(key);
  if (!pending || payload.transactionId == null) return;
  await startSession({
    stationId: context.stationId,
    transactionId: payload.transactionId,
    idTag: pending.idTag,
    timestamp: pending.timestamp,
    startWh: pending.startWh,
  });
}

async function handleOcpp16MeterValues(context, payload) {
  if (payload.transactionId == null) return; // out-of-transaction reading, nothing to bill
  await updateSession({
    stationId: context.stationId,
    transactionId: payload.transactionId,
    timestamp: new Date().toISOString(),
    wh: energyWh(payload.meterValue),
    powerKw: powerKw(payload.meterValue),
  });
}

async function handleOcpp16StopTransaction(context, payload) {
  await endSession({
    stationId: context.stationId,
    transactionId: payload.transactionId,
    timestamp: payload.timestamp,
    endWh: payload.meterStop != null ? Number(payload.meterStop) : null,
  });
}

// Fail-safe default: whenever a station (re)connects, cap it at the minimum
// unless it's reconnecting mid-session (e.g. brief WiFi drop), in which case
// we restore its fair share instead of yanking an active car down to 6A.
async function handleBootNotification(context) {
  const stationId = context.ocppConnectionName ?? context.stationId;
  const activeGroup = await getActiveGroupForStation(stationId);
  if (activeGroup != null) {
    const grupoLabel = activeGroup.sectorId != null ? `sector ${activeGroup.sectorId}` : `consorcio ${activeGroup.consorcioId}`;
    console.log(`[Boot] ${stationId} reconecto con sesion activa, rebalanceando ${grupoLabel}`);
    await rebalanceGroup(activeGroup);
  } else {
    console.log(`[Boot] ${stationId} conecto sin sesion activa, aplicando piso de ${MIN_AMPS}A`);
    await setCargadorEstado(stationId, MIN_AMPS, false);
    await pushChargingProfile(stationId, MIN_AMPS);
  }
}

// Reporta si hay un vehiculo fisicamente enchufado en el conector,
// independiente de si ya esta autorizado/cargando (eso lo cubre TransactionEvent).
async function handleStatusNotification(context, payload) {
  const stationId = context.ocppConnectionName ?? context.stationId;
  const status = payload.connectorStatus ?? payload.status;
  const conectado = status === 'Occupied' ? true : status === 'Available' ? false : null;

  await pool.query(
    `INSERT INTO cargador_estado_actual (cargador_ocpp_id, conectado, status_ocpp, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (cargador_ocpp_id) DO UPDATE SET conectado = $2, status_ocpp = $3, updated_at = NOW()`,
    [stationId, conectado, status],
  );
  console.log(`[StatusNotification] ${stationId} status=${status} conectado=${conectado}`);
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
  await channel.bindQueue(QUEUE, EXCHANGE, '', {
    'x-match': 'all',
    origin: 'cs',
    state: '1',
    action: 'StatusNotification',
  });
  // OCPP 1.6 events - StartTransaction needs both the station's request (has
  // connectorId/idTag, no transactionId yet) and the CSMS's own response
  // (has the transactionId it just assigned) - see handleOcpp16Start*.
  await channel.bindQueue(QUEUE, EXCHANGE, '', {
    'x-match': 'all',
    origin: 'cs',
    state: '1',
    action: 'StartTransaction',
  });
  await channel.bindQueue(QUEUE, EXCHANGE, '', {
    'x-match': 'all',
    origin: 'csms',
    state: '2',
    action: 'StartTransaction',
  });
  await channel.bindQueue(QUEUE, EXCHANGE, '', {
    'x-match': 'all',
    origin: 'cs',
    state: '1',
    action: 'StopTransaction',
  });
  await channel.bindQueue(QUEUE, EXCHANGE, '', {
    'x-match': 'all',
    origin: 'cs',
    state: '1',
    action: 'MeterValues',
  });

  console.log(`Escuchando eventos OCPP 2.0.1 (TransactionEvent) y 1.6 (Start/Stop/MeterValues) en cola "${QUEUE}"...`);

  // Safety net: re-balance periodically in case a Started/Ended event was
  // missed (e.g. listener was briefly down) and the last pushed profile is
  // stale. Groups by (consorcio, sector) so cada sector se rebalancea aparte.
  setInterval(async () => {
    try {
      const result = await pool.query(
        `SELECT DISTINCT ca.consorcio_id, ca.sector_id
         FROM liquidacion_sesiones ls
         JOIN cargadores ca ON ca.ocpp_id = ls.cargador_ocpp_id
         WHERE ls.fecha_fin IS NULL`,
      );
      for (const { consorcio_id: consorcioId, sector_id: sectorId } of result.rows) {
        await rebalanceGroup({ consorcioId, sectorId });
      }
    } catch (err) {
      console.error('Error en el balanceo periodico:', err);
    }
  }, REBALANCE_INTERVAL_MS);

  channel.consume(QUEUE, async (msg) => {
    if (!msg) return;
    try {
      const body = JSON.parse(msg.content.toString('utf-8'));
      // Requests (from the station) use unprefixed keys; CSMS-originated
      // responses (e.g. StartTransaction.conf, which carries the assigned
      // transactionId) use the same shape but with an underscore prefix.
      const isResponse = body.action === undefined && body._action !== undefined;
      const action = isResponse ? body._action : body.action;
      const context = isResponse ? body._context : body.context;
      const payload = isResponse ? body._payload : body.payload;

      if (action === 'BootNotification') {
        await handleBootNotification(context);
      } else if (action === 'StatusNotification') {
        await handleStatusNotification(context, payload);
      } else if (action === 'StartTransaction') {
        await (isResponse ? handleOcpp16StartResponse(context, payload) : handleOcpp16StartRequest(context, payload));
      } else if (action === 'StopTransaction') {
        await handleOcpp16StopTransaction(context, payload);
      } else if (action === 'MeterValues') {
        await handleOcpp16MeterValues(context, payload);
      } else if (action === 'TransactionEvent') {
        await handleTransactionEvent(context, payload);
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
