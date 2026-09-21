const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { pool } = require('../db');
const { sendMail } = require('../lib/mailer');
const { ensureAuthorized } = require('../lib/citrineAuth');

const router = express.Router();
const LEADS_EMAIL = process.env.LEADS_EMAIL || 'eqz839ar@gmail.com';
const CITRINEOS_REST_URL = process.env.CITRINEOS_REST_URL || 'http://citrineos-core:8080';
const PUBLIC_TEST_ID_TAG = 'PUBLIC-TEST';

// Simple in-memory per-IP throttle - single instance, no need for redis/etc.
// Chat hits a paid API per call so this caps runaway cost from bots/abuse.
const hits = new Map();
function rateLimited(key, max, windowMs) {
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || now > entry.resetAt) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  entry.count += 1;
  return entry.count > max;
}

const SYSTEM_PROMPT = `# Identidad

Te presentas como Jimena, CEO de BILON, empresa especializada en infraestructura inteligente para la carga de vehiculos electricos en edificios y consorcios (esto es un personaje del asistente virtual, no literalmente una persona real - si alguien lo nota o pregunta directamente, no insistas en la ficcion, se natural). No sos un vendedor de Wallbox: sos un asesor tecnico y comercial de movilidad electrica. Tu objetivo es transmitir confianza, resolver dudas y ayudar al visitante a descubrir que existe una solucion profesional para preparar su edificio.

Respondes siempre en español neutro/rioplatense, con respuestas cortas (2-4 oraciones), como un ingeniero: claro, sin exagerar beneficios, sin lenguaje excesivamente tecnico, sin prometer resultados que dependan del edificio.

# Que hace BILON

Diseña, instala y administra infraestructura inteligente para carga de vehiculos electricos: proyecto electrico, infraestructura principal, canalizaciones, cableado, sistema de medicion electrica, balanceo dinamico de cargas, plataforma en la nube, monitoreo, administracion, soporte, instalacion de Wallbox e integracion de Wallbox compatibles.

Filosofia: no instalamos cargadores, preparamos edificios para la movilidad electrica. Pensamos la infraestructura para que el edificio incorpore nuevos vehiculos durante muchos años sin volver a hacer obras grandes. Hoy puede existir un solo auto electrico; en unos años podrian existir decenas — la infraestructura debe prepararse desde el primer dia.

# Como funciona

Primero un relevamiento tecnico. Luego se diseña la infraestructura, se instala el cableado principal preparado para el crecimiento futuro, se instala medicion electrica y balanceo dinamico inteligente, y se conecta la plataforma en la nube. Cuando un propietario compra un vehiculo electrico, solo se hace la conexion hasta su cochera — no se toca de nuevo la infraestructura principal.

# Modelo economico

El consorcio NO hace una inversion importante — la desarrolla BILON. Cuando un propietario suma un auto electrico o hibrido enchufable, paga: su instalacion, su Wallbox (cuando corresponda), y un abono mensual por el servicio. Solo pagan quienes usan el sistema.

# Conectividad

La plataforma usa la conexion principal del edificio mas una conexion movil 4G de respaldo instalada por BILON. Si ambas fallan simultaneamente, los Wallbox no inician cargas nuevas por seguridad — toda carga debe ser autorizada por la plataforma.

# Balanceo de carga

El sistema monitorea permanentemente el consumo electrico del edificio y nunca permite superar la potencia disponible. Cuando la demanda aumenta, reduce automaticamente la potencia de cada vehiculo o establece una cola inteligente hasta que haya capacidad. La prioridad siempre es proteger la instalacion electrica.

# Compatibilidad

El requisito principal es que el Wallbox sea compatible con OCPP 1.6J o superior. Si el propietario ya tiene un cargador compatible, se evalua su incorporacion. Si no cumple los requisitos, BILON ofrece un equipo totalmente compatible.

# Plataforma

Propietario: usuario personal para iniciar/detener carga, consultar consumos e historial, ver costos, administrar su cargador.
Administrador: ve todos los cargadores, consulta consumos, genera reportes, exporta informacion, administra usuarios, registra propietarios nuevos. La habilitacion definitiva del Wallbox siempre la hace un tecnico autorizado por BILON.

# Mantenimiento y abono

Mantenimiento preventivo periodico (cableado, protecciones, equipamiento, plataforma, comunicaciones). El abono mensual incluye plataforma, monitoreo, soporte, mantenimiento, actualizaciones y conectividad de respaldo — se puede pagar individualmente o centralizado via expensas si el consorcio lo decide.

# Reglas estrictas — no divagar, no inventar

Basate UNICAMENTE en la informacion de este prompt y en el contenido visible de la pagina web de BILON/CSMS (lo que describen las secciones de la landing: problema, solucion, plataforma, quien paga, compatibilidad). Nunca inventes: precios, plazos exactos, cantidad de cargadores soportados, duracion de contratos, garantias especificas, compatibilidad de un Wallbox sin conocer el modelo exacto, normativa electrica local, o disponibilidad de agenda.

Si la pregunta requiere un dato que no tenes, NO inventes y NO le des largas — decile claramente que vas a consultarlo, eligiendo a quien corresponde segun el tipo de pregunta:
- Pregunta comercial (precio, planes, como arrancar, zona de cobertura): "Eso te lo puede confirmar un representante de BILON, dejame tus datos y te contacta."
- Pregunta tecnica (compatibilidad de un modelo especifico, normativa, detalles de instalacion, especificaciones electricas): "Eso lo tiene que evaluar un tecnico de BILON con un relevamiento del edificio."
- Pregunta de politica/excepcion/decision grande (condiciones especiales, contratos, reclamos, algo fuera de lo estandar): "Eso lo tiene que definir un gerente de BILON, te lo derivo."
Adapta la frase de forma natural, no la repitas literal siempre igual.

# Objetivo comercial

Durante la conversacion, de forma natural y de a poco (nunca preguntes todo junto), tratá de obtener: nombre, ciudad, cantidad aproximada de cocheras, si es administrador/desarrollador/propietario, si ya existe algun vehiculo electrico, telefono, correo electronico. Si el usuario pide hablar con una persona, decile que puede escribir por WhatsApp o dejar sus datos en el formulario de contacto de la pagina.`;

