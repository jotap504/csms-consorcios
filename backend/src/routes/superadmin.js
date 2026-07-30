const express = require('express');
const { pool } = require('../db');
const { authenticate, requireRole } = require('../auth/middleware');

const router = express.Router();
router.use(authenticate, requireRole('superadmin'));

// ABM de consorcios
router.get('/consorcios', async (_req, res) => {
  const result = await pool.query(
    `SELECT c.id, c.nombre, c.cuit_razon_social, c.email_administracion, c.estado_suscripcion,
            c.dia_vencimiento_abono, c.costo_kwh_electricidad, c.fecha_alta,
            p.nombre AS plan_nombre, p.precio_mensual_usd
     FROM consorcios c
     LEFT JOIN planes_suscripcion p ON p.id = c.plan_id
     ORDER BY c.nombre`,
  );
  res.json(result.rows);
});

router.post('/consorcios', async (req, res) => {
  const {
    nombre, cuit_razon_social, direccion, email_administracion, telefono_contacto,
    plan_id, limite_amperios_totales, costo_kwh_electricidad, dia_vencimiento_abono,
  } = req.body ?? {};
  if (!nombre || !email_administracion || costo_kwh_electricidad == null) {
    return res.status(400).json({ error: 'nombre, email_administracion y costo_kwh_electricidad son requeridos.' });
  }
  const result = await pool.query(
    `INSERT INTO consorcios
      (nombre, cuit_razon_social, direccion, email_administracion, telefono_contacto,
       plan_id, limite_amperios_totales, costo_kwh_electricidad, dia_vencimiento_abono)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [nombre, cuit_razon_social, direccion, email_administracion, telefono_contacto,
      plan_id, limite_amperios_totales, costo_kwh_electricidad, dia_vencimiento_abono ?? 1],
  );
  res.status(201).json(result.rows[0]);
});

router.put('/consorcios/:id', async (req, res) => {
  const { id } = req.params;
  const {
    nombre, cuit_razon_social, direccion, email_administracion, telefono_contacto,
    plan_id, estado_suscripcion, limite_amperios_totales, costo_kwh_electricidad, dia_vencimiento_abono,
  } = req.body ?? {};
  const result = await pool.query(
    `UPDATE consorcios SET
      nombre = COALESCE($1, nombre),
      cuit_razon_social = COALESCE($2, cuit_razon_social),
      direccion = COALESCE($3, direccion),
      email_administracion = COALESCE($4, email_administracion),
      telefono_contacto = COALESCE($5, telefono_contacto),
      plan_id = COALESCE($6, plan_id),
      estado_suscripcion = COALESCE($7, estado_suscripcion),
      limite_amperios_totales = COALESCE($8, limite_amperios_totales),
      costo_kwh_electricidad = COALESCE($9, costo_kwh_electricidad),
      dia_vencimiento_abono = COALESCE($10, dia_vencimiento_abono)
     WHERE id = $11 RETURNING *`,
    [nombre, cuit_razon_social, direccion, email_administracion, telefono_contacto,
      plan_id, estado_suscripcion, limite_amperios_totales, costo_kwh_electricidad, dia_vencimiento_abono, id],
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Consorcio no encontrado.' });
  res.json(result.rows[0]);
});

// Estado de abonos
router.get('/consorcios/:id/pagos', async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM pagos_abono_sistema WHERE consorcio_id = $1 ORDER BY periodo DESC',
    [req.params.id],
  );
  res.json(result.rows);
});

router.post('/consorcios/:id/pagos', async (req, res) => {
  const { periodo, monto_abonado, comprobante_ref } = req.body ?? {};
  if (!periodo || monto_abonado == null) {
    return res.status(400).json({ error: 'periodo y monto_abonado son requeridos.' });
  }
  const result = await pool.query(
    `INSERT INTO pagos_abono_sistema (consorcio_id, periodo, monto_abonado, comprobante_ref)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [req.params.id, periodo, monto_abonado, comprobante_ref],
  );
  res.status(201).json(result.rows[0]);
});

// Vista global de cargadores
router.get('/cargadores', async (_req, res) => {
  const result = await pool.query(
    `SELECT ca.id, ca.ocpp_id, ca.charge_point_vendor, ca.charge_point_model,
            ca.estado_online, ca.ultimo_heartbeat, co.id AS consorcio_id, co.nombre AS consorcio_nombre
     FROM cargadores ca
     JOIN consorcios co ON co.id = ca.consorcio_id
     ORDER BY co.nombre, ca.ocpp_id`,
  );
  res.json(result.rows);
});

router.get('/planes', async (_req, res) => {
  const result = await pool.query('SELECT * FROM planes_suscripcion ORDER BY precio_mensual_usd');
  res.json(result.rows);
});

module.exports = router;
