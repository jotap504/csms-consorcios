const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const { authenticate, requireRole } = require('../auth/middleware');
const { generateToken } = require('../lib/tokens');
const { sendMail } = require('../lib/mailer');

const router = express.Router();
router.use(authenticate, requireRole('superadmin'));
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://192.168.1.38';
const INVITE_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

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

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const consorcioResult = await client.query(
      `INSERT INTO consorcios
        (nombre, cuit_razon_social, direccion, email_administracion, telefono_contacto,
         plan_id, limite_amperios_totales, costo_kwh_electricidad, dia_vencimiento_abono)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [nombre, cuit_razon_social, direccion, email_administracion, telefono_contacto,
        plan_id, limite_amperios_totales, costo_kwh_electricidad, dia_vencimiento_abono ?? 1],
    );
    const consorcio = consorcioResult.rows[0];

    // The consorcio's admin login is the email given at creation. No password
    // is set yet — an invite token lets them choose one via the same
    // reset-password flow used for "forgot my password".
    const inviteToken = generateToken();
    const inviteExpires = new Date(Date.now() + INVITE_TOKEN_TTL_MS);
    await client.query(
      `INSERT INTO usuarios (email, rol, consorcio_id, reset_token, reset_token_expires)
       VALUES ($1, 'consorcio_admin', $2, $3, $4)
       ON CONFLICT (email) DO NOTHING`,
      [email_administracion, consorcio.id, inviteToken, inviteExpires],
    );

    await client.query('COMMIT');

    await sendMail({
      to: email_administracion,
      subject: `Bienvenido a CSMS - ${nombre}`,
      html: `<p>Se creo una cuenta de administrador de consorcio para ${nombre}.</p>
             <p>Elegi tu contrasena para empezar (link valido 7 dias):</p>
             <p><a href="${FRONTEND_URL}/reset-password?token=${inviteToken}">${FRONTEND_URL}/reset-password?token=${inviteToken}</a></p>`,
    });

    res.status(201).json(consorcio);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error creando consorcio:', err);
    res.status(500).json({ error: 'No se pudo crear el consorcio.' });
  } finally {
    client.release();
  }
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

// Vista global de cargadores: config nuestra + config que el equipo reporto al
// bootear (CitrineOS."ChargingStations", NO lo que se tipeo a mano al crearlo)
// + estado en vivo (CitrineOS."ChargingStations".isOnline/latestOcppMessageTimestamp
// es la fuente mas confiable de "esta conectado ahora", cargador_estado_actual
// es nuestra copia de la ultima StatusNotification/balanceo).
router.get('/cargadores', async (_req, res) => {
  const result = await pool.query(
    `SELECT ca.id, ca.ocpp_id, ca.etiqueta, ca.ocpp_version,
            ca.charge_point_vendor AS vendor_configurado, ca.charge_point_model AS modelo_configurado,
            co.id AS consorcio_id, co.nombre AS consorcio_nombre,
            se.nombre AS sector_nombre,
            cs."isOnline" AS conectado_citrineos, cs."chargePointVendor" AS vendor_reportado,
            cs."chargePointModel" AS modelo_reportado, cs."firmwareVersion" AS firmware_reportado,
            cs."protocol" AS protocolo_negociado, cs."latestOcppMessageTimestamp" AS ultimo_mensaje,
            ce.conectado AS conector_ocupado, ce.status_ocpp, ce.amps_asignados, ce.en_cola, ce.updated_at AS estado_actualizado,
            EXISTS (
              SELECT 1 FROM liquidacion_sesiones l
              WHERE l.cargador_ocpp_id = ca.ocpp_id AND l.fecha_fin IS NULL
            ) AS activo
     FROM cargadores ca
     JOIN consorcios co ON co.id = ca.consorcio_id
     LEFT JOIN sectores se ON se.id = ca.sector_id
     LEFT JOIN "ChargingStations" cs ON cs.id = ca.ocpp_id
     LEFT JOIN cargador_estado_actual ce ON ce.cargador_ocpp_id = ca.ocpp_id
     ORDER BY co.nombre, ca.ocpp_id`,
  );
  res.json(result.rows);
});

router.get('/planes', async (_req, res) => {
  const result = await pool.query('SELECT * FROM planes_suscripcion ORDER BY precio_mensual_usd');
  res.json(result.rows);
});

// ABM de proveedores (fabricantes de wallbox probando su equipo)
router.get('/proveedores', async (_req, res) => {
  const result = await pool.query(
    `SELECT p.id, p.nombre_empresa, p.email_contacto, p.activo, p.creado_en,
            COUNT(DISTINCT pc.id) AS cargadores_emparejados,
            COUNT(DISTINCT pt.id) FILTER (WHERE pt.creado_en > NOW() - INTERVAL '7 days') AS tests_ultimos_7d
     FROM proveedores p
     LEFT JOIN proveedor_cargadores pc ON pc.proveedor_id = p.id
     LEFT JOIN proveedor_tests pt ON pt.proveedor_id = p.id
     GROUP BY p.id
     ORDER BY p.nombre_empresa`,
  );
  res.json(result.rows);
});

router.post('/proveedores', async (req, res) => {
  const { nombre_empresa, email_contacto, password } = req.body ?? {};
  if (!nombre_empresa || !email_contacto || !password) {
    return res.status(400).json({ error: 'nombre_empresa, email_contacto y password son requeridos.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'La contrasena debe tener al menos 8 caracteres.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const proveedorResult = await client.query(
      'INSERT INTO proveedores (nombre_empresa, email_contacto) VALUES ($1, $2) RETURNING *',
      [nombre_empresa, email_contacto],
    );
    const proveedor = proveedorResult.rows[0];

    const passwordHash = await bcrypt.hash(password, 10);
    await client.query(
      `INSERT INTO usuarios (email, rol, proveedor_id, password_hash)
       VALUES ($1, 'proveedor', $2, $3)
       ON CONFLICT (email) DO UPDATE SET password_hash = $3, proveedor_id = $2, rol = 'proveedor'`,
      [email_contacto, proveedor.id, passwordHash],
    );

    await client.query('COMMIT');
    res.status(201).json(proveedor);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error creando proveedor:', err);
    res.status(500).json({ error: 'No se pudo crear el proveedor.' });
  } finally {
    client.release();
  }
});

router.put('/proveedores/:id', async (req, res) => {
  const { nombre_empresa, email_contacto, activo } = req.body ?? {};
  const result = await pool.query(
    `UPDATE proveedores SET
      nombre_empresa = COALESCE($1, nombre_empresa),
      email_contacto = COALESCE($2, email_contacto),
      activo = COALESCE($3, activo)
     WHERE id = $4 RETURNING *`,
    [nombre_empresa, email_contacto, activo, req.params.id],
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Proveedor no encontrado.' });
  res.json(result.rows[0]);
});

router.get('/proveedores/:id/cargadores', async (req, res) => {
  const result = await pool.query(
    `SELECT pc.id, pc.ocpp_id, pc.ocpp_version, pc.etiqueta, pc.creado_en,
            cs."isOnline" AS conectado_citrineos, cs."chargePointVendor" AS vendor_reportado,
            cs."chargePointModel" AS modelo_reportado, cs."latestOcppMessageTimestamp" AS ultimo_mensaje
     FROM proveedor_cargadores pc
     LEFT JOIN "ChargingStations" cs ON cs.id = pc.ocpp_id
     WHERE pc.proveedor_id = $1
     ORDER BY pc.creado_en DESC`,
    [req.params.id],
  );
  res.json(result.rows);
});

router.get('/proveedores/:id/tests', async (req, res) => {
  const result = await pool.query(
    `SELECT pt.id, pt.cargador_ocpp_id, pt.accion, pt.resultado, pt.detalle, pt.creado_en, u.email AS usuario_email
     FROM proveedor_tests pt
     LEFT JOIN usuarios u ON u.id = pt.usuario_id
     WHERE pt.proveedor_id = $1
     ORDER BY pt.creado_en DESC LIMIT 200`,
    [req.params.id],
  );
  res.json(result.rows);
});

module.exports = router;
