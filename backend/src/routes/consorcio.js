const express = require('express');
const { pool } = require('../db');
const { authenticate, requireRole } = require('../auth/middleware');

const router = express.Router();
router.use(authenticate, requireRole('consorcio_admin'));

function liquidacionesQuery(periodo) {
  return {
    text: `SELECT l.id, l.transaction_id_ocpp, l.cargador_ocpp_id, l.fecha_inicio, l.fecha_fin,
                  l.kwh_consumidos, l.precio_kwh_aplicado, l.monto_total_expensa,
                  l.liquidado_en_expensas, l.periodo_expensa,
                  uf.numero_departamento, uf.numero_cochera, uf.propietario_nombre
           FROM liquidacion_sesiones l
           LEFT JOIN unidades_funcionales uf ON uf.id = l.uf_id
           WHERE l.consorcio_id = $1 ${periodo ? 'AND l.periodo_expensa = $2' : ''}
           ORDER BY l.fecha_inicio DESC`,
    values: periodo ? [null, periodo] : [null], // consorcioId filled in per-call
  };
}

router.get('/liquidaciones', async (req, res) => {
  const { periodo } = req.query;
  const q = liquidacionesQuery(periodo);
  q.values[0] = req.user.consorcioId;
  const result = await pool.query(q.text, q.values);
  res.json(result.rows);
});

