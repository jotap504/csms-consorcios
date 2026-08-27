const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const { authenticate, requireRole, requirePermission } = require('../auth/middleware');
const { reloadPermissionsCache } = require('../auth/permissions');
const { generateToken } = require('../lib/tokens');
const { sendMail } = require('../lib/mailer');

const router = express.Router();
router.use(authenticate, requirePermission('superadmin_panel'));
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://192.168.1.38';
const INVITE_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

// RBAC real: matriz rol x permiso para la pantalla Permission. requireRole
// ('superadmin') explicito aca (redundante con el bypass de superadmin en
// requirePermission, a proposito) - segunda capa de defensa para que ningun
// futuro cambio al bypass pueda dejar a todos los superadmin afuera de esta
// misma pantalla (ver plan RBAC).
const ROLES_RBAC = ['superadmin', 'instalador', 'comercial', 'consorcio_admin', 'proveedor', 'residente'];

router.get('/permisos', requireRole('superadmin'), async (_req, res) => {
  const [permisos, rolPermisos] = await Promise.all([
    pool.query('SELECT id, clave, descripcion FROM permisos ORDER BY id'),
    pool.query('SELECT rol, permiso_id FROM rol_permisos'),
  ]);
  res.json({ roles: ROLES_RBAC, permisos: permisos.rows, rolPermisos: rolPermisos.rows });
});

