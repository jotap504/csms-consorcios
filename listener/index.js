require('dotenv').config();
const amqp = require('amqplib');
const { Pool } = require('pg');
const { startModbusPolling } = require('./modbus-poller');

const AMQP_URL = process.env.AMQP_URL;
const DATABASE_URL = process.env.DATABASE_URL;
const CITRINEOS_REST_URL = process.env.CITRINEOS_REST_URL || 'http://citrineos-core:8080';
const EXCHANGE = 'citrineos';
const QUEUE = 'csms_saas_transaction_listener';
const MIN_AMPS = 6; // IEC 61851 minimum safe charging current
const REBALANCE_INTERVAL_MS = 60000;
const METER_STALE_MS = 90000; // lectura de medidor mas vieja que esto se ignora (fail-safe al limite estatico)
const ASSUMED_VOLTS = 220; // solo si el medidor manda potencia_kw en vez de amps por fase
const CHARGING_PROFILE_CONFIRM_TIMEOUT_MS = 4000; // cuanto esperar la respuesta real del cargador a SetChargingProfile
const CHARGING_PROFILE_POLL_MS = 400;

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
  // CitrineOS graba el protocolo REALMENTE negociado en la conexion WS actual
  // (ChargingStations.protocol) - confiar en eso antes que en ocpp_version
  // configurado a mano en cargadores/proveedor_cargadores, que puede quedar
  // desactualizado si el equipo termina negociando otra version (paso justo
  // con un wallbox de proveedor: quedo cargado como 1.6, conecto por 2.0.1,
  // y CitrineOS rechazaba el SetChargingProfile por mismatch de protocolo).
  const cs = await pool.query('SELECT protocol FROM "ChargingStations" WHERE id = $1', [stationId]);
  const protocol = cs.rows[0]?.protocol;
  if (protocol) return protocol.includes('1.6') ? '1.6' : '2.0.1';

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

// Suma de amperios actualmente asignados a TODOS los wallbox del edificio
// con sesion activa (todos los sectores + los sin sector). Se usa para
// descontar el consumo de los propios autos de la lectura del medidor
// general, cuando ese medidor esta en la acometida principal y ve todo el
// edificio (wallboxes incluidos) en vez de solo "el resto".
//
// Solo cuenta cargadores con sesion abierta (fecha_fin IS NULL): endSession
// nunca resetea amps_asignados a 0 cuando termina una carga (rebalanceGroup
// corta antes por "ordenados.length === 0"), asi que sumar la columna sin
// filtrar arrastraria para siempre el ultimo valor asignado de autos que ya
// dejaron de cargar. Tambien evita contar el piso de MIN_AMPS que se le
// asigna a un cargador recien reconectado sin sesion (handleBootNotification).
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
  const sentAt = new Date();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    const confirmation = Array.isArray(data) ? data[0] : data;
    if (!confirmation?.success) {
      console.warn(`[Balanceador] No se pudo enviar perfil a ${ocppId}:`, confirmation?.payload);
      return;
    }
    // El REST de CitrineOS para SetChargingProfile es fire-and-forget:
    // success=true solo confirma que el CALL salio, NO lo que respondio el
    // cargador (un CALLRESULT bien formado con payload.status="Rejected"
    // tambien da success=true). La respuesta real llega async y CitrineOS la
    // persiste en su propia tabla OCPPMessages - hay que ir a buscarla ahi.
    // Bug real detectado con un wallbox de proveedor (goiot c13) que
    // rechazaba TODOS los perfiles y nunca se vio en logs por esto.
    const status = await getChargingProfileConfirmationStatus(ocppId, sentAt);
    if (status && status !== 'Accepted') {
      console.warn(`[Balanceador] ${ocppId} rechazo el perfil de ${maxAmps}A: status=${status}`);
    }
  } catch (err) {
    console.warn(`[Balanceador] No se pudo enviar perfil a ${ocppId}:`, err.message);
  }
}