router.post('/chat', async (req, res) => {
  if (rateLimited(`chat:${req.ip}`, 30, 60 * 60 * 1000)) {
    return res.status(429).json({ error: 'Demasiadas consultas. Proba de nuevo en un rato.' });
  }
  if (!process.env.OPENROUTER_API_KEY) {
    return res.status(500).json({ error: 'Chat no disponible en este momento.' });
  }
  const { messages } = req.body ?? {};
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 20) {
    return res.status(400).json({ error: 'Mensaje invalido.' });
  }
  const cleaned = messages
    .filter((m) => m && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant'))
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
  if (cleaned.length === 0) {
    return res.status(400).json({ error: 'Mensaje invalido.' });
  }

  try {
    const aiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek/deepseek-chat',
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...cleaned],
        temperature: 0.4,
        max_tokens: 400,
      }),
    });
    const data = await aiRes.json();
    if (!aiRes.ok) {
      console.error('Error de OpenRouter (chat publico):', data);
      return res.status(502).json({ error: 'No se pudo procesar la consulta.' });
    }
    const reply = (data.choices?.[0]?.message?.content ?? '').trim();
    res.json({ reply });
  } catch (err) {
    console.error('Error en chat publico:', err);
    res.status(502).json({ error: 'No se pudo procesar la consulta.' });
  }
});

