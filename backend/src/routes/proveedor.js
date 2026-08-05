const express = require('express');
const { pool } = require('../db');
const { authenticate, requireRole } = require('../auth/middleware');
const { ensureAuthorized } = require('../lib/citrineAuth');

const router = express.Router();
router.use(authenticate, requireRole('proveedor'));
const CITRINEOS_REST_URL = process.env.CITRINEOS_REST_URL || 'http://citrineos-core:8080';

async function logTest(proveedorId, ocppId, usuarioId, accion, resultado, detalle) {
  await pool.query(
    `INSERT INTO proveedor_tests (proveedor_id, cargador_ocpp_id, usuario_id, accion, resultado, detalle)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [proveedorId, ocppId, usuarioId, accion, resultado, detalle ?? null],
  );
}

router.get('/cargadores', async (req, res) => {
  const result = await pool.query(
    `SELECT pc.id, pc.ocpp_id, pc.ocpp_version, pc.etiqueta, pc.creado_en,
            cs."isOnline" AS conectado_citrineos, cs."chargePointVendor" AS vendor_reportado,
            cs."chargePointModel" AS modelo_reportado, cs."latestOcppMessageTimestamp" AS ultimo_mensaje,
            ce.status_ocpp, ce.conectado AS conector_ocupado, ce.transaction_id_ocpp
     FROM proveedor_cargadores pc
     LEFT JOIN "ChargingStations" cs ON cs.id = pc.ocpp_id
     LEFT JOIN cargador_estado_actual ce ON ce.cargador_ocpp_id = pc.ocpp_id
     WHERE pc.proveedor_id = $1
     ORDER BY pc.creado_en DESC`,
    [req.user.proveedorId],
  );
  res.json(result.rows);
});

router.post('/cargadores', async (req, res) => {
  const { ocpp_id, ocpp_version, etiqueta } = req.body ?? {};
  if (!ocpp_id) {
    return res.status(400).json({ error: 'ocpp_id es requerido.' });
  }
  const version = ocpp_version === '1.6' ? '1.6' : '2.0.1';
  try {
    const result = await pool.query(
      `INSERT INTO proveedor_cargadores (proveedor_id, ocpp_id, ocpp_version, etiqueta)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.user.proveedorId, ocpp_id, version, etiqueta ?? null],
    );
    await logTest(req.user.proveedorId, ocpp_id, req.user.sub, 'emparejar', 'OK', `version=${version}`);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      await logTest(req.user.proveedorId, ocpp_id, req.user.sub, 'emparejar', 'ERROR', 'ocpp_id ya emparejado');
      return res.status(409).json({ error: `Ya existe un cargador emparejado con ocpp_id "${ocpp_id}".` });
    }
    throw err;
  }
});

router.delete('/cargadores/:id', async (req, res) => {
  const result = await pool.query(
    'DELETE FROM proveedor_cargadores WHERE id = $1 AND proveedor_id = $2',
    [req.params.id, req.user.proveedorId],
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Cargador no encontrado.' });
  res.status(204).end();
});

// Confirms ocppId belongs to this proveedor and returns its ocpp_version -
// every action below needs this to pick the right REST bridge shape.
async function ownCargador(req, res) {
  const result = await pool.query(
    'SELECT ocpp_version FROM proveedor_cargadores WHERE ocpp_id = $1 AND proveedor_id = $2',
    [req.params.ocppId, req.user.proveedorId],
  );
  if (result.rowCount === 0) {
    res.status(404).json({ error: 'Este cargador no esta emparejado con tu cuenta.' });
    return null;
  }
  return result.rows[0].ocpp_version;
}

router.post('/cargadores/:ocppId/set-amps', async (req, res) => {
  const version = await ownCargador(req, res);
  if (version === null) return;
  const { amps } = req.body ?? {};
  if (!amps || amps <= 0) {
    return res.status(400).json({ error: 'amps debe ser un numero mayor a 0.' });
  }

  const is16 = version === '1.6';
  const profileId = Date.now() % 1000000;
  const url = is16
    ? `${CITRINEOS_REST_URL}/ocpp/1.6/smartcharging/setChargingProfile?identifier=${encodeURIComponent(req.params.ocppId)}&tenantId=1`
    : `${CITRINEOS_REST_URL}/ocpp/2.0.1/smartcharging/setChargingProfile?identifier=${encodeURIComponent(req.params.ocppId)}&tenantId=1`;
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
    const citrineRes = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await citrineRes.json();
    const confirmation = Array.isArray(data) ? data[0] : data;
    if (!confirmation?.success) {
      await logTest(req.user.proveedorId, req.params.ocppId, req.user.sub, 'set_amps', 'ERROR', JSON.stringify(confirmation));
      return res.status(502).json({ error: 'El cargador rechazo el perfil de carga.', detail: confirmation });
    }
    await logTest(req.user.proveedorId, req.params.ocppId, req.user.sub, 'set_amps', 'OK', `${amps}A`);
    res.json({ ok: true });
  } catch (err) {
    await logTest(req.user.proveedorId, req.params.ocppId, req.user.sub, 'set_amps', 'ERROR', err.message);
    res.status(502).json({ error: 'No se pudo comunicar con el cargador.' });
  }
});

