const express = require('express');
const { pool } = require('../db');
const { authenticate, requireRole } = require('../auth/middleware');

const router = express.Router();
router.use(authenticate, requireRole('superadmin', 'instalador'));

const CITRINEOS_REST_URL = process.env.CITRINEOS_REST_URL || 'http://citrineos-core:8080';

// Picker: list consorcios (no billing fields — instalador can't see those)
router.get('/consorcios', async (_req, res) => {
  const result = await pool.query('SELECT id, nombre FROM consorcios ORDER BY nombre');
  res.json(result.rows);
});

router.get('/consorcios/:id', async (req, res) => {
  const result = await pool.query(
    `SELECT id, nombre, direccion, email_administracion, telefono_contacto,
            limite_amperios_totales, costo_kwh_electricidad
     FROM consorcios WHERE id = $1`,
    [req.params.id],
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Consorcio no encontrado.' });
  res.json(result.rows[0]);
});

router.put('/consorcios/:id', async (req, res) => {
  const { nombre, direccion, telefono_contacto, limite_amperios_totales, costo_kwh_electricidad } = req.body ?? {};
  const result = await pool.query(
    `UPDATE consorcios SET
       nombre = COALESCE($1, nombre),
       direccion = COALESCE($2, direccion),
       telefono_contacto = COALESCE($3, telefono_contacto),
       limite_amperios_totales = COALESCE($4, limite_amperios_totales),
       costo_kwh_electricidad = COALESCE($5, costo_kwh_electricidad)
     WHERE id = $6
     RETURNING id, nombre, direccion, email_administracion, telefono_contacto,
               limite_amperios_totales, costo_kwh_electricidad`,
    [nombre, direccion, telefono_contacto, limite_amperios_totales, costo_kwh_electricidad, req.params.id],
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Consorcio no encontrado.' });
  res.json(result.rows[0]);
});

// Cargadores
router.get('/consorcios/:id/cargadores', async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM cargadores WHERE consorcio_id = $1 ORDER BY etiqueta NULLS LAST, ocpp_id',
    [req.params.id],
  );
  res.json(result.rows);
});

router.post('/consorcios/:id/cargadores', async (req, res) => {
  const { ocpp_id, etiqueta, charge_point_vendor, charge_point_model } = req.body ?? {};
  if (!ocpp_id) {
    return res.status(400).json({ error: 'ocpp_id es requerido.' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO cargadores (ocpp_id, etiqueta, charge_point_vendor, charge_point_model, consorcio_id)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [ocpp_id, etiqueta, charge_point_vendor, charge_point_model, req.params.id],
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: `Ya existe un cargador con ocpp_id "${ocpp_id}".` });
    }
    throw err;
  }
});

router.put('/cargadores/:id', async (req, res) => {
  const { etiqueta, charge_point_vendor, charge_point_model } = req.body ?? {};
  const result = await pool.query(
    `UPDATE cargadores SET
       etiqueta = COALESCE($1, etiqueta),
       charge_point_vendor = COALESCE($2, charge_point_vendor),
       charge_point_model = COALESCE($3, charge_point_model)
     WHERE id = $4 RETURNING *`,
    [etiqueta, charge_point_vendor, charge_point_model, req.params.id],
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Cargador no encontrado.' });
  res.json(result.rows[0]);
});

router.delete('/cargadores/:id', async (req, res) => {
  const result = await pool.query('DELETE FROM cargadores WHERE id = $1', [req.params.id]);
  if (result.rowCount === 0) return res.status(404).json({ error: 'Cargador no encontrado.' });
  res.status(204).end();
});

// Unidades funcionales
router.get('/consorcios/:id/unidades', async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM unidades_funcionales WHERE consorcio_id = $1 ORDER BY numero_departamento',
    [req.params.id],
  );
  res.json(result.rows);
});