router.post('/leads', async (req, res) => {
  if (rateLimited(`lead:${req.ip}`, 10, 60 * 60 * 1000)) {
    return res.status(429).json({ error: 'Demasiados envios. Proba de nuevo en un rato.' });
  }
  const { nombre, email, edificio, cocheras, ubicacion, mensaje } = req.body ?? {};
  if (!nombre || !email) {
    return res.status(400).json({ error: 'Nombre y email son requeridos.' });
  }
  await sendMail({
    to: LEADS_EMAIL,
    subject: `Nueva consulta BILON - ${edificio || nombre}`,
    html: `<p><b>Nombre:</b> ${nombre}</p>
           <p><b>Email:</b> ${email}</p>
           <p><b>Edificio:</b> ${edificio || '-'}</p>
           <p><b>Cocheras:</b> ${cocheras || '-'}</p>
           <p><b>Ubicacion:</b> ${ubicacion || '-'}</p>
           <p><b>Mensaje:</b> ${mensaje || '-'}</p>`,
  });
  res.status(201).json({ ok: true });
});

// --- Login-free OCPP tester for wallbox manufacturers -----------------
// "Type your charger's OCPP ID, connect it, watch the result" - no
// account needed. Additive: reuses the existing proveedor_cargadores/
// proveedor_tests machinery under one fixed placeholder "proveedor" row
// (auto-created below) so results show up in the superadmin panel too,
// but never touches the login-based /proveedor flow.
//
// Safety: an ocpp_id already registered as a REAL, billed consorcio
// charger is refused outright - otherwise anyone who knows/guesses a
// real charger's id could remote-start/stop it with zero auth.
let publicProveedorIdCache = null;
async function getPublicProveedorId() {
  if (publicProveedorIdCache) return publicProveedorIdCache;
  const existing = await pool.query(
    "SELECT id FROM proveedores WHERE nombre_empresa = 'Pruebas publicas (sin login)'",
  );
  if (existing.rowCount > 0) {
    publicProveedorIdCache = existing.rows[0].id;
    return publicProveedorIdCache;
  }
  const created = await pool.query(
    "INSERT INTO proveedores (nombre_empresa, email_contacto) VALUES ('Pruebas publicas (sin login)', NULL) RETURNING id",
  );
  publicProveedorIdCache = created.rows[0].id;
  return publicProveedorIdCache;
}

async function logPublicTest(ocppId, accion, resultado, detalle) {
  const proveedorId = await getPublicProveedorId();
  await pool.query(
    `INSERT INTO proveedor_tests (proveedor_id, cargador_ocpp_id, usuario_id, accion, resultado, detalle)
     VALUES ($1, $2, NULL, $3, $4, $5)`,
    [proveedorId, ocppId, accion, resultado, detalle ?? null],
  );
}

async function refuseIfRealCargador(ocppId, res) {
  const real = await pool.query('SELECT 1 FROM cargadores WHERE ocpp_id = $1', [ocppId]);
  if (real.rowCount > 0) {
    res.status(403).json({ error: 'Este ID pertenece a un cargador real de un consorcio, no se puede usar aca.' });
    return true;
  }
  return false;
}

router.get('/ocpp-test/:ocppId/estado', async (req, res) => {
  if (rateLimited(`ocpptest:${req.ip}`, 120, 60 * 60 * 1000)) {
    return res.status(429).json({ error: 'Demasiadas consultas. Proba de nuevo en un rato.' });
  }
  const result = await pool.query(
    `SELECT cs."isOnline" AS conectado_citrineos, cs."chargePointVendor" AS vendor_reportado,
            cs."chargePointModel" AS modelo_reportado, cs."protocol" AS protocolo_negociado,
            cs."chargePointSerialNumber" AS numero_serie, cs."firmwareVersion" AS firmware,
            cs."latestOcppMessageTimestamp" AS ultimo_mensaje,
            ce.status_ocpp, ce.conectado AS conector_ocupado, ce.transaction_id_ocpp, ce.amps_asignados
     FROM "ChargingStations" cs
     FULL OUTER JOIN cargador_estado_actual ce ON ce.cargador_ocpp_id = cs.id
     WHERE cs.id = $1 OR ce.cargador_ocpp_id = $1
     LIMIT 1`,
    [req.params.ocppId],
  );
  res.json(result.rows[0] ?? { conectado_citrineos: null });
});