router.post('/cargadores/:ocppId/iniciar', async (req, res) => {
  const version = await ownCargador(req, res);
  if (version === null) return;

  const is16 = version === '1.6';
  const idTag = 'PROVEEDOR-TEST';
  await ensureAuthorized(pool, idTag);
  const url = is16
    ? `${CITRINEOS_REST_URL}/ocpp/1.6/evdriver/remoteStartTransaction?identifier=${encodeURIComponent(req.params.ocppId)}&tenantId=1`
    : `${CITRINEOS_REST_URL}/ocpp/2.0.1/evdriver/requestStartTransaction?identifier=${encodeURIComponent(req.params.ocppId)}&tenantId=1`;
  const body = is16
    ? { connectorId: 1, idTag }
    : { remoteStartId: Date.now() % 1000000, idToken: { idToken: idTag, type: 'ISO14443' }, evseId: 1 };
  try {
    const citrineRes = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await citrineRes.json();
    const confirmation = Array.isArray(data) ? data[0] : data;
    if (!confirmation?.success) {
      await logTest(req.user.proveedorId, req.params.ocppId, req.user.sub, 'iniciar', 'ERROR', JSON.stringify(confirmation));
      return res.status(502).json({ error: 'El cargador rechazo el inicio remoto.', detail: confirmation });
    }
    await logTest(req.user.proveedorId, req.params.ocppId, req.user.sub, 'iniciar', 'OK', null);
    res.json({ ok: true });
  } catch (err) {
    await logTest(req.user.proveedorId, req.params.ocppId, req.user.sub, 'iniciar', 'ERROR', err.message);
    res.status(502).json({ error: 'No se pudo comunicar con el cargador.' });
  }
});

router.post('/cargadores/:ocppId/detener', async (req, res) => {
  const version = await ownCargador(req, res);
  if (version === null) return;

  const estado = await pool.query('SELECT transaction_id_ocpp FROM cargador_estado_actual WHERE cargador_ocpp_id = $1', [req.params.ocppId]);
  const txId = estado.rows[0]?.transaction_id_ocpp;
  if (!txId) {
    return res.status(404).json({ error: 'No hay una carga de prueba activa para detener.' });
  }

  const is16 = version === '1.6';
  const url = is16
    ? `${CITRINEOS_REST_URL}/ocpp/1.6/evdriver/remoteStopTransaction?identifier=${encodeURIComponent(req.params.ocppId)}&tenantId=1`
    : `${CITRINEOS_REST_URL}/ocpp/2.0.1/evdriver/requestStopTransaction?identifier=${encodeURIComponent(req.params.ocppId)}&tenantId=1`;
  const body = is16 ? { transactionId: Number(txId) } : { transactionId: txId };
  try {
    const citrineRes = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await citrineRes.json();
    const confirmation = Array.isArray(data) ? data[0] : data;
    if (!confirmation?.success) {
      await logTest(req.user.proveedorId, req.params.ocppId, req.user.sub, 'detener', 'ERROR', JSON.stringify(confirmation));
      return res.status(502).json({ error: 'El cargador rechazo la detencion remota.', detail: confirmation });
    }
    await logTest(req.user.proveedorId, req.params.ocppId, req.user.sub, 'detener', 'OK', null);
    res.json({ ok: true });
  } catch (err) {
    await logTest(req.user.proveedorId, req.params.ocppId, req.user.sub, 'detener', 'ERROR', err.message);
    res.status(502).json({ error: 'No se pudo comunicar con el cargador.' });
  }
});

// QR generation itself happens client-side (same `qrcode` lib the admin
// panel uses) - this just records it happened, for the audit trail.
router.post('/cargadores/:ocppId/qr-generado', async (req, res) => {
  const version = await ownCargador(req, res);
  if (version === null) return;
  await logTest(req.user.proveedorId, req.params.ocppId, req.user.sub, 'generar_qr', 'OK', null);
  res.status(201).json({ ok: true });
});

router.get('/tests', async (req, res) => {
  const result = await pool.query(
    `SELECT pt.id, pt.cargador_ocpp_id, pt.accion, pt.resultado, pt.detalle, pt.creado_en, u.email AS usuario_email
     FROM proveedor_tests pt
     LEFT JOIN usuarios u ON u.id = pt.usuario_id
     WHERE pt.proveedor_id = $1
     ORDER BY pt.creado_en DESC LIMIT 100`,
    [req.user.proveedorId],
  );
  res.json(result.rows);
});

module.exports = router;