// Poll corto contra la tabla propia de CitrineOS donde persiste la respuesta
// real del cargador (ver comentario en pushChargingProfile). Si no llega a
// tiempo devuelve null y no se bloquea el balanceo por eso.
async function getChargingProfileConfirmationStatus(ocppId, sentAt) {
  const deadline = Date.now() + CHARGING_PROFILE_CONFIRM_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, CHARGING_PROFILE_POLL_MS));
    const r = await pool.query(
      `SELECT message FROM "OCPPMessages"
       WHERE "stationId" = $1 AND action = 'SetChargingProfile' AND state = '2' AND "timestamp" >= $2
       ORDER BY "timestamp" ASC LIMIT 1`,
      [ocppId, sentAt],
    );
    if (r.rowCount > 0) return r.rows[0].message?.[2]?.status ?? null;
  }
  return null;
}

// Ultima lectura del medidor de corriente de un sector, o del medidor
// general del edificio si sectorId es null, CRUDA por fase (ver plan
// "Balanceo de carga por fase") - a diferencia de la version anterior, no
// colapsa a un solo numero (fase mas cargada), devuelve las 3 para que
// rebalanceGroup pueda calcular disponibilidad independiente por fase.
// Devuelve null si no hay lectura, es demasiado vieja, o el medidor no
// reporta las 3 fases (fail-safe: rebalanceGroup usa el limite estatico
// configurado, igual por fase, como si no tuviera medidor dinamico).
async function getFasesMedidasAmps({ consorcioId, sectorId }) {
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

  if (row.amps_l1 != null && row.amps_l2 != null && row.amps_l3 != null) {
    return { L1: Number(row.amps_l1), L2: Number(row.amps_l2), L3: Number(row.amps_l3) };
  }
  if (row.potencia_kw != null) {
    // Sin lectura por fase (medidor solo manda potencia total) - se asume
    // pareja en las 3, mismo criterio conservador que antes del refactor.
    const amps = (Number(row.potencia_kw) * 1000) / ASSUMED_VOLTS;
    return { L1: amps, L2: amps, L3: amps };
  }
  return null;
}

// Igual que getAmpsAsignadosTotales (mismo filtro: solo cargadores con
// sesion activa) pero agrupado por fase. Un cargador trifasico -o uno
// monofasico sin fase todavia clasificada, que cae en el mismo bucket
// conservador que los trifasicos- dibuja su monto COMPLETO en cada una de
// las 3 fases simultaneamente (no dividido entre ellas).
async function getAmpsAsignadosPorFase(consorcioId) {
  const r = await pool.query(
    `SELECT ce.amps_asignados, ca.fase, p.fases AS producto_fases
     FROM cargador_estado_actual ce
     JOIN cargadores ca ON ca.ocpp_id = ce.cargador_ocpp_id
     LEFT JOIN stock_items si ON si.id = ca.stock_item_id
     LEFT JOIN productos_catalogo p ON p.id = si.producto_id
     WHERE ca.consorcio_id = $1
       AND EXISTS (
         SELECT 1 FROM liquidacion_sesiones ls
         WHERE ls.cargador_ocpp_id = ce.cargador_ocpp_id AND ls.fecha_fin IS NULL
       )`,
    [consorcioId],
  );
  const totales = { L1: 0, L2: 0, L3: 0 };
  for (const row of r.rows) {
    const amps = Number(row.amps_asignados);
    const esMonofasicoConFase = row.producto_fases === 'monofasico' && ['L1', 'L2', 'L3'].includes(row.fase);
    if (esMonofasicoConFase) {
      totales[row.fase] += amps;
    } else {
      totales.L1 += amps;
      totales.L2 += amps;
      totales.L3 += amps;
    }
  }
  return totales;
}