router.get('/liquidaciones/export', async (req, res) => {
  const { periodo } = req.query;
  const q = liquidacionesQuery(periodo);
  q.values[0] = req.user.consorcioId;
  const result = await pool.query(q.text, q.values);

  const header = 'transaction_id,cargador,fecha_inicio,fecha_fin,kwh,precio_kwh,monto,depto,cochera,propietario\n';
  const rows = result.rows.map((r) =>
    [
      r.transaction_id_ocpp, r.cargador_ocpp_id, r.fecha_inicio, r.fecha_fin,
      r.kwh_consumidos, r.precio_kwh_aplicado, r.monto_total_expensa,
      r.numero_departamento ?? '', r.numero_cochera ?? '', r.propietario_nombre ?? '',
    ].join(','),
  );
  const csv = header + rows.join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="liquidacion_${periodo ?? 'todas'}.csv"`);
  res.send(csv);
});

router.get('/cargadores', async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM cargadores WHERE consorcio_id = $1 ORDER BY ocpp_id',
    [req.user.consorcioId],
  );
  res.json(result.rows);
});

router.get('/unidades', async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM unidades_funcionales WHERE consorcio_id = $1 ORDER BY numero_departamento',
    [req.user.consorcioId],
  );
  res.json(result.rows);
});

router.get('/tarjetas', async (req, res) => {
  const result = await pool.query(
    `SELECT t.id, t.id_tag_ocpp, t.activa, uf.numero_departamento, uf.propietario_nombre,
            ca.ocpp_id AS cargador_ocpp_id, ca.etiqueta AS cargador_etiqueta
     FROM tarjetas_rfid t
     JOIN unidades_funcionales uf ON uf.id = t.uf_id
     LEFT JOIN cargadores ca ON ca.id = t.cargador_id
     WHERE uf.consorcio_id = $1
     ORDER BY uf.numero_departamento`,
    [req.user.consorcioId],
  );
  res.json(result.rows);
});

router.get('/live', async (req, res) => {
  const consorcioId = req.user.consorcioId;
  const [cargadores, activos, lecturas, acumulados] = await Promise.all([
    pool.query('SELECT id, ocpp_id, etiqueta FROM cargadores WHERE consorcio_id = $1', [consorcioId]),
    pool.query(
      'SELECT cargador_ocpp_id, transaction_id_ocpp FROM liquidacion_sesiones WHERE consorcio_id = $1 AND fecha_fin IS NULL',
      [consorcioId],
    ),
    pool.query(
      `SELECT cargador_ocpp_id, "timestamp", kwh_acumulado, potencia_kw
       FROM lecturas_medidor
       WHERE consorcio_id = $1 AND "timestamp" > NOW() - INTERVAL '30 minutes'
       ORDER BY "timestamp" ASC`,
      [consorcioId],
    ),
    pool.query(
      `SELECT cargador_ocpp_id,
              COALESCE(SUM(kwh_consumidos) FILTER (WHERE fecha_inicio >= date_trunc('day', NOW())), 0) AS kwh_hoy,
              COALESCE(SUM(kwh_consumidos) FILTER (WHERE fecha_inicio >= date_trunc('week', NOW())), 0) AS kwh_semana,
              COALESCE(SUM(kwh_consumidos) FILTER (WHERE fecha_inicio >= date_trunc('month', NOW())), 0) AS kwh_mes
       FROM liquidacion_sesiones
       WHERE consorcio_id = $1
       GROUP BY cargador_ocpp_id`,
      [consorcioId],
    ),
  ]);

  const activeByOcpp = new Map(activos.rows.map((r) => [r.cargador_ocpp_id, r.transaction_id_ocpp]));
  const readingsByOcpp = new Map();
  for (const r of lecturas.rows) {
    if (!readingsByOcpp.has(r.cargador_ocpp_id)) readingsByOcpp.set(r.cargador_ocpp_id, []);
    readingsByOcpp.get(r.cargador_ocpp_id).push(r);
  }
  const acumuladosByOcpp = new Map(acumulados.rows.map((r) => [r.cargador_ocpp_id, r]));

  res.json(
    cargadores.rows.map((c) => {
      const readings = readingsByOcpp.get(c.ocpp_id) ?? [];
      const activo = activeByOcpp.has(c.ocpp_id);
      const last = readings[readings.length - 1];
      const acum = acumuladosByOcpp.get(c.ocpp_id);
      return {
        ocpp_id: c.ocpp_id,
        etiqueta: c.etiqueta,
        activo,
        transaction_id_ocpp: activeByOcpp.get(c.ocpp_id) ?? null,
        potencia_actual_kw: activo ? (last?.potencia_kw ?? null) : null,
        readings,
        kwh_hoy: Number(acum?.kwh_hoy ?? 0),
        kwh_semana: Number(acum?.kwh_semana ?? 0),
        kwh_mes: Number(acum?.kwh_mes ?? 0),
      };
    }),
  );
});

router.post('/tarjetas', async (req, res) => {
  const { id_tag_ocpp, uf_id } = req.body ?? {};
  if (!id_tag_ocpp || !uf_id) {
    return res.status(400).json({ error: 'id_tag_ocpp y uf_id son requeridos.' });
  }
  // Verify the uf belongs to this consorcio before linking a card to it.
  const uf = await pool.query(
    'SELECT id FROM unidades_funcionales WHERE id = $1 AND consorcio_id = $2',
    [uf_id, req.user.consorcioId],
  );
  if (uf.rowCount === 0) {
    return res.status(404).json({ error: 'Unidad funcional no encontrada en este consorcio.' });
  }
  const result = await pool.query(
    'INSERT INTO tarjetas_rfid (id_tag_ocpp, uf_id, activa) VALUES ($1,$2,TRUE) RETURNING *',
    [id_tag_ocpp, uf_id],
  );
  res.status(201).json(result.rows[0]);
});

router.put('/tarjetas/:id', async (req, res) => {
  const { activa } = req.body ?? {};
  const result = await pool.query(
    `UPDATE tarjetas_rfid t SET activa = COALESCE($1, t.activa)
     FROM unidades_funcionales uf
     WHERE t.id = $2 AND uf.id = t.uf_id AND uf.consorcio_id = $3
     RETURNING t.*`,
    [activa, req.params.id, req.user.consorcioId],
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Tarjeta no encontrada en este consorcio.' });
  res.json(result.rows[0]);
});

module.exports = router;