router.post('/consorcios/:id/unidades', async (req, res) => {
  const { numero_departamento, numero_cochera, propietario_nombre, propietario_email } = req.body ?? {};
  if (!numero_departamento) {
    return res.status(400).json({ error: 'numero_departamento es requerido.' });
  }
  const result = await pool.query(
    `INSERT INTO unidades_funcionales (consorcio_id, numero_departamento, numero_cochera, propietario_nombre, propietario_email)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [req.params.id, numero_departamento, numero_cochera, propietario_nombre, propietario_email],
  );
  res.status(201).json(result.rows[0]);
});

router.put('/unidades/:id', async (req, res) => {
  const { numero_departamento, numero_cochera, propietario_nombre, propietario_email } = req.body ?? {};
  const result = await pool.query(
    `UPDATE unidades_funcionales SET
       numero_departamento = COALESCE($1, numero_departamento),
       numero_cochera = COALESCE($2, numero_cochera),
       propietario_nombre = COALESCE($3, propietario_nombre),
       propietario_email = COALESCE($4, propietario_email)
     WHERE id = $5 RETURNING *`,
    [numero_departamento, numero_cochera, propietario_nombre, propietario_email, req.params.id],
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Unidad funcional no encontrada.' });
  res.json(result.rows[0]);
});

router.delete('/unidades/:id', async (req, res) => {
  const result = await pool.query('DELETE FROM unidades_funcionales WHERE id = $1', [req.params.id]);
  if (result.rowCount === 0) return res.status(404).json({ error: 'Unidad funcional no encontrada.' });
  res.status(204).end();
});

// Tarjetas RFID / NFC
router.get('/consorcios/:id/tarjetas', async (req, res) => {
  const result = await pool.query(
    `SELECT t.* FROM tarjetas_rfid t
     JOIN unidades_funcionales uf ON uf.id = t.uf_id
     WHERE uf.consorcio_id = $1 ORDER BY t.id`,
    [req.params.id],
  );
  res.json(result.rows);
});

router.post('/consorcios/:id/tarjetas', async (req, res) => {
  const { id_tag_ocpp, uf_id } = req.body ?? {};
  if (!id_tag_ocpp || !uf_id) {
    return res.status(400).json({ error: 'id_tag_ocpp y uf_id son requeridos.' });
  }
  const uf = await pool.query(
    'SELECT id FROM unidades_funcionales WHERE id = $1 AND consorcio_id = $2',
    [uf_id, req.params.id],
  );
  if (uf.rowCount === 0) {
    return res.status(404).json({ error: 'Unidad funcional no encontrada en este consorcio.' });
  }
  try {
    const result = await pool.query(
      'INSERT INTO tarjetas_rfid (id_tag_ocpp, uf_id, activa) VALUES ($1,$2,TRUE) RETURNING *',
      [id_tag_ocpp, uf_id],
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: `Ya existe una tarjeta con id_tag_ocpp "${id_tag_ocpp}".` });
    }
    throw err;
  }
});

router.put('/tarjetas/:id', async (req, res) => {
  const { activa } = req.body ?? {};
  const result = await pool.query(
    'UPDATE tarjetas_rfid SET activa = COALESCE($1, activa) WHERE id = $2 RETURNING *',
    [activa, req.params.id],
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Tarjeta no encontrada.' });
  res.json(result.rows[0]);
});

router.delete('/tarjetas/:id', async (req, res) => {
  const result = await pool.query('DELETE FROM tarjetas_rfid WHERE id = $1', [req.params.id]);
  if (result.rowCount === 0) return res.status(404).json({ error: 'Tarjeta no encontrada.' });
  res.status(204).end();
});

// Balanceo de carga (DLM): pushes a ChargingStationMaxProfile to the station
// via CitrineOS's OCPP 2.0.1 REST bridge, capping its total draw in Amps.
router.post('/cargadores/:ocppId/charging-profile', async (req, res) => {
  const { maxAmps } = req.body ?? {};
  if (!maxAmps || maxAmps <= 0) {
    return res.status(400).json({ error: 'maxAmps debe ser un numero mayor a 0.' });
  }

  const cargador = await pool.query('SELECT id FROM cargadores WHERE ocpp_id = $1', [req.params.ocppId]);
  if (cargador.rowCount === 0) {
    return res.status(404).json({ error: 'Cargador no encontrado.' });
  }

  const profileId = Date.now() % 1000000;
  const url = `${CITRINEOS_REST_URL}/ocpp/2.0.1/smartcharging/setChargingProfile?identifier=${encodeURIComponent(req.params.ocppId)}&tenantId=1`;
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
    const citrineRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await citrineRes.json();
    const confirmation = Array.isArray(data) ? data[0] : data;
    if (!confirmation?.success) {
      return res.status(502).json({ error: 'CitrineOS rechazo el perfil de carga.', detail: confirmation });
    }
    res.json({ ok: true, maxAmps, confirmation });
  } catch (err) {
    console.error('Error enviando charging profile a CitrineOS:', err);
    res.status(502).json({ error: 'No se pudo comunicar con CitrineOS.' });
  }
});

module.exports = router;