// Reparte "limite" amperios en partes iguales entre los cargadores de
// "ordenados" (ya en orden FIFO por fecha_inicio), respetando un piso de
// MIN_AMPS por cargador - lo que no entra queda "en cola" con 0A hasta que
// se libera un cupo. Extraida de rebalanceGroup para poder llamarla una vez
// por fase + una vez para el pool conservador en vez de una sola vez global.
async function distribuirGrupo(ordenados, limite, etiqueta) {
  if (ordenados.length === 0) return;
  const maxCupos = Math.max(0, Math.floor(limite / MIN_AMPS));
  const conCupo = ordenados.slice(0, maxCupos);
  const enCola = ordenados.slice(maxCupos);
  const perAmps = conCupo.length > 0 ? Math.floor(limite / conCupo.length) : 0;

  console.log(
    `[Balanceador] ${etiqueta} activos=${ordenados.length} cupos=${maxCupos} -> `
    + `${conCupo.length}x${perAmps}A, ${enCola.length} en cola`,
  );

  await Promise.all([
    ...conCupo.map((ocppId) => setCargadorEstado(ocppId, perAmps, false).then(() => pushChargingProfile(ocppId, perAmps))),
    ...enCola.map((ocppId) => setCargadorEstado(ocppId, 0, true).then(() => pushChargingProfile(ocppId, 0))),
  ]);
}

