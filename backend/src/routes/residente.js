const express = require('express');
const { pool } = require('../db');
const { authenticate, requireRole } = require('../auth/middleware');

const router = express.Router();
router.use(authenticate, requireRole('residente'));
const CITRINEOS_REST_URL = process.env.CITRINEOS_REST_URL || 'http://citrineos-core:8080';

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
    'SELECT id, id_tag_ocpp, activa FROM tarjetas_rfid WHERE uf_id = $1 ORDER BY id',
    [req.user.ufId],
  );
  res.json(result.rows);
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

  const sesion = await pool.query(
    `SELECT transaction_id_ocpp, fecha_inicio FROM liquidacion_sesiones
     WHERE cargador_ocpp_id = $1 AND uf_id = $2 AND fecha_fin IS NULL
     ORDER BY fecha_inicio DESC LIMIT 1`,
    [req.params.ocppId, req.user.ufId],
  );
  if (sesion.rowCount === 0) {
    return res.json({ activo: false, conectado });
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
    const sector = await pool.query('SELECT limite_amperios_totales FROM sectores WHERE id = $1', [sectorId]);
    limite = sector.rows[0]?.limite_amperios_totales;
  } else {
    const consorcio = await pool.query('SELECT limite_amperios_totales FROM consorcios WHERE id = $1', [consorcioId]);
    limite = consorcio.rows[0]?.limite_amperios_totales;
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
  const cargador = await pool.query(
    'SELECT id, ocpp_version FROM cargadores WHERE ocpp_id = $1 AND uf_id = $2',
    [req.params.ocppId, req.user.ufId],
  );
  if (cargador.rowCount === 0) {
    return res.status(404).json({ error: 'Este cargador no esta asignado a tu unidad.' });
  }

  const tarjeta = await pool.query(
    'SELECT id_tag_ocpp FROM tarjetas_rfid WHERE uf_id = $1 AND activa = TRUE LIMIT 1',
    [req.user.ufId],
  );
  if (tarjeta.rowCount === 0) {
    return res.status(403).json({ error: 'No tenes una tarjeta activa asociada a tu unidad.' });
  }

  const activa = await pool.query(
    'SELECT 1 FROM liquidacion_sesiones WHERE cargador_ocpp_id = $1 AND fecha_fin IS NULL',
    [req.params.ocppId],
  );
  if (activa.rowCount > 0) {
    return res.status(409).json({ error: 'Este cargador ya tiene una carga en curso.' });
  }

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
    res.json({ ok: true });
  } catch (err) {
    console.error('Error iniciando carga remota:', err);
    res.status(502).json({ error: 'No se pudo comunicar con el cargador.' });
  }
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