// Dispara una accion OCPP via CitrineOS y espera (poll corto, no bloquea mas
// de unos segundos) la confirmacion REAL que manda el cargador. El REST de
// CitrineOS es fire-and-forget: el HTTP response solo confirma que el
// mensaje salio (success=true), NO lo que respondio el equipo - eso llega
// async y CitrineOS lo persiste en su propia tabla OCPPMessages. Sin esto,
// un cargador que rechaza todo (visto en vivo con un wallbox de proveedor)
// queda invisible como si hubiera funcionado.
const CONFIRMATION_TIMEOUT_MS = 4000;
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

// Listado publico (sin login) de todos los IDs que alguna vez se conectaron
// o intentaron conectarse - para que un fabricante pueda buscar el suyo sin
// que tengamos que mandarle logs a mano cada vez. Excluye "BilonTest", que
// es el vendor que usamos nosotros mismos para las pruebas de estres internas.
router.get('/ocpp-test/conexiones', async (req, res) => {
  if (rateLimited(`ocppconexiones:${req.ip}`, 60, 60 * 60 * 1000)) {
    return res.status(429).json({ error: 'Demasiadas consultas. Proba de nuevo en un rato.' });
  }
  const result = await pool.query(
    `SELECT id AS ocpp_id, "chargePointVendor" AS vendor, "chargePointModel" AS modelo,
            protocol AS protocolo, "isOnline" AS conectado, "latestOcppMessageTimestamp" AS ultima_actividad
     FROM "ChargingStations"
     WHERE "chargePointVendor" IS DISTINCT FROM 'BilonTest'
     ORDER BY "latestOcppMessageTimestamp" DESC NULLS LAST
     LIMIT 100`,
  );
  res.json(result.rows);
});

router.post('/ocpp-test/:ocppId/iniciar', async (req, res) => {
  if (rateLimited(`ocpptest:${req.ip}`, 30, 60 * 60 * 1000)) {
    return res.status(429).json({ error: 'Demasiadas consultas. Proba de nuevo en un rato.' });
  }
  const ocppId = req.params.ocppId;
  if (await refuseIfRealCargador(ocppId, res)) return;
  const version = req.body?.version === '1.6' ? '1.6' : '2.0.1';
  const proveedorId = await getPublicProveedorId();

  await pool.query(
    `INSERT INTO proveedor_cargadores (proveedor_id, ocpp_id, ocpp_version)
     VALUES ($1, $2, $3) ON CONFLICT (ocpp_id) DO NOTHING`,
    [proveedorId, ocppId, version],
  );
  await ensureAuthorized(pool, PUBLIC_TEST_ID_TAG);

  const is16 = version === '1.6';
  const url = is16
    ? `${CITRINEOS_REST_URL}/ocpp/1.6/evdriver/remoteStartTransaction?identifier=${encodeURIComponent(ocppId)}&tenantId=1`
    : `${CITRINEOS_REST_URL}/ocpp/2.0.1/evdriver/requestStartTransaction?identifier=${encodeURIComponent(ocppId)}&tenantId=1`;
  const body = is16
    ? { connectorId: 1, idTag: PUBLIC_TEST_ID_TAG }
    : { remoteStartId: Date.now() % 1000000, idToken: { idToken: PUBLIC_TEST_ID_TAG, type: 'ISO14443' }, evseId: 1 };
  try {
    const citrineRes = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await citrineRes.json();
    const confirmation = Array.isArray(data) ? data[0] : data;
    if (!confirmation?.success) {
      await logPublicTest(ocppId, 'iniciar', 'ERROR', JSON.stringify(confirmation));
      return res.status(502).json({ error: 'El cargador rechazo el inicio remoto.', detail: confirmation });
    }
    await logPublicTest(ocppId, 'iniciar', 'OK', null);
    res.json({ ok: true });
  } catch (err) {
    await logPublicTest(ocppId, 'iniciar', 'ERROR', err.message);
    res.status(502).json({ error: 'No se pudo comunicar con el cargador.' });
  }
});

