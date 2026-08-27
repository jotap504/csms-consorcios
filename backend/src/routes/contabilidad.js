// Contabilidad interna de Bilon (plata propia del negocio - caja, bancos,
// gastos, cobros de facturas_bilon, estado de resultado, balance). Superadmin
// unicamente: es informacion financiera del negocio, no de un edificio.
// Ver schema_contabilidad.sql para el modelo de datos.

const express = require('express');
const { pool } = require('../db');
const { authenticate, requirePermission } = require('../auth/middleware');

const router = express.Router();
router.use(authenticate, requirePermission('admin_contabilidad'));

function periodoValido(periodo) {
  return typeof periodo === 'string' && /^\d{4}-\d{2}$/.test(periodo);
}

// ---------------------------------------------------------------------------
// Cuentas bancarias / caja
// ---------------------------------------------------------------------------

router.get('/cuentas', async (_req, res) => {
  const result = await pool.query(
    `SELECT cb.*,
            cb.saldo_inicial +
            COALESCE((SELECT SUM(CASE WHEN mc.tipo = 'ingreso' THEN mc.monto ELSE -mc.monto END)
                      FROM movimientos_caja mc WHERE mc.cuenta_bancaria_id = cb.id), 0) AS saldo_actual
     FROM cuentas_bancarias cb
     ORDER BY cb.activa DESC, cb.nombre`,
  );
  res.json(result.rows);
});