// Reparte el limite de amperios de un GRUPO (un sector especifico si el
// cargador pertenece a uno, o el consorcio entero para los que no tienen
// sector asignado) entre los cargadores con sesion activa en ese grupo,
// AHORA por fase: los monofasicos con fase clasificada (ver
// schema_fase_wallbox.sql) compiten solo por la disponibilidad de SU fase;
// los trifasicos y los monofasicos todavia sin clasificar caen en un pool
// conservador que usa la fase mas ajustada de las 3 (mismo criterio que
// existia antes de este refactor, ahora aplicado solo a quien realmente lo
// necesita en vez de a todos por igual).
//
// Cada sector tiene su propio circuito/balanceo independiente del resto del
// edificio (ej: 3 subsuelos con acometidas separadas) - por eso el pool de
// amperios NUNCA se comparte entre sectores distintos ni entre un sector y
// el resto del consorcio sin sector.
async function rebalanceGroup({ consorcioId, sectorId }) {
  if (consorcioId == null) return;

  let limite;
  let usarMedidorDinamico = false;
  if (sectorId != null) {
    const sector = await pool.query(
      'SELECT limite_amperios_totales, usar_medidor_dinamico FROM sectores WHERE id = $1',
      [sectorId],
    );
    limite = sector.rows[0]?.limite_amperios_totales;
    usarMedidorDinamico = sector.rows[0]?.usar_medidor_dinamico;
  } else {
    const consorcio = await pool.query(
      'SELECT limite_amperios_totales, usar_medidor_dinamico FROM consorcios WHERE id = $1',
      [consorcioId],
    );
    limite = consorcio.rows[0]?.limite_amperios_totales;
    usarMedidorDinamico = consorcio.rows[0]?.usar_medidor_dinamico;
  }
  if (!limite) return; // sin limite configurado, no hay nada para repartir

  const grupoLabel = sectorId != null ? `sector=${sectorId}` : `consorcio=${consorcioId}`;

  // "limite" es amperios contratados POR FASE (asi funciona el suministro
  // trifasico) - sin medidor dinamico, cada fase parte del mismo techo
  // estatico (no hay dato para diferenciarlas).
  let disponible = { L1: limite, L2: limite, L3: limite };

  if (usarMedidorDinamico) {
    const fasesMedidas = await getFasesMedidasAmps({ consorcioId, sectorId });
    if (fasesMedidas != null) {
      // El branch de sector asume que el medidor del sector YA excluye los
      // autos (no resta autosAsignados); el de consorcio-sin-sector ve TODO
      // el edificio incluidos los autos y hay que aislar "el resto" restando
      // lo que nosotros mismos les asignamos - misma asimetria que existia
      // antes de este refactor, sin tocar (ver comentario historico de
      // getAmpsAsignadosTotales).
      const autosPorFase = sectorId != null
        ? { L1: 0, L2: 0, L3: 0 }
        : await getAmpsAsignadosPorFase(consorcioId);

      disponible = {};
      for (const fase of ['L1', 'L2', 'L3']) {
        const restoEdificioLx = Math.max(0, fasesMedidas[fase] - autosPorFase[fase]);
        disponible[fase] = Math.max(0, Math.floor(limite - restoEdificioLx));
      }

      console.log(
        `[Balanceador] ${grupoLabel} medidor dinamico por fase (${limite}A contratado/fase): `
        + `L1 medido=${fasesMedidas.L1.toFixed(1)}A->disp=${disponible.L1}A, `
        + `L2 medido=${fasesMedidas.L2.toFixed(1)}A->disp=${disponible.L2}A, `
        + `L3 medido=${fasesMedidas.L3.toFixed(1)}A->disp=${disponible.L3}A`,
      );
    }
  }

  const activos = await pool.query(
    sectorId != null
      ? `SELECT DISTINCT ON (ls.cargador_ocpp_id) ls.cargador_ocpp_id, ls.fecha_inicio, ca.fase, p.fases AS producto_fases
         FROM liquidacion_sesiones ls
         JOIN cargadores ca ON ca.ocpp_id = ls.cargador_ocpp_id
         LEFT JOIN stock_items si ON si.id = ca.stock_item_id
         LEFT JOIN productos_catalogo p ON p.id = si.producto_id
         WHERE ca.sector_id = $1 AND ls.fecha_fin IS NULL
         ORDER BY ls.cargador_ocpp_id, ls.fecha_inicio ASC`
      : `SELECT DISTINCT ON (ls.cargador_ocpp_id) ls.cargador_ocpp_id, ls.fecha_inicio, ca.fase, p.fases AS producto_fases
         FROM liquidacion_sesiones ls
         JOIN cargadores ca ON ca.ocpp_id = ls.cargador_ocpp_id
         LEFT JOIN stock_items si ON si.id = ca.stock_item_id
         LEFT JOIN productos_catalogo p ON p.id = si.producto_id
         WHERE ca.consorcio_id = $1 AND ca.sector_id IS NULL AND ls.fecha_fin IS NULL
         ORDER BY ls.cargador_ocpp_id, ls.fecha_inicio ASC`,
    [sectorId != null ? sectorId : consorcioId],
  );
  if (activos.rowCount === 0) return;

  const ordenadosPorFecha = activos.rows.sort((a, b) => new Date(a.fecha_inicio) - new Date(b.fecha_inicio));

  const buckets = {
    L1: [], L2: [], L3: [], conservador: [],
  };
  for (const row of ordenadosPorFecha) {
    const esMonofasicoConFase = row.producto_fases === 'monofasico' && ['L1', 'L2', 'L3'].includes(row.fase);
    (esMonofasicoConFase ? buckets[row.fase] : buckets.conservador).push(row.cargador_ocpp_id);
  }

  const limiteConservador = Math.min(disponible.L1, disponible.L2, disponible.L3);

  await Promise.all([
    distribuirGrupo(buckets.L1, disponible.L1, `${grupoLabel} fase=L1`),
    distribuirGrupo(buckets.L2, disponible.L2, `${grupoLabel} fase=L2`),
    distribuirGrupo(buckets.L3, disponible.L3, `${grupoLabel} fase=L3`),
    distribuirGrupo(buckets.conservador, limiteConservador, `${grupoLabel} pool-conservador`),
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
  let tarjetaId = null;
  if (idTag) {
    const uf = await pool.query(
      `SELECT uf.id AS uf_id, t.id AS tarjeta_id FROM unidades_funcionales uf
       JOIN tarjetas_rfid t ON t.uf_id = uf.id
       WHERE t.id_tag_ocpp = $1 AND t.activa = TRUE`,
      [idTag],
    );
    ufId = uf.rows[0]?.uf_id ?? null;
    tarjetaId = uf.rows[0]?.tarjeta_id ?? null;
  }

  await pool.query(
    `INSERT INTO liquidacion_sesiones
      (transaction_id_ocpp, consorcio_id, uf_id, cargador_ocpp_id, fecha_inicio,
       kwh_consumidos, precio_kwh_aplicado, monto_total_expensa, liquidado_en_expensas, tarjeta_id)
     VALUES ($1, $2, $3, $4, $5, 0, $6, 0, FALSE, $7)`,
    [String(transactionId), consorcioId, ufId, stationId, timestamp, precioKwh, tarjetaId],
  );

  openSessions.set(sessionKey(stationId, transactionId), { startWh, precioKwh, consorcioId, sectorId, tarjetaId });
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

  let { startWh, precioKwh, consorcioId, sectorId, tarjetaId } = openSessions.get(key) ?? {};
  if (startWh === undefined) {
    console.warn(`[Ended] No hay estado en memoria para ${key}; se intenta recuperar de la DB.`);
    const row = await pool.query(
      `SELECT ls.precio_kwh_aplicado, ls.tarjeta_id, ca.consorcio_id, ca.sector_id
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
    tarjetaId = row.rows[0].tarjeta_id;
  }

  const endWh = endWhInput ?? startWh;
  const kwh = Math.max(0, (endWh - startWh) / 1000);
  const monto = kwh * precioKwh;
  const periodo = timestamp.slice(0, 7);

  // Saldo prepago (opt-in por consorcio) - deduccion atomica en la misma
  // transaccion que el cierre de la sesion, para que nunca queden
  // desincronizados si algo falla a mitad de camino.
  const usarSaldo = consorcioId != null && tarjetaId != null
    ? (await pool.query('SELECT usar_saldo_prepago FROM consorcios WHERE id = $1', [consorcioId])).rows[0]?.usar_saldo_prepago
    : false;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE liquidacion_sesiones
       SET fecha_fin = $1, kwh_consumidos = $2, monto_total_expensa = $3, periodo_expensa = $4
       WHERE transaction_id_ocpp = $5 AND cargador_ocpp_id = $6 AND fecha_fin IS NULL`,
      [timestamp, kwh, monto, periodo, String(transactionId), stationId],
    );
    if (usarSaldo && monto > 0) {
      const liquidacion = await client.query(
        'SELECT id FROM liquidacion_sesiones WHERE transaction_id_ocpp = $1 AND cargador_ocpp_id = $2',
        [String(transactionId), stationId],
      );
      await client.query('UPDATE tarjetas_rfid SET saldo = saldo - $1 WHERE id = $2', [monto, tarjetaId]);
      await client.query(
        `INSERT INTO tarjeta_movimientos (tarjeta_id, tipo, monto, liquidacion_sesion_id)
         VALUES ($1, 'consumo', $2, $3)`,
        [tarjetaId, -monto, liquidacion.rows[0]?.id ?? null],
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  if (consorcioId != null) {
    await recordLectura(stationId, transactionId, consorcioId, timestamp, { wh: endWh, powerKw: 0 });
  }

  openSessions.delete(key);
  console.log(`[Ended] ${stationId} tx=${transactionId} kwh=${kwh.toFixed(3)} monto=${monto.toFixed(2)}${usarSaldo ? ' (saldo descontado)' : ''}`);
  await rebalanceGroup({ consorcioId, sectorId });
}

// Sesiones huerfanas: la sesion sigue "activa" en liquidacion_sesiones (nunca
// llego un Ended valido - ej. el station mando un Stop mal formado que
// CitrineOS rechazo por formato antes de que nos llegara por AMQP, algo
// confirmado con un stress test) pero CitrineOS reporta el cargador
// desconectado hace rato. Sin esto, ese cargador queda "cargando" para
// siempre en la base, ocupando un cupo del balanceador de por vida.
const ORPHAN_STALE_MS = 30 * 60 * 1000; // 30 min offline sin Ended = huerfana

async function reconcileOrphanSessions() {
  const cutoff = new Date(Date.now() - ORPHAN_STALE_MS);
  const result = await pool.query(
    `SELECT ls.transaction_id_ocpp, ls.cargador_ocpp_id, cs."latestOcppMessageTimestamp"
     FROM liquidacion_sesiones ls
     JOIN "ChargingStations" cs ON cs.id = ls.cargador_ocpp_id
     WHERE ls.fecha_fin IS NULL
       AND cs."isOnline" = FALSE
       AND cs."latestOcppMessageTimestamp" < $1`,
    [cutoff],
  );
  for (const row of result.rows) {
    console.warn(
      `[Reconciliacion] Sesion huerfana: ${row.cargador_ocpp_id} tx=${row.transaction_id_ocpp}, `
      + `offline desde ${row.latestOcppMessageTimestamp}. Cerrando con la ultima lectura conocida.`,
    );
    const ultimaLectura = await pool.query(
      `SELECT kwh_acumulado FROM lecturas_medidor
       WHERE transaction_id_ocpp = $1 AND cargador_ocpp_id = $2
       ORDER BY "timestamp" DESC LIMIT 1`,
      [row.transaction_id_ocpp, row.cargador_ocpp_id],
    );
    const endWh = ultimaLectura.rows[0] ? Number(ultimaLectura.rows[0].kwh_acumulado) * 1000 : null;
    try {
      await endSession({
        stationId: row.cargador_ocpp_id,
        transactionId: row.transaction_id_ocpp,
        timestamp: new Date().toISOString(),
        endWh,
      });
    } catch (err) {
      console.error(`[Reconciliacion] Error cerrando ${row.cargador_ocpp_id}:`, err.message);
    }
  }
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

  // Alarmas historicas: solo se guarda un evento real (Faulted), no cada
  // transicion Available/Occupied/Charging - eso ya lo cubre en vivo
  // cargador_estado_actual de arriba, guardar todo aca seria puro ruido.
  if (status === 'Faulted') {
    await pool.query(
      'INSERT INTO cargador_alarmas (cargador_ocpp_id, status_ocpp, error_code) VALUES ($1, $2, $3)',
      [stationId, status, payload.errorCode ?? null],
    );
  }
}

// FirmwareStatusNotification/LogStatusNotification no traen de vuelta nada
// que correlacione con nuestro row salvo el stationId (no guardamos el
// requestId numerico que le mandamos a CitrineOS) - se actualiza la fila mas
// reciente de ese cargador, suficiente porque en la practica no hay mas de
// un firmware/diagnostico en curso por equipo a la vez.
async function handleFirmwareStatusNotification(context, payload) {
  const stationId = context.ocppConnectionName ?? context.stationId;
  const status = payload.status;
  await pool.query(
    `UPDATE firmware_updates SET status = $1
     WHERE id = (SELECT id FROM firmware_updates WHERE cargador_ocpp_id = $2 ORDER BY creado_en DESC LIMIT 1)`,
    [status, stationId],
  );
  console.log(`[FirmwareStatusNotification] ${stationId} status=${status}`);
}

async function handleLogStatusNotification(context, payload) {
  const stationId = context.ocppConnectionName ?? context.stationId;
  const status = payload.status;
  await pool.query(
    `UPDATE diagnosticos SET status = $1
     WHERE id = (SELECT id FROM diagnosticos WHERE cargador_ocpp_id = $2 ORDER BY creado_en DESC LIMIT 1)`,
    [status, stationId],
  );
  console.log(`[LogStatusNotification] ${stationId} status=${status}`);
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

  startModbusPolling(pool);

  // Safety net: re-balance periodically in case a Started/Ended event was
  // missed (e.g. listener was briefly down) and the last pushed profile is
  // stale. Groups by (consorcio, sector) so cada sector se rebalancea aparte.
  setInterval(async () => {
    try {
      await reconcileOrphanSessions();
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
      } else if (action === 'FirmwareStatusNotification') {
        await handleFirmwareStatusNotification(context, payload);
      } else if (action === 'LogStatusNotification' || action === 'DiagnosticsStatusNotification') {
        await handleLogStatusNotification(context, payload);
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