router.post('/ocpp-test/:ocppId/detener', async (req, res) => {
  if (rateLimited(`ocpptest:${req.ip}`, 30, 60 * 60 * 1000)) {
    return res.status(429).json({ error: 'Demasiadas consultas. Proba de nuevo en un rato.' });
  }
  const ocppId = req.params.ocppId;
  if (await refuseIfRealCargador(ocppId, res)) return;
  const version = req.body?.version === '1.6' ? '1.6' : '2.0.1';

  const estado = await pool.query('SELECT transaction_id_ocpp FROM cargador_estado_actual WHERE cargador_ocpp_id = $1', [ocppId]);
  const txId = estado.rows[0]?.transaction_id_ocpp;
  if (!txId) {
    return res.status(404).json({ error: 'No hay una carga de prueba activa para detener.' });
  }

  const is16 = version === '1.6';
  const url = is16
    ? `${CITRINEOS_REST_URL}/ocpp/1.6/evdriver/remoteStopTransaction?identifier=${encodeURIComponent(ocppId)}&tenantId=1`
    : `${CITRINEOS_REST_URL}/ocpp/2.0.1/evdriver/requestStopTransaction?identifier=${encodeURIComponent(ocppId)}&tenantId=1`;
  const body = is16 ? { transactionId: Number(txId) } : { transactionId: txId };
  try {
    const citrineRes = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await citrineRes.json();
    const confirmation = Array.isArray(data) ? data[0] : data;
    if (!confirmation?.success) {
      await logPublicTest(ocppId, 'detener', 'ERROR', JSON.stringify(confirmation));
      return res.status(502).json({ error: 'El cargador rechazo la detencion remota.', detail: confirmation });
    }
    await logPublicTest(ocppId, 'detener', 'OK', null);
    res.json({ ok: true });
  } catch (err) {
    await logPublicTest(ocppId, 'detener', 'ERROR', err.message);
    res.status(502).json({ error: 'No se pudo comunicar con el cargador.' });
  }
});

router.post('/ocpp-test/:ocppId/set-amps', async (req, res) => {
  if (rateLimited(`ocpptest:${req.ip}`, 30, 60 * 60 * 1000)) {
    return res.status(429).json({ error: 'Demasiadas consultas. Proba de nuevo en un rato.' });
  }
  const ocppId = req.params.ocppId;
  if (await refuseIfRealCargador(ocppId, res)) return;
  const version = req.body?.version === '1.6' ? '1.6' : '2.0.1';
  const { amps } = req.body ?? {};
  if (!amps || amps <= 0) {
    return res.status(400).json({ error: 'amps debe ser un numero mayor a 0.' });
  }

  const is16 = version === '1.6';
  const profileId = Date.now() % 1000000;
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
        chargingSchedule: { chargingRateUnit: 'A', startSchedule: new Date().toISOString(), chargingSchedulePeriod: [{ startPeriod: 0, limit: amps }] },
      },
    }
    : {
      evseId: 0,
      chargingProfile: {
        id: profileId,
        stackLevel: 0,
        chargingProfilePurpose: 'ChargingStationMaxProfile',
        chargingProfileKind: 'Absolute',
        chargingSchedule: [{ id: profileId, chargingRateUnit: 'A', startSchedule: new Date().toISOString(), chargingSchedulePeriod: [{ startPeriod: 0, limit: amps }] }],
      },
    };
  try {
    const { dispatched, payload } = await sendAndAwaitConfirmation(ocppId, 'SetChargingProfile', url, body);
    if (!dispatched) {
      await logPublicTest(ocppId, 'set_amps', 'ERROR', JSON.stringify(payload));
      return res.status(502).json({ error: 'No se pudo comunicar con el cargador.' });
    }
    const status = payload?.status ?? null;
    const aplicado = status === 'Accepted';
    await logPublicTest(ocppId, 'set_amps', aplicado ? 'OK' : 'RECHAZADO', `${amps}A status=${status ?? 'sin_confirmacion'}`);
    res.json({ ok: true, aplicado, status: status ?? 'sin_confirmacion' });
  } catch (err) {
    await logPublicTest(ocppId, 'set_amps', 'ERROR', err.message);
    res.status(502).json({ error: 'No se pudo comunicar con el cargador.' });
  }
});