router.put('/permisos', requireRole('superadmin'), async (req, res) => {
  const { rol, clave, activo } = req.body ?? {};
  if (!ROLES_RBAC.includes(rol) || !clave || typeof activo !== 'boolean') {
    return res.status(400).json({ error: 'rol, clave y activo (boolean) son requeridos.' });
  }
  // superadmin nunca consulta rol_permisos (bypass estructural en el
  // middleware) - sus filas son solo para que la UI lo muestre marcado,
  // editarlas no cambiaria nada real. Se bloquea para no confundir.
  if (rol === 'superadmin') {
    return res.status(400).json({ error: 'superadmin tiene acceso total fijo, no es editable.' });
  }
  if (activo) {
    await pool.query(
      `INSERT INTO rol_permisos (rol, permiso_id)
       SELECT $1, id FROM permisos WHERE clave = $2
       ON CONFLICT (rol, permiso_id) DO NOTHING`,
      [rol, clave],
    );
  } else {
    await pool.query(
      `DELETE FROM rol_permisos WHERE rol = $1 AND permiso_id = (SELECT id FROM permisos WHERE clave = $2)`,
      [rol, clave],
    );
  }
  await reloadPermissionsCache();
  res.json({ ok: true });
});

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
// Pagina dedicada de alarmas (equivalente a "Real-time Alarm" / tab
// "Station" de GRASEN) - historial global filtrable, a diferencia del
// feed de 10 del dashboard (/resumen-vivo) que es solo un resumen.
// No hay tab "Module Fault" - no reportamos fallas de submodulo de
// hardware via OCPP, solo StatusNotification=Faulted (cargador_alarmas).
router.get('/alarmas', async (req, res) => {
  const { cargador_ocpp_id: ocppId, desde, hasta } = req.query;
  const conditions = [];
  const params = [];
  if (ocppId) {
    params.push(ocppId);
    conditions.push(`a.cargador_ocpp_id = $${params.length}`);
  }
  if (desde) {
    params.push(desde);
    conditions.push(`a.creado_en >= $${params.length}`);
  }
  if (hasta) {
    params.push(hasta);
    conditions.push(`a.creado_en <= $${params.length}`);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await pool.query(
    `SELECT a.id, a.cargador_ocpp_id, co.nombre AS consorcio_nombre, se.nombre AS sector_nombre,
            a.status_ocpp, a.error_code, a.creado_en
     FROM cargador_alarmas a
     LEFT JOIN cargadores ca ON ca.ocpp_id = a.cargador_ocpp_id
     LEFT JOIN consorcios co ON co.id = ca.consorcio_id
     LEFT JOIN sectores se ON se.id = ca.sector_id
     ${where}
     ORDER BY a.creado_en DESC LIMIT 500`,
    params,
  );
  res.json(result.rows);
});

// Equivalente a "Location Status" de GRASEN: resumen agregado por
// ubicacion (consorcio) en vez de por cargador individual - cantidad de
// estaciones, cuantas conectadas/cargando ahora, y potencia real sumada
// (misma fuente que /resumen-vivo, agrupada por consorcio en vez de global).
router.get('/ubicaciones-estado', async (_req, res) => {
  const [consorcios, potencia] = await Promise.all([
    pool.query(
      `SELECT co.id, co.nombre, co.limite_amperios_totales,
              COUNT(ca.id) AS cargadores_total,
              COUNT(ca.id) FILTER (WHERE cs."isOnline") AS cargadores_conectados,
              COUNT(ca.id) FILTER (WHERE EXISTS (
                SELECT 1 FROM liquidacion_sesiones l
                WHERE l.cargador_ocpp_id = ca.ocpp_id AND l.fecha_fin IS NULL
              )) AS cargadores_activos
       FROM consorcios co
       LEFT JOIN cargadores ca ON ca.consorcio_id = co.id
       LEFT JOIN "ChargingStations" cs ON cs.id = ca.ocpp_id
       GROUP BY co.id, co.nombre, co.limite_amperios_totales
       ORDER BY co.nombre`,
    ),
    pool.query(
      `SELECT ca.consorcio_id, SUM(lm.potencia_kw) AS potencia_kw
       FROM (
         SELECT DISTINCT ON (cargador_ocpp_id) cargador_ocpp_id, potencia_kw
         FROM lecturas_medidor
         WHERE "timestamp" > NOW() - INTERVAL '10 minutes'
         ORDER BY cargador_ocpp_id, "timestamp" DESC
       ) lm
       JOIN cargadores ca ON ca.ocpp_id = lm.cargador_ocpp_id
       GROUP BY ca.consorcio_id`,
    ),
  ]);

  const potenciaByConsorcio = new Map(potencia.rows.map((r) => [r.consorcio_id, Number(r.potencia_kw)]));

  res.json(consorcios.rows.map((c) => ({
    ...c,
    potencia_actual_kw: potenciaByConsorcio.get(c.id) ?? 0,
  })));
});

// Equivalente a "Charging" de GRASEN (monitor en vivo, no historico):
// sesiones activas en este momento, todas las consorcios, con la ultima
// lectura de potencia/kwh de cada una. Buscable por serie en el frontend.
router.get('/sesiones-activas', async (_req, res) => {
  const result = await pool.query(
    `SELECT l.cargador_ocpp_id, co.nombre AS consorcio_nombre, l.fecha_inicio,
            lm.potencia_kw, lm.kwh_acumulado
     FROM liquidacion_sesiones l
     JOIN cargadores ca ON ca.ocpp_id = l.cargador_ocpp_id
     JOIN consorcios co ON co.id = ca.consorcio_id
     LEFT JOIN LATERAL (
       SELECT potencia_kw, kwh_acumulado FROM lecturas_medidor lm2
       WHERE lm2.transaction_id_ocpp = l.transaction_id_ocpp
       ORDER BY lm2."timestamp" DESC LIMIT 1
     ) lm ON true
     WHERE l.fecha_fin IS NULL
     ORDER BY l.fecha_inicio DESC`,
  );
  res.json(result.rows);
});

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

// Resumen en vivo para el dashboard (donut de estado + potencia total +
// fallas recientes), agregado a TODA la plataforma - no es por consorcio,
// eso ya lo tiene AdminConsorcio via /admin/consorcios/:id/live. Clasificacion
// de estado calcada de matchesFiltroEstado en superadmin/Cargadores.jsx para
// que el donut coincida exactamente con lo que se ve en esa pantalla.
router.get('/resumen-vivo', async (_req, res) => {
  const [cargadores, potencia, fallas] = await Promise.all([
    pool.query(
      `SELECT cs."isOnline" AS conectado_citrineos, ce.status_ocpp,
              EXISTS (
                SELECT 1 FROM liquidacion_sesiones l
                WHERE l.cargador_ocpp_id = ca.ocpp_id AND l.fecha_fin IS NULL
              ) AS activo
       FROM cargadores ca
       LEFT JOIN "ChargingStations" cs ON cs.id = ca.ocpp_id
       LEFT JOIN cargador_estado_actual ce ON ce.cargador_ocpp_id = ca.ocpp_id`,
    ),
    pool.query(
      `SELECT DISTINCT ON (cargador_ocpp_id) cargador_ocpp_id, potencia_kw
       FROM lecturas_medidor
       WHERE "timestamp" > NOW() - INTERVAL '10 minutes'
       ORDER BY cargador_ocpp_id, "timestamp" DESC`,
    ),
    pool.query(
      `SELECT a.cargador_ocpp_id, co.nombre AS consorcio_nombre, a.status_ocpp, a.error_code, a.creado_en
       FROM cargador_alarmas a
       LEFT JOIN cargadores ca ON ca.ocpp_id = a.cargador_ocpp_id
       LEFT JOIN consorcios co ON co.id = ca.consorcio_id
       ORDER BY a.creado_en DESC LIMIT 10`,
    ),
  ]);

  const estadoCounts = {
    disponible: 0, cargando: 0, falla: 0, offline: 0,
  };
  for (const c of cargadores.rows) {
    if (!c.conectado_citrineos) estadoCounts.offline += 1;
    else if (c.status_ocpp === 'Faulted') estadoCounts.falla += 1;
    else if (c.activo) estadoCounts.cargando += 1;
    else estadoCounts.disponible += 1;
  }

  const potenciaTotalKw = potencia.rows.reduce((sum, r) => sum + Number(r.potencia_kw ?? 0), 0);

  res.json({
    estado_counts: estadoCounts,
    cargadores_total: cargadores.rows.length,
    cargadores_conectados: cargadores.rows.filter((c) => c.conectado_citrineos).length,
    potencia_total_kw: potenciaTotalKw,
    fallas_recientes: fallas.rows,
  });
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

// Informe de conexiones OCPP (fabricantes probando via el tester publico sin
// login, ver routes/public.js) - a diferencia de /proveedores/:id/tests (que
// es por cuenta registrada), esto agrupa por ocpp_id/estacion tal cual llega
// a CitrineOS, sea de una cuenta de fabrica o de un test anonimo. Excluye
// "BilonTest", nuestro propio vendor de pruebas de estres internas.
router.get('/ocpp-conexiones', async (_req, res) => {
  const result = await pool.query(
    `SELECT cs.id AS ocpp_id, cs."chargePointVendor" AS vendor, cs."chargePointModel" AS modelo,
            cs.protocol AS protocolo, cs."isOnline" AS conectado, cs."latestOcppMessageTimestamp" AS ultima_actividad,
            COUNT(pt.id) AS tests_count
     FROM "ChargingStations" cs
     LEFT JOIN proveedor_tests pt ON pt.cargador_ocpp_id = cs.id
     WHERE cs."chargePointVendor" IS DISTINCT FROM 'BilonTest'
     GROUP BY cs.id, cs."chargePointVendor", cs."chargePointModel", cs.protocol, cs."isOnline", cs."latestOcppMessageTimestamp"
     ORDER BY cs."latestOcppMessageTimestamp" DESC NULLS LAST
     LIMIT 200`,
  );
  res.json(result.rows);
});

router.get('/ocpp-conexiones/:ocppId/tests', async (req, res) => {
  const result = await pool.query(
    `SELECT pt.id, pt.accion, pt.resultado, pt.detalle, pt.creado_en, u.email AS usuario_email
     FROM proveedor_tests pt
     LEFT JOIN usuarios u ON u.id = pt.usuario_id
     WHERE pt.cargador_ocpp_id = $1
     ORDER BY pt.creado_en DESC LIMIT 200`,
    [req.params.ocppId],
  );
  res.json(result.rows);
});

module.exports = router;
