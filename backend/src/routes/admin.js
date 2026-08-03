const express = require('express');
const crypto = require('crypto');
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
    `SELECT c.*, uf.numero_departamento AS uf_numero_departamento, uf.numero_cochera AS uf_numero_cochera,
            s.nombre AS sector_nombre
     FROM cargadores c
     LEFT JOIN unidades_funcionales uf ON uf.id = c.uf_id
     LEFT JOIN sectores s ON s.id = c.sector_id
     WHERE c.consorcio_id = $1
     ORDER BY c.etiqueta NULLS LAST, c.ocpp_id`,
    [req.params.id],
  );
  res.json(result.rows);
});

router.post('/consorcios/:id/cargadores', async (req, res) => {
  const { ocpp_id, etiqueta, charge_point_vendor, charge_point_model, uf_id, sector_id } = req.body ?? {};
  if (!ocpp_id) {
    return res.status(400).json({ error: 'ocpp_id es requerido.' });
  }
  if (uf_id) {
    const uf = await pool.query(
      'SELECT id FROM unidades_funcionales WHERE id = $1 AND consorcio_id = $2',
      [uf_id, req.params.id],
    );
    if (uf.rowCount === 0) {
      return res.status(404).json({ error: 'Unidad funcional no encontrada en este consorcio.' });
    }
  }
  if (sector_id) {
    const sector = await pool.query(
      'SELECT id FROM sectores WHERE id = $1 AND consorcio_id = $2',
      [sector_id, req.params.id],
    );
    if (sector.rowCount === 0) {
      return res.status(404).json({ error: 'Sector no encontrado en este consorcio.' });
    }
  }
  try {
    const result = await pool.query(
      `INSERT INTO cargadores (ocpp_id, etiqueta, charge_point_vendor, charge_point_model, consorcio_id, uf_id, sector_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [ocpp_id, etiqueta, charge_point_vendor, charge_point_model, req.params.id, uf_id ?? null, sector_id ?? null],
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
  const { etiqueta, charge_point_vendor, charge_point_model, uf_id, sector_id } = req.body ?? {};
  let consorcioId = null;
  if (uf_id || sector_id) {
    const cargador = await pool.query('SELECT consorcio_id FROM cargadores WHERE id = $1', [req.params.id]);
    if (cargador.rowCount === 0) return res.status(404).json({ error: 'Cargador no encontrado.' });
    consorcioId = cargador.rows[0].consorcio_id;
  }
  if (uf_id) {
    const uf = await pool.query(
      'SELECT id FROM unidades_funcionales WHERE id = $1 AND consorcio_id = $2',
      [uf_id, consorcioId],
    );
    if (uf.rowCount === 0) {
      return res.status(404).json({ error: 'Unidad funcional no encontrada en este consorcio.' });
    }
  }
  if (sector_id) {
    const sector = await pool.query(
      'SELECT id FROM sectores WHERE id = $1 AND consorcio_id = $2',
      [sector_id, consorcioId],
    );
    if (sector.rowCount === 0) {
      return res.status(404).json({ error: 'Sector no encontrado en este consorcio.' });
    }
  }
  const result = await pool.query(
    `UPDATE cargadores SET
       etiqueta = COALESCE($1, etiqueta),
       charge_point_vendor = COALESCE($2, charge_point_vendor),
       charge_point_model = COALESCE($3, charge_point_model),
       uf_id = CASE WHEN $4 THEN $5::int ELSE uf_id END,
       sector_id = CASE WHEN $6 THEN $7::int ELSE sector_id END
     WHERE id = $8 RETURNING *`,
    [etiqueta ?? null, charge_point_vendor ?? null, charge_point_model ?? null,
      'uf_id' in (req.body ?? {}), uf_id ?? null,
      'sector_id' in (req.body ?? {}), sector_id ?? null, req.params.id],
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Cargador no encontrado.' });
  res.json(result.rows[0]);
});

router.delete('/cargadores/:id', async (req, res) => {
  const result = await pool.query('DELETE FROM cargadores WHERE id = $1', [req.params.id]);
  if (result.rowCount === 0) return res.status(404).json({ error: 'Cargador no encontrado.' });
  res.status(204).end();
});

// Sectores (pisos/subsuelos con circuito y balanceo independiente)
router.get('/consorcios/:id/sectores', async (req, res) => {
  const result = await pool.query(
    `SELECT s.*, lu.amps_l1, lu.amps_l2, lu.amps_l3, lu.potencia_kw, lu."timestamp" AS ultima_lectura_en
     FROM sectores s
     LEFT JOIN LATERAL (
       SELECT amps_l1, amps_l2, amps_l3, potencia_kw, "timestamp"
       FROM lecturas_sector ls WHERE ls.sector_id = s.id
       ORDER BY ls."timestamp" DESC LIMIT 1
     ) lu ON TRUE
     WHERE s.consorcio_id = $1 ORDER BY s.nombre`,
    [req.params.id],
  );
  res.json(result.rows);
});

router.post('/consorcios/:id/sectores', async (req, res) => {
  const { nombre, limite_amperios_totales } = req.body ?? {};
  if (!nombre) {
    return res.status(400).json({ error: 'nombre es requerido.' });
  }
  const apiKey = crypto.randomBytes(24).toString('hex');
  const result = await pool.query(
    'INSERT INTO sectores (consorcio_id, nombre, limite_amperios_totales, medidor_api_key) VALUES ($1,$2,$3,$4) RETURNING *',
    [req.params.id, nombre, limite_amperios_totales ?? null, apiKey],
  );
  res.status(201).json(result.rows[0]);
});

router.put('/sectores/:id', async (req, res) => {
  const { nombre, limite_amperios_totales, usar_medidor_dinamico } = req.body ?? {};
  const result = await pool.query(
    `UPDATE sectores SET
       nombre = COALESCE($1, nombre),
       limite_amperios_totales = COALESCE($2, limite_amperios_totales),
       usar_medidor_dinamico = COALESCE($3, usar_medidor_dinamico)
     WHERE id = $4 RETURNING *`,
    [nombre ?? null, limite_amperios_totales ?? null, usar_medidor_dinamico ?? null, req.params.id],
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Sector no encontrado.' });
  res.json(result.rows[0]);
});

router.delete('/sectores/:id', async (req, res) => {
  const result = await pool.query('DELETE FROM sectores WHERE id = $1', [req.params.id]);
  if (result.rowCount === 0) return res.status(404).json({ error: 'Sector no encontrado.' });
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
  const { numero_departamento, numero_cochera, propietario_nombre, propietario_email, telefono_propietario } = req.body ?? {};
  if (!numero_departamento) {
    return res.status(400).json({ error: 'numero_departamento es requerido.' });
  }
  const result = await pool.query(
    `INSERT INTO unidades_funcionales (consorcio_id, numero_departamento, numero_cochera, propietario_nombre, propietario_email, telefono_propietario)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [req.params.id, numero_departamento, numero_cochera, propietario_nombre, propietario_email, telefono_propietario ?? null],
  );
  res.status(201).json(result.rows[0]);
});

router.put('/unidades/:id', async (req, res) => {
  const { numero_departamento, numero_cochera, propietario_nombre, propietario_email, telefono_propietario } = req.body ?? {};
  const result = await pool.query(
    `UPDATE unidades_funcionales SET
       numero_departamento = COALESCE($1, numero_departamento),
       numero_cochera = COALESCE($2, numero_cochera),
       propietario_nombre = COALESCE($3, propietario_nombre),
       propietario_email = COALESCE($4, propietario_email),
       telefono_propietario = COALESCE($5, telefono_propietario)
     WHERE id = $6 RETURNING *`,
    [numero_departamento, numero_cochera, propietario_nombre, propietario_email, telefono_propietario, req.params.id],
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
    `SELECT t.*, ca.ocpp_id AS cargador_ocpp_id, ca.etiqueta AS cargador_etiqueta
     FROM tarjetas_rfid t
     JOIN unidades_funcionales uf ON uf.id = t.uf_id
     LEFT JOIN cargadores ca ON ca.id = t.cargador_id
     WHERE uf.consorcio_id = $1 ORDER BY t.id`,
    [req.params.id],
  );
  res.json(result.rows);
});

router.post('/consorcios/:id/tarjetas', async (req, res) => {
  const { id_tag_ocpp, uf_id, cargador_id } = req.body ?? {};
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
  if (cargador_id) {
    const cargador = await pool.query(
      'SELECT id FROM cargadores WHERE id = $1 AND consorcio_id = $2',
      [cargador_id, req.params.id],
    );
    if (cargador.rowCount === 0) {
      return res.status(404).json({ error: 'Cargador no encontrado en este consorcio.' });
    }
  }
  try {
    const result = await pool.query(
      'INSERT INTO tarjetas_rfid (id_tag_ocpp, uf_id, cargador_id, activa) VALUES ($1,$2,$3,TRUE) RETURNING *',
      [id_tag_ocpp, uf_id, cargador_id ?? null],
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
  const { activa, cargador_id } = req.body ?? {};
  const hasCargadorId = 'cargador_id' in (req.body ?? {});
  const result = await pool.query(
    `UPDATE tarjetas_rfid SET
       activa = COALESCE($1, activa),
       cargador_id = CASE WHEN $2 THEN $3::int ELSE cargador_id END
     WHERE id = $4 RETURNING *`,
    [activa ?? null, hasCargadorId, cargador_id ?? null, req.params.id],
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Tarjeta no encontrada.' });
  res.json(result.rows[0]);
});

router.delete('/tarjetas/:id', async (req, res) => {
  const result = await pool.query('DELETE FROM tarjetas_rfid WHERE id = $1', [req.params.id]);
  if (result.rowCount === 0) return res.status(404).json({ error: 'Tarjeta no encontrada.' });
  res.status(204).end();
});

// Consumo en tiempo real: lecturas de los ultimos 30 min por cargador, mas
// si tiene una sesion de carga activa en este momento.
router.get('/consorcios/:id/live', async (req, res) => {
  const [cargadores, activos, lecturas, acumulados] = await Promise.all([
    pool.query('SELECT id, ocpp_id, etiqueta FROM cargadores WHERE consorcio_id = $1', [req.params.id]),
    pool.query(
      'SELECT cargador_ocpp_id, transaction_id_ocpp, fecha_inicio FROM liquidacion_sesiones WHERE consorcio_id = $1 AND fecha_fin IS NULL',
      [req.params.id],
    ),
    pool.query(
      `SELECT cargador_ocpp_id, "timestamp", kwh_acumulado, potencia_kw
       FROM lecturas_medidor
       WHERE consorcio_id = $1 AND "timestamp" > NOW() - INTERVAL '30 minutes'
       ORDER BY "timestamp" ASC`,
      [req.params.id],
    ),
    pool.query(
      // Completed sessions contribute their final kwh_consumidos; sessions
      // still open contribute their in-progress delta (latest reading minus
      // the reading at Started) so an ongoing charge isn't invisible to the
      // daily/weekly/monthly totals until it ends.
      `WITH activas AS (
         SELECT cargador_ocpp_id, transaction_id_ocpp, fecha_inicio
         FROM liquidacion_sesiones
         WHERE consorcio_id = $1 AND fecha_fin IS NULL
       ),
       en_curso AS (
         SELECT a.cargador_ocpp_id, a.fecha_inicio,
                COALESCE(
                  (SELECT lm.kwh_acumulado FROM lecturas_medidor lm
                   WHERE lm.transaction_id_ocpp = a.transaction_id_ocpp
                   ORDER BY lm."timestamp" DESC LIMIT 1) -
                  (SELECT lm.kwh_acumulado FROM lecturas_medidor lm
                   WHERE lm.transaction_id_ocpp = a.transaction_id_ocpp
                   ORDER BY lm."timestamp" ASC LIMIT 1),
                  0
                ) AS kwh_en_curso
         FROM activas a
       ),
       completadas AS (
         SELECT cargador_ocpp_id,
                COALESCE(SUM(kwh_consumidos) FILTER (WHERE fecha_inicio >= date_trunc('day', NOW())), 0) AS kwh_hoy,
                COALESCE(SUM(kwh_consumidos) FILTER (WHERE fecha_inicio >= date_trunc('week', NOW())), 0) AS kwh_semana,
                COALESCE(SUM(kwh_consumidos) FILTER (WHERE fecha_inicio >= date_trunc('month', NOW())), 0) AS kwh_mes
         FROM liquidacion_sesiones
         WHERE consorcio_id = $1
         GROUP BY cargador_ocpp_id
       )
       SELECT
         COALESCE(c.cargador_ocpp_id, e.cargador_ocpp_id) AS cargador_ocpp_id,
         COALESCE(c.kwh_hoy, 0) + CASE WHEN e.fecha_inicio >= date_trunc('day', NOW()) THEN e.kwh_en_curso ELSE 0 END AS kwh_hoy,
         COALESCE(c.kwh_semana, 0) + CASE WHEN e.fecha_inicio >= date_trunc('week', NOW()) THEN e.kwh_en_curso ELSE 0 END AS kwh_semana,
         COALESCE(c.kwh_mes, 0) + CASE WHEN e.fecha_inicio >= date_trunc('month', NOW()) THEN e.kwh_en_curso ELSE 0 END AS kwh_mes
       FROM completadas c
       FULL OUTER JOIN en_curso e ON e.cargador_ocpp_id = c.cargador_ocpp_id`,
      [req.params.id],
    ),
  ]);

  const activeByOcpp = new Map(activos.rows.map((r) => [r.cargador_ocpp_id, r]));
  const readingsByOcpp = new Map();
  for (const r of lecturas.rows) {
    if (!readingsByOcpp.has(r.cargador_ocpp_id)) readingsByOcpp.set(r.cargador_ocpp_id, []);
    readingsByOcpp.get(r.cargador_ocpp_id).push(r);
  }
  const acumuladosByOcpp = new Map(acumulados.rows.map((r) => [r.cargador_ocpp_id, r]));

  res.json(
    cargadores.rows.map((c) => {
      const readings = readingsByOcpp.get(c.ocpp_id) ?? [];
      const activa = activeByOcpp.get(c.ocpp_id);
      const activo = activa != null;
      const last = readings[readings.length - 1];
      const acum = acumuladosByOcpp.get(c.ocpp_id);
      return {
        ocpp_id: c.ocpp_id,
        etiqueta: c.etiqueta,
        activo,
        transaction_id_ocpp: activa?.transaction_id_ocpp ?? null,
        conectado_desde: activa?.fecha_inicio ?? null,
        potencia_actual_kw: activo ? (last?.potencia_kw ?? null) : null,
        readings,
        kwh_hoy: Number(acum?.kwh_hoy ?? 0),
        kwh_semana: Number(acum?.kwh_semana ?? 0),
        kwh_mes: Number(acum?.kwh_mes ?? 0),
      };
    }),
  );
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