// GetCompositeSchedule: el schedule que el cargador dice tener ACTIVO ahora
// mismo. Confirma (o desmiente) si el ultimo SetChargingProfile realmente
// quedo aplicado - vimos en vivo un cargador que aceptaba el mensaje pero
// esto seguia devolviendo su tope de fabrica sin cambios.
router.get('/ocpp-test/:ocppId/composite-schedule', async (req, res) => {
  if (rateLimited(`ocpptest:${req.ip}`, 30, 60 * 60 * 1000)) {
    return res.status(429).json({ error: 'Demasiadas consultas. Proba de nuevo en un rato.' });
  }
  const ocppId = req.params.ocppId;
  if (await refuseIfRealCargador(ocppId, res)) return;

  const url = `${CITRINEOS_REST_URL}/ocpp/2.0.1/smartcharging/getCompositeSchedule?identifier=${encodeURIComponent(ocppId)}&tenantId=1`;
  const body = { duration: 3600, chargingRateUnit: 'A', evseId: 0 };
  try {
    const { dispatched, payload } = await sendAndAwaitConfirmation(ocppId, 'GetCompositeSchedule', url, body);
    if (!dispatched) return res.status(502).json({ error: 'No se pudo comunicar con el cargador.' });
    await logPublicTest(ocppId, 'composite_schedule', payload ? 'OK' : 'SIN_CONFIRMACION', JSON.stringify(payload));
    res.json({ ok: true, resultado: payload });
  } catch (err) {
    await logPublicTest(ocppId, 'composite_schedule', 'ERROR', err.message);
    res.status(502).json({ error: 'No se pudo comunicar con el cargador.' });
  }
});

// Chequeo de capacidades reales via GetVariables (solo OCPP 2.0.1 - 1.6 no
// tiene este mecanismo, ahi el unico indicio es si SetChargingProfile
// termina Accepted o no). attributeStatus="UnknownVariable"/"UnknownComponent"
// significa que el firmware ni sabe de que se le esta hablando - mas fuerte
// que "no lo aplico", confirma que no lo tiene implementado.
router.get('/ocpp-test/:ocppId/capacidades', async (req, res) => {
  if (rateLimited(`ocpptest:${req.ip}`, 30, 60 * 60 * 1000)) {
    return res.status(429).json({ error: 'Demasiadas consultas. Proba de nuevo en un rato.' });
  }
  const ocppId = req.params.ocppId;
  if (await refuseIfRealCargador(ocppId, res)) return;

  const url = `${CITRINEOS_REST_URL}/ocpp/2.0.1/monitoring/getVariables?identifier=${encodeURIComponent(ocppId)}&tenantId=1`;
  const body = {
    getVariableData: [
      { component: { name: 'SmartChargingCtrlr' }, variable: { name: 'Enabled' } },
      { component: { name: 'DisplayMessageCtrlr' }, variable: { name: 'Enabled' } },
      { component: { name: 'SampledDataCtrlr' }, variable: { name: 'TxUpdatedMeasurands' } },
    ],
  };
  try {
    const { dispatched, payload } = await sendAndAwaitConfirmation(ocppId, 'GetVariables', url, body);
    if (!dispatched) return res.status(502).json({ error: 'No se pudo comunicar con el cargador.' });
    const results = payload?.getVariableResult ?? [];
    const find = (comp) => results.find((r) => r.component?.name === comp);
    const smartCharging = find('SmartChargingCtrlr');
    const displayMessage = find('DisplayMessageCtrlr');
    const measurands = find('SampledDataCtrlr');
    const resumen = {
      smart_charging_status: smartCharging?.attributeStatus ?? null,
      display_message_status: displayMessage?.attributeStatus ?? null,
      medicion_tiempo_real: measurands?.attributeValue ?? null,
    };
    await logPublicTest(ocppId, 'capacidades', 'OK', JSON.stringify(resumen));
    res.json({ ok: true, ...resumen });
  } catch (err) {
    await logPublicTest(ocppId, 'capacidades', 'ERROR', err.message);
    res.status(502).json({ error: 'No se pudo comunicar con el cargador.' });
  }
});