router.post('/cuentas', async (req, res) => {
  const {
    nombre, tipo, banco, numero_cuenta: numeroCuenta, cbu_alias: cbuAlias,
    saldo_inicial: saldoInicial, fecha_saldo_inicial: fechaSaldoInicial,
  } = req.body ?? {};
  if (!nombre || !['efectivo', 'banco'].includes(tipo)) {
    return res.status(400).json({ error: 'nombre y tipo (efectivo/banco) son requeridos.' });
  }
  const result = await pool.query(
    `INSERT INTO cuentas_bancarias (nombre, tipo, banco, numero_cuenta, cbu_alias, saldo_inicial, fecha_saldo_inicial)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [nombre, tipo, banco ?? null, numeroCuenta ?? null, cbuAlias ?? null,
      saldoInicial ? Number(saldoInicial) : 0, fechaSaldoInicial || new Date().toISOString().slice(0, 10)],
  );
  res.status(201).json(result.rows[0]);
});

router.put('/cuentas/:id', async (req, res) => {
  const {
    nombre, banco, numero_cuenta: numeroCuenta, cbu_alias: cbuAlias, activa,
  } = req.body ?? {};
  const result = await pool.query(
    `UPDATE cuentas_bancarias SET
       nombre = COALESCE($1, nombre), banco = COALESCE($2, banco),
       numero_cuenta = COALESCE($3, numero_cuenta), cbu_alias = COALESCE($4, cbu_alias),
       activa = COALESCE($5, activa)
     WHERE id = $6 RETURNING *`,
    [nombre ?? null, banco ?? null, numeroCuenta ?? null, cbuAlias ?? null, activa ?? null, req.params.id],
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Cuenta no encontrada.' });
  res.json(result.rows[0]);
});

// ---------------------------------------------------------------------------
// Categorias de gasto
// ---------------------------------------------------------------------------

router.get('/categorias-gasto', async (_req, res) => {
  const result = await pool.query('SELECT * FROM categorias_gasto WHERE activa = TRUE ORDER BY nombre');
  res.json(result.rows);
});

router.post('/categorias-gasto', async (req, res) => {
  const { nombre } = req.body ?? {};
  if (!nombre) return res.status(400).json({ error: 'nombre es requerido.' });
  try {
    const result = await pool.query('INSERT INTO categorias_gasto (nombre) VALUES ($1) RETURNING *', [nombre]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ya existe una categoria con ese nombre.' });
    throw err;
  }
});

// ---------------------------------------------------------------------------
// Gastos (pasivo hasta que se pagan)
// ---------------------------------------------------------------------------

router.get('/gastos', async (req, res) => {
  const { estado, desde, hasta } = req.query;
  const conditions = [];
  const params = [];
  if (estado) { params.push(estado); conditions.push(`g.estado = $${params.length}`); }
  if (desde) { params.push(desde); conditions.push(`g.fecha >= $${params.length}`); }
  if (hasta) { params.push(hasta); conditions.push(`g.fecha <= $${params.length}`); }
  const result = await pool.query(
    `SELECT g.*, cg.nombre AS categoria_nombre, cb.nombre AS cuenta_nombre
     FROM gastos g
     LEFT JOIN categorias_gasto cg ON cg.id = g.categoria_id
     LEFT JOIN cuentas_bancarias cb ON cb.id = g.cuenta_bancaria_id
     ${conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''}
     ORDER BY g.fecha DESC, g.id DESC LIMIT 500`,
    params,
  );
  res.json(result.rows);
});

router.post('/gastos', async (req, res) => {
  const {
    fecha, proveedor_nombre: proveedorNombre, categoria_id: categoriaId, monto, nota,
  } = req.body ?? {};
  if (!monto || Number(monto) <= 0) {
    return res.status(400).json({ error: 'monto (mayor a 0) es requerido.' });
  }
  const result = await pool.query(
    `INSERT INTO gastos (fecha, proveedor_nombre, categoria_id, monto, nota, creado_por)
     VALUES (COALESCE($1, CURRENT_DATE), $2, $3, $4, $5, $6) RETURNING *`,
    [fecha || null, proveedorNombre ?? null, categoriaId ?? null, Number(monto), nota ?? null, req.user.sub],
  );
  res.status(201).json(result.rows[0]);
});

router.put('/gastos/:id', async (req, res) => {
  const {
    fecha, proveedor_nombre: proveedorNombre, categoria_id: categoriaId, monto, nota,
  } = req.body ?? {};
  if (!monto || Number(monto) <= 0) {
    return res.status(400).json({ error: 'monto (mayor a 0) es requerido.' });
  }
  const result = await pool.query(
    `UPDATE gastos SET fecha = COALESCE($1, fecha), proveedor_nombre = $2, categoria_id = $3, monto = $4, nota = $5
     WHERE id = $6 AND estado = 'pendiente' RETURNING *`,
    [fecha || null, proveedorNombre ?? null, categoriaId ? Number(categoriaId) : null, Number(monto), nota ?? null, req.params.id],
  );
  if (result.rowCount === 0) {
    return res.status(409).json({ error: 'El gasto no existe o ya no esta pendiente (no se puede editar un gasto pagado).' });
  }
  res.json(result.rows[0]);
});

router.post('/gastos/:id/pagar', async (req, res) => {
  const { cuenta_bancaria_id: cuentaBancariaId, fecha } = req.body ?? {};
  if (!cuentaBancariaId) return res.status(400).json({ error: 'cuenta_bancaria_id es requerido.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const gasto = await client.query(
      `UPDATE gastos SET estado = 'pagado', cuenta_bancaria_id = $1, fecha_pago = COALESCE($2, CURRENT_DATE)
       WHERE id = $3 AND estado = 'pendiente' RETURNING *`,
      [cuentaBancariaId, fecha || null, req.params.id],
    );
    if (gasto.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'El gasto no existe o ya no esta pendiente.' });
    }
    const g = gasto.rows[0];
    await client.query(
      `INSERT INTO movimientos_caja (cuenta_bancaria_id, fecha, tipo, monto, concepto, gasto_id, creado_por)
       VALUES ($1,$2,'egreso',$3,$4,$5,$6)`,
      [cuentaBancariaId, g.fecha_pago, g.monto, `Pago: ${g.proveedor_nombre || 'gasto'} #${g.id}`, g.id, req.user.sub],
    );
    await client.query('COMMIT');
    res.json(g);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

router.delete('/gastos/:id', async (req, res) => {
  const result = await pool.query(`DELETE FROM gastos WHERE id = $1 AND estado = 'pendiente'`, [req.params.id]);
  if (result.rowCount === 0) {
    return res.status(409).json({ error: 'Solo se puede borrar un gasto pendiente (uno pagado ya genero un movimiento de caja).' });
  }
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Movimientos de caja/banco (libro real de ingresos y egresos)
// ---------------------------------------------------------------------------

router.get('/movimientos', async (req, res) => {
  const { cuenta_bancaria_id: cuentaBancariaId, desde, hasta } = req.query;
  const conditions = [];
  const params = [];
  if (cuentaBancariaId) { params.push(cuentaBancariaId); conditions.push(`mc.cuenta_bancaria_id = $${params.length}`); }
  if (desde) { params.push(desde); conditions.push(`mc.fecha >= $${params.length}`); }
  if (hasta) { params.push(hasta); conditions.push(`mc.fecha <= $${params.length}`); }
  const result = await pool.query(
    `SELECT mc.*, cb.nombre AS cuenta_nombre
     FROM movimientos_caja mc
     JOIN cuentas_bancarias cb ON cb.id = mc.cuenta_bancaria_id
     ${conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''}
     ORDER BY mc.fecha DESC, mc.id DESC LIMIT 500`,
    params,
  );
  res.json(result.rows);
});

// Movimiento manual (no ligado a un gasto ni a una factura) - ej: aporte de
// capital, retiro, ajuste. Los que si vienen de pagar un gasto o cobrar una
// factura se crean automaticamente desde esos endpoints, no desde aca.
router.post('/movimientos', async (req, res) => {
  const {
    cuenta_bancaria_id: cuentaBancariaId, fecha, tipo, monto, concepto,
  } = req.body ?? {};
  if (!cuentaBancariaId || !['ingreso', 'egreso'].includes(tipo) || !monto || Number(monto) <= 0 || !concepto) {
    return res.status(400).json({ error: 'cuenta_bancaria_id, tipo (ingreso/egreso), monto y concepto son requeridos.' });
  }
  const result = await pool.query(
    `INSERT INTO movimientos_caja (cuenta_bancaria_id, fecha, tipo, monto, concepto, creado_por)
     VALUES ($1, COALESCE($2, CURRENT_DATE), $3, $4, $5, $6) RETURNING *`,
    [cuentaBancariaId, fecha || null, tipo, Number(monto), concepto, req.user.sub],
  );
  res.status(201).json(result.rows[0]);
});

router.delete('/movimientos/:id', async (req, res) => {
  const result = await pool.query(
    'DELETE FROM movimientos_caja WHERE id = $1 AND gasto_id IS NULL AND factura_bilon_id IS NULL',
    [req.params.id],
  );
  if (result.rowCount === 0) {
    return res.status(409).json({ error: 'Solo se pueden borrar movimientos manuales (los de pago de gasto o cobro de factura se revierten desde su origen).' });
  }
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Cuenta corriente clientes: se lee directo de facturas_bilon, no se duplica.
// ---------------------------------------------------------------------------

router.get('/facturas-pendientes', async (_req, res) => {
  const result = await pool.query(
    `SELECT fb.*, co.nombre AS consorcio_nombre, uf.numero_departamento
     FROM facturas_bilon fb
     JOIN consorcios co ON co.id = fb.consorcio_id
     LEFT JOIN unidades_funcionales uf ON uf.id = fb.uf_id
     WHERE fb.estado = 'pendiente'
     ORDER BY fb.periodo, co.nombre`,
  );
  res.json(result.rows);
});

router.post('/facturas/:facturaId/cobrar', async (req, res) => {
  const { cuenta_bancaria_id: cuentaBancariaId, fecha } = req.body ?? {};
  if (!cuentaBancariaId) return res.status(400).json({ error: 'cuenta_bancaria_id es requerido.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const factura = await client.query(
      `UPDATE facturas_bilon SET estado = 'pagada', pagada_en = NOW()
       WHERE id = $1 AND estado = 'pendiente' RETURNING *`,
      [req.params.facturaId],
    );
    if (factura.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'La factura no existe o ya no esta pendiente.' });
    }
    const f = factura.rows[0];
    await client.query(
      `INSERT INTO movimientos_caja (cuenta_bancaria_id, fecha, tipo, monto, concepto, factura_bilon_id, creado_por)
       VALUES ($1, COALESCE($2, CURRENT_DATE), 'ingreso', $3, $4, $5, $6)`,
      [cuentaBancariaId, fecha || null, f.monto_total, `Cobro factura #${f.id} - ${f.periodo}`, f.id, req.user.sub],
    );
    await client.query('COMMIT');
    res.json(f);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// Estado de resultado y balance - se calculan de los datos de arriba, no se
// guardan aparte.
// ---------------------------------------------------------------------------

router.get('/resultado', async (req, res) => {
  const { desde, hasta } = req.query;
  if (!periodoValido(desde) || !periodoValido(hasta)) {
    return res.status(400).json({ error: 'desde y hasta (YYYY-MM) son requeridos.' });
  }
  const ingresos = await pool.query(
    `SELECT COALESCE(SUM(monto_total), 0) AS total FROM facturas_bilon
     WHERE estado = 'pagada' AND periodo BETWEEN $1 AND $2`,
    [desde, hasta],
  );
  const egresosPorCategoria = await pool.query(
    `SELECT cg.nombre AS categoria, COALESCE(SUM(g.monto), 0) AS total
     FROM gastos g LEFT JOIN categorias_gasto cg ON cg.id = g.categoria_id
     WHERE g.estado = 'pagado' AND to_char(g.fecha_pago, 'YYYY-MM') BETWEEN $1 AND $2
     GROUP BY cg.nombre ORDER BY total DESC`,
    [desde, hasta],
  );
  const totalEgresos = egresosPorCategoria.rows.reduce((sum, r) => sum + Number(r.total), 0);
  res.json({
    periodo: { desde, hasta },
    ingresos: Number(ingresos.rows[0].total),
    egresos: totalEgresos,
    egresos_por_categoria: egresosPorCategoria.rows,
    resultado: Number(ingresos.rows[0].total) - totalEgresos,
  });
});

router.get('/balance', async (req, res) => {
  const fecha = req.query.fecha || new Date().toISOString().slice(0, 10);
  const saldosCuentas = await pool.query(
    `SELECT cb.id, cb.nombre,
            cb.saldo_inicial +
            COALESCE((SELECT SUM(CASE WHEN mc.tipo = 'ingreso' THEN mc.monto ELSE -mc.monto END)
                      FROM movimientos_caja mc WHERE mc.cuenta_bancaria_id = cb.id AND mc.fecha <= $1), 0) AS saldo
     FROM cuentas_bancarias cb WHERE cb.activa = TRUE ORDER BY cb.nombre`,
    [fecha],
  );
  const totalCuentas = saldosCuentas.rows.reduce((sum, r) => sum + Number(r.saldo), 0);
  const porCobrar = await pool.query(
    `SELECT COALESCE(SUM(monto_total), 0) AS total FROM facturas_bilon WHERE estado = 'pendiente'`,
  );
  const porPagar = await pool.query(
    `SELECT COALESCE(SUM(monto), 0) AS total FROM gastos WHERE estado = 'pendiente'`,
  );
  const activo = totalCuentas + Number(porCobrar.rows[0].total);
  const pasivo = Number(porPagar.rows[0].total);
  res.json({
    fecha,
    cuentas: saldosCuentas.rows,
    activo: {
      disponible: totalCuentas,
      por_cobrar: Number(porCobrar.rows[0].total),
      total: activo,
    },
    pasivo: {
      por_pagar: pasivo,
      total: pasivo,
    },
    patrimonio: activo - pasivo,
  });
});

module.exports = router;