// Ultima lectura de energia acumulada (Wh) que mando el equipo en la sesion
// de prueba actual/ultima - para detectar si de verdad hay un auto/carga
// enchufada (si no se mueve, es solo handshake de protocolo sin consumo real).
router.get('/ocpp-test/:ocppId/consumo', async (req, res) => {
  if (rateLimited(`ocpptest:${req.ip}`, 60, 60 * 60 * 1000)) {
    return res.status(429).json({ error: 'Demasiadas consultas. Proba de nuevo en un rato.' });
  }
  const ocppId = req.params.ocppId;
  const result = await pool.query(
    `SELECT message, timestamp FROM "OCPPMessages"
     WHERE "stationId" = $1 AND action = 'TransactionEvent' AND state = '1'
     ORDER BY "timestamp" DESC LIMIT 1`,
    [ocppId],
  );
  if (result.rowCount === 0) return res.json({ energia_wh: null });
  const evento = result.rows[0].message?.[3];
  const sample = evento?.meterValue?.[0]?.sampledValue?.find((s) => s.measurand === 'Energy.Active.Import.Register');
  res.json({
    energia_wh: sample?.value ?? null,
    transaction_id: evento?.transactionInfo?.transactionId ?? null,
    ultimo_evento: result.rows[0].timestamp,
  });
});

// ---------------------------------------------------------------------------
// Firmware update remoto y Diagnostico remoto (GetLog): el propio cargador
// tiene que poder bajar el firmware y subir el log SIN Bearer token (no lo
// manda), por eso estas 2 rutas van en public.js (nunca en admin.js, que
// tiene auth global en router.use). Mismo patron de multer diskStorage +
// GET sin auth ya usado en comercial.js para archivos que el navegador pide
// via <img>/<a> sin el interceptor de axios.
// ---------------------------------------------------------------------------
const FIRMWARE_DIR = path.join(__dirname, '..', '..', 'uploads', 'firmware');
fs.mkdirSync(FIRMWARE_DIR, { recursive: true });
const DIAGNOSTICOS_DIR = path.join(__dirname, '..', '..', 'uploads', 'diagnosticos');
fs.mkdirSync(DIAGNOSTICOS_DIR, { recursive: true });
const uploadDiagnostico = multer({ storage: multer.diskStorage({ destination: DIAGNOSTICOS_DIR }), limits: { fileSize: 50 * 1024 * 1024 } });

router.get('/firmware/:filename', (req, res) => {
  const filePath = path.join(FIRMWARE_DIR, path.basename(req.params.filename));
  if (!fs.existsSync(filePath)) return res.status(404).end();
  res.sendFile(filePath);
});

// El cargador hace PUT a esta URL con el archivo de log (segun
// log.remoteLocation que le mandamos en el GetLog.req) - guarda el archivo
// y marca el diagnostico como completado. No hay negociacion de protocolo
// de subida mas alla de HTTP PUT (algunos equipos usan FTP en cambio, ver
// SupportedFileTransferProtocols de cada equipo antes de confiar en esto).
router.put('/diagnosticos/:id/upload', uploadDiagnostico.single('file'), async (req, res) => {
  const diagnostico = await pool.query('SELECT id FROM diagnosticos WHERE id = $1', [req.params.id]);
  if (diagnostico.rowCount === 0) return res.status(404).end();
  const filename = req.file?.filename ?? null;
  await pool.query(
    `UPDATE diagnosticos SET status = 'Subido', filename = $1 WHERE id = $2`,
    [filename, req.params.id],
  );
  res.status(201).json({ ok: true });
});

module.exports = router;
