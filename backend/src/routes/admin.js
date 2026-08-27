const express = require('express');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const XLSX = require('xlsx');
const pdfParse = require('pdf-parse');
const { pool } = require('../db');
const { authenticate, requireRole, requirePermission } = require('../auth/middleware');
const { generateToken } = require('../lib/tokens');
// Mismo mailer (stub, loguea en vez de mandar SMTP real) que usa
// superadmin.js para el flujo de invitacion de consorcio_admin - mismo
// criterio para consistencia, no el services/mail.js real (ese es el de la
// bandeja comercial con nodemailer/IMAP, otro proposito).
const { sendMail } = require('../lib/mailer');

// Contrasena por defecto para el login de residente que se crea solo al
// cargar/editar una UF con propietario_email. ON CONFLICT (email) nunca
// pisa password_hash de una cuenta existente - solo relinkea uf_id/consorcio_id,
// asi un residente que ya cambio su clave no la pierde si el admin reedita la UF.
const DEFAULT_RESIDENTE_PASSWORD = 'user1234';

async function upsertUsuarioResidente(client, { email, nombre, consorcioId, ufId }) {
  if (!email) return;
  const passwordHash = await bcrypt.hash(DEFAULT_RESIDENTE_PASSWORD, 10);
  await client.query(
    `INSERT INTO usuarios (email, password_hash, rol, consorcio_id, uf_id, nombre)
     VALUES ($1, $2, 'residente', $3, $4, $5)
     ON CONFLICT (email) DO UPDATE SET
       consorcio_id = EXCLUDED.consorcio_id,
       uf_id = EXCLUDED.uf_id,
       nombre = COALESCE(EXCLUDED.nombre, usuarios.nombre)`,
    [email, passwordHash, consorcioId, ufId, nombre ?? null],
  );
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

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
    `SELECT c.id, c.nombre, c.direccion, c.email_administracion, c.telefono_contacto,
            c.limite_amperios_totales, c.costo_kwh_electricidad, c.usar_medidor_dinamico,
            c.modo_facturacion, c.tipo_cliente, c.usar_saldo_prepago,
            lu.amps_l1, lu.amps_l2, lu.amps_l3, lu.potencia_kw, lu."timestamp" AS ultima_lectura_en
     FROM consorcios c
     LEFT JOIN LATERAL (
       SELECT amps_l1, amps_l2, amps_l3, potencia_kw, "timestamp"
       FROM lecturas_consorcio lc WHERE lc.consorcio_id = c.id
       ORDER BY lc."timestamp" DESC LIMIT 1
     ) lu ON TRUE
     WHERE c.id = $1`,
    [req.params.id],
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Consorcio no encontrado.' });
  res.json(result.rows[0]);
});

router.put('/consorcios/:id', async (req, res) => {
  const {
    nombre, direccion, telefono_contacto, limite_amperios_totales, costo_kwh_electricidad, usar_medidor_dinamico,
    modo_facturacion, tipo_cliente, usar_saldo_prepago,
  } = req.body ?? {};
  if (modo_facturacion && !['administrador', 'propietario_directo'].includes(modo_facturacion)) {
    return res.status(400).json({ error: 'modo_facturacion invalido.' });
  }
  if (tipo_cliente && !['residencial', 'comercial'].includes(tipo_cliente)) {
    return res.status(400).json({ error: 'tipo_cliente invalido.' });
  }
  const result = await pool.query(
    `UPDATE consorcios SET
       nombre = COALESCE($1, nombre),
       direccion = COALESCE($2, direccion),
       telefono_contacto = COALESCE($3, telefono_contacto),
       limite_amperios_totales = COALESCE($4, limite_amperios_totales),
       costo_kwh_electricidad = COALESCE($5, costo_kwh_electricidad),
       usar_medidor_dinamico = COALESCE($6, usar_medidor_dinamico),
       modo_facturacion = COALESCE($7, modo_facturacion),
       tipo_cliente = COALESCE($8, tipo_cliente),
       usar_saldo_prepago = COALESCE($10, usar_saldo_prepago)
     WHERE id = $9
     RETURNING id, nombre, direccion, email_administracion, telefono_contacto,
               limite_amperios_totales, costo_kwh_electricidad, usar_medidor_dinamico,
               modo_facturacion, tipo_cliente, usar_saldo_prepago`,
    [
      nombre, direccion, telefono_contacto, limite_amperios_totales, costo_kwh_electricidad, usar_medidor_dinamico ?? null,
      modo_facturacion ?? null, tipo_cliente ?? null, req.params.id, usar_saldo_prepago ?? null,
    ],
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Consorcio no encontrado.' });
  res.json(result.rows[0]);
});

// Cargadores
router.get('/consorcios/:id/cargadores', async (req, res) => {
  const result = await pool.query(
    `SELECT c.*, uf.numero_departamento AS uf_numero_departamento, uf.numero_cochera AS uf_numero_cochera,
            uf.propietario_nombre AS uf_propietario_nombre,
            coc.numero_cochera AS cochera_numero,
            s.nombre AS sector_nombre,
            si.identificador AS stock_identificador,
            p.potencia_kw, p.fases, p.conector, p.montaje, p.ocpp_protocolo, p.tipo_corriente,
            COALESCE(cs."isOnline", FALSE) AS estado_online,
            cs."latestOcppMessageTimestamp" AS ultimo_heartbeat
     FROM cargadores c
     LEFT JOIN unidades_funcionales uf ON uf.id = c.uf_id
     LEFT JOIN cocheras coc ON coc.id = c.cochera_id
     LEFT JOIN sectores s ON s.id = c.sector_id
     LEFT JOIN stock_items si ON si.id = c.stock_item_id
     LEFT JOIN productos_catalogo p ON p.id = si.producto_id
     LEFT JOIN "ChargingStations" cs ON cs.id = c.ocpp_id
     WHERE c.consorcio_id = $1
     ORDER BY c.etiqueta NULLS LAST, c.ocpp_id`,
    [req.params.id],
  );
  res.json(result.rows);
});

// Alta de wallbox: unico camino es POST /consorcios/:id/instalaciones (ver
// mas abajo), que consume el stock Y registra el cargador en un solo paso.

router.put('/cargadores/:id', async (req, res) => {
  const {
    etiqueta, charge_point_vendor, charge_point_model, cochera_id: cocheraId, sector_id, ocpp_version,
  } = req.body ?? {};
  const sendsCochera = 'cochera_id' in (req.body ?? {});
  let consorcioId = null;
  if (sendsCochera || sector_id) {
    const cargador = await pool.query('SELECT consorcio_id FROM cargadores WHERE id = $1', [req.params.id]);
    if (cargador.rowCount === 0) return res.status(404).json({ error: 'Cargador no encontrado.' });
    consorcioId = cargador.rows[0].consorcio_id;
  }
  // uf_id se deriva siempre de la cochera - nunca se asigna un cargador a
  // una UF sin especificar cual de sus cocheras ocupa.
  let ufId = null;
  if (sendsCochera && cocheraId) {
    const cochera = await pool.query(
      `SELECT coc.id, coc.uf_id FROM cocheras coc
       JOIN unidades_funcionales uf ON uf.id = coc.uf_id
       WHERE coc.id = $1 AND uf.consorcio_id = $2`,
      [cocheraId, consorcioId],
    );
    if (cochera.rowCount === 0) {
      return res.status(404).json({ error: 'Cochera no encontrada en este consorcio.' });
    }
    ufId = cochera.rows[0].uf_id;
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
       cochera_id = CASE WHEN $4 THEN $5::int ELSE cochera_id END,
       uf_id = CASE WHEN $4 THEN $10::int ELSE uf_id END,
       sector_id = CASE WHEN $6 THEN $7::int ELSE sector_id END,
       ocpp_version = COALESCE($9, ocpp_version)
     WHERE id = $8 RETURNING *`,
    [etiqueta ?? null, charge_point_vendor ?? null, charge_point_model ?? null,
      sendsCochera, cocheraId ?? null,
      'sector_id' in (req.body ?? {}), sector_id ?? null, req.params.id,
      ocpp_version === '1.6' || ocpp_version === '2.0.1' ? ocpp_version : null, ufId],
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Cargador no encontrado.' });
  res.json(result.rows[0]);
});

router.delete('/cargadores/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cargador = await client.query('SELECT stock_item_id FROM cargadores WHERE id = $1', [req.params.id]);
    if (cargador.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Cargador no encontrado.' });
    }
    await client.query('DELETE FROM cargadores WHERE id = $1', [req.params.id]);
    const stockItemId = cargador.rows[0].stock_item_id;
    if (stockItemId) {
      await client.query(
        `UPDATE stock_items SET estado = 'en_stock', consorcio_id = NULL WHERE id = $1`,
        [stockItemId],
      );
    }
    await client.query('COMMIT');
    res.status(204).end();
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
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

// Medidores Modbus-TCP (gateway RS485->TCP en el tablero). sector_id null =
// medidor general del edificio; con sector_id = medidor de ese piso puntual.
router.get('/consorcios/:id/medidores-modbus', async (req, res) => {
  const result = await pool.query(
    `SELECT m.*, s.nombre AS sector_nombre
     FROM medidores_modbus m
     LEFT JOIN sectores s ON s.id = m.sector_id
     WHERE m.consorcio_id = $1 ORDER BY m.sector_id NULLS FIRST`,
    [req.params.id],
  );
  res.json(result.rows);
});

router.post('/consorcios/:id/medidores-modbus', async (req, res) => {
  const {
    sector_id, nombre, modelo, host, puerto, unit_id, intervalo_seg,
  } = req.body ?? {};
  if (!nombre || !host) {
    return res.status(400).json({ error: 'nombre y host son requeridos.' });
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
      `INSERT INTO medidores_modbus (consorcio_id, sector_id, nombre, modelo, host, puerto, unit_id, intervalo_seg)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [
        req.params.id, sector_id ?? null, nombre, modelo || 'ADW300', host,
        puerto || 502, unit_id || 1, intervalo_seg || 15,
      ],
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({
        error: sector_id
          ? 'Este sector ya tiene un medidor Modbus configurado.'
          : 'Este edificio ya tiene un medidor general Modbus configurado.',
      });
    }
    throw err;
  }
});

router.put('/medidores-modbus/:id', async (req, res) => {
  const {
    nombre, modelo, host, puerto, unit_id, intervalo_seg, activo,
  } = req.body ?? {};
  const result = await pool.query(
    `UPDATE medidores_modbus SET
       nombre = COALESCE($1, nombre),
       modelo = COALESCE($2, modelo),
       host = COALESCE($3, host),
       puerto = COALESCE($4, puerto),
       unit_id = COALESCE($5, unit_id),
       intervalo_seg = COALESCE($6, intervalo_seg),
       activo = COALESCE($7, activo)
     WHERE id = $8 RETURNING *`,
    [nombre ?? null, modelo ?? null, host ?? null, puerto ?? null, unit_id ?? null, intervalo_seg ?? null, activo ?? null, req.params.id],
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Medidor no encontrado.' });
  res.json(result.rows[0]);
});

router.delete('/medidores-modbus/:id', async (req, res) => {
  const result = await pool.query('DELETE FROM medidores_modbus WHERE id = $1', [req.params.id]);
  if (result.rowCount === 0) return res.status(404).json({ error: 'Medidor no encontrado.' });
  res.status(204).end();
});

// Unidades funcionales
// Un depto puede tener mas de una cochera (ver schema_cocheras.sql) - se
// devuelven agregadas por UF para que el front las liste sin N+1 requests.
router.get('/consorcios/:id/unidades', async (req, res) => {
  const result = await pool.query(
    `SELECT uf.*,
            COALESCE(
              (SELECT json_agg(json_build_object('id', coc.id, 'numero_cochera', coc.numero_cochera) ORDER BY coc.numero_cochera)
               FROM cocheras coc WHERE coc.uf_id = uf.id),
              '[]'
            ) AS cocheras
     FROM unidades_funcionales uf
     WHERE uf.consorcio_id = $1 ORDER BY uf.numero_departamento`,
    [req.params.id],
  );
  res.json(result.rows);
});

router.post('/consorcios/:id/unidades', async (req, res) => {
  const { numero_departamento, numero_cochera, propietario_nombre, propietario_email, telefono_propietario } = req.body ?? {};
  if (!numero_departamento) {
    return res.status(400).json({ error: 'numero_departamento es requerido.' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO unidades_funcionales (consorcio_id, numero_departamento, numero_cochera, propietario_nombre, propietario_email, telefono_propietario)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.params.id, numero_departamento, numero_cochera, propietario_nombre, propietario_email, telefono_propietario ?? null],
    );
    const uf = result.rows[0];
    let cocheraCreada = null;
    if (numero_cochera) {
      const coch = await client.query('INSERT INTO cocheras (uf_id, numero_cochera) VALUES ($1,$2) RETURNING *', [uf.id, numero_cochera]);
      cocheraCreada = coch.rows[0];
    }
    await upsertUsuarioResidente(client, {
      email: propietario_email,
      nombre: propietario_nombre,
      consorcioId: req.params.id,
      ufId: uf.id,
    });
    await client.query('COMMIT');
    res.status(201).json({ ...uf, cochera_creada: cocheraCreada });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// Cocheras (espacios de auto) de una unidad funcional - un depto puede
// tener varias, cada una con su propio wallbox (o ninguno todavia).
router.post('/unidades/:id/cocheras', async (req, res) => {
  const { numero_cochera: numeroCochera } = req.body ?? {};
  if (!numeroCochera) {
    return res.status(400).json({ error: 'numero_cochera es requerido.' });
  }
  const uf = await pool.query('SELECT id FROM unidades_funcionales WHERE id = $1', [req.params.id]);
  if (uf.rowCount === 0) return res.status(404).json({ error: 'Unidad funcional no encontrada.' });
  const result = await pool.query(
    'INSERT INTO cocheras (uf_id, numero_cochera) VALUES ($1,$2) RETURNING *',
    [req.params.id, numeroCochera],
  );
  res.status(201).json(result.rows[0]);
});

router.delete('/cocheras/:id', async (req, res) => {
  const enUso = await pool.query('SELECT id FROM cargadores WHERE cochera_id = $1', [req.params.id]);
  if (enUso.rowCount > 0) {
    return res.status(409).json({ error: 'Esta cochera tiene un wallbox asignado. Reasignalo o borralo antes de borrar la cochera.' });
  }
  const result = await pool.query('DELETE FROM cocheras WHERE id = $1', [req.params.id]);
  if (result.rowCount === 0) return res.status(404).json({ error: 'Cochera no encontrada.' });
  res.status(204).end();
});

// Import con IA: lee un Excel/CSV/PDF y devuelve filas candidatas de
// unidades funcionales para que el admin las revise/edite ANTES de crear
// nada - esta ruta no escribe en la base, solo previsualiza.
router.post('/consorcios/:id/unidades/import-preview', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Falta el archivo.' });
  }
  if (!process.env.OPENROUTER_API_KEY) {
    return res.status(500).json({ error: 'Falta configurar OPENROUTER_API_KEY en el servidor.' });
  }

  const name = req.file.originalname.toLowerCase();
  let rawContent;
  try {
    if (name.endsWith('.pdf')) {
      const parsed = await pdfParse(req.file.buffer);
      rawContent = parsed.text;
    } else if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv')) {
      const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      rawContent = JSON.stringify(XLSX.utils.sheet_to_json(sheet, { defval: '' }));
    } else {
      return res.status(400).json({ error: 'Formato no soportado. Usa Excel (.xlsx/.xls), CSV o PDF.' });
    }
  } catch (err) {
    console.error('Error leyendo archivo de import:', err);
    return res.status(400).json({ error: 'No se pudo leer el archivo. Verifica que no este corrupto.' });
  }

  if (!rawContent || !rawContent.trim()) {
    return res.status(400).json({ error: 'El archivo no tiene contenido legible.' });
  }

  const prompt = `Sos un asistente que extrae datos de unidades funcionales de un consorcio/edificio a partir de un documento (planilla o listado en texto).
Devolve EXCLUSIVAMENTE un array JSON valido (sin texto adicional, sin markdown, sin backticks), donde cada elemento tiene EXACTAMENTE estos campos:
- numero_departamento (string, requerido - el identificador de la unidad, ej "1A", "PB 2", "Depto 5")
- numero_cochera (string o null - numero/identificador de cochera si existe)
- propietario_nombre (string o null)
- propietario_email (string o null)
- telefono_propietario (string o null)

Si un dato no esta presente para una fila, usa null. No inventes datos que no esten en el documento. Si el documento no tiene informacion de unidades, devolve un array vacio [].

Contenido del documento:
${rawContent.slice(0, 40000)}`;

  try {
    const aiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'anthropic/claude-sonnet-5',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
      }),
    });
    const data = await aiRes.json();
    if (!aiRes.ok) {
      console.error('Error de OpenRouter:', data);
      return res.status(502).json({ error: 'El servicio de IA no pudo procesar el documento.' });
    }
    let text = (data.choices?.[0]?.message?.content ?? '').trim();
    text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/, '');
    let rows;
    try {
      rows = JSON.parse(text);
    } catch {
      console.error('IA devolvio JSON invalido:', text);
      return res.status(502).json({ error: 'La IA no devolvio un formato valido. Proba con un archivo mas simple o cargalo a mano.' });
    }
    res.json({ rows: Array.isArray(rows) ? rows : [] });
  } catch (err) {
    console.error('Error llamando a OpenRouter:', err);
    res.status(502).json({ error: 'No se pudo comunicar con el servicio de IA.' });
  }
});

router.put('/unidades/:id', async (req, res) => {
  const { numero_departamento, numero_cochera, propietario_nombre, propietario_email, telefono_propietario } = req.body ?? {};
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE unidades_funcionales SET
         numero_departamento = COALESCE($1, numero_departamento),
         numero_cochera = COALESCE($2, numero_cochera),
         propietario_nombre = COALESCE($3, propietario_nombre),
         propietario_email = COALESCE($4, propietario_email),
         telefono_propietario = COALESCE($5, telefono_propietario)
       WHERE id = $6 RETURNING *`,
      [numero_departamento, numero_cochera, propietario_nombre, propietario_email, telefono_propietario, req.params.id],
    );
    if (result.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Unidad funcional no encontrada.' });
    }
    const uf = result.rows[0];
    await upsertUsuarioResidente(client, {
      email: uf.propietario_email,
      nombre: uf.propietario_nombre,
      consorcioId: uf.consorcio_id,
      ufId: uf.id,
    });
    await client.query('COMMIT');
    res.json(uf);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error actualizando unidad funcional:', err);
    res.status(500).json({ error: 'No se pudo actualizar la unidad funcional.' });
  } finally {
    client.release();
  }
});

// Borrar una UF borra tambien sus cargadores (no los deja huerfanos con
// uf_id/cochera_id en null) - un wallbox instalado en una cochera que ya no
// existe no tiene sentido como registro suelto. El stock_item asociado
// vuelve a 'en_stock' para poder reinstalarlo en otro lado.
router.delete('/unidades/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cargadoresDeUf = await client.query('SELECT id, stock_item_id FROM cargadores WHERE uf_id = $1', [req.params.id]);
    for (const c of cargadoresDeUf.rows) {
      if (c.stock_item_id) {
        await client.query(`UPDATE stock_items SET estado = 'en_stock', consorcio_id = NULL WHERE id = $1`, [c.stock_item_id]);
      }
    }
    await client.query('DELETE FROM cargadores WHERE uf_id = $1', [req.params.id]);
    const result = await client.query('DELETE FROM unidades_funcionales WHERE id = $1', [req.params.id]);
    if (result.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Unidad funcional no encontrada.' });
    }
    await client.query('COMMIT');
    res.status(204).end();
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
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

// Recarga manual de saldo prepago (opt-in por consorcio via
// consorcios.usar_saldo_prepago). Mismo shape que pagos_abono_sistema
// (monto, comprobante_ref) - registro de un pago ya recibido por otro medio
// (transferencia, efectivo), no una pasarela de pago propia. Ledger completo
// en tarjeta_movimientos + saldo cacheado en tarjetas_rfid, actualizados
// atomicamente en la misma transaccion.
router.post('/tarjetas/:id/recargas', async (req, res) => {
  const { monto, comprobante_ref } = req.body ?? {};
  const montoNum = Number(monto);
  if (!montoNum || montoNum <= 0) {
    return res.status(400).json({ error: 'monto debe ser un numero mayor a 0.' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const tarjeta = await client.query('SELECT id FROM tarjetas_rfid WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (tarjeta.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Tarjeta no encontrada.' });
    }
    await client.query(
      `INSERT INTO tarjeta_movimientos (tarjeta_id, tipo, monto, comprobante_ref) VALUES ($1, 'recarga', $2, $3)`,
      [req.params.id, montoNum, comprobante_ref ?? null],
    );
    const updated = await client.query(
      'UPDATE tarjetas_rfid SET saldo = saldo + $1 WHERE id = $2 RETURNING saldo',
      [montoNum, req.params.id],
    );
    await client.query('COMMIT');
    res.status(201).json({ ok: true, saldo: updated.rows[0].saldo });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

router.get('/tarjetas/:id/movimientos', async (req, res) => {
  const result = await pool.query(
    `SELECT id, tipo, monto, liquidacion_sesion_id, comprobante_ref, creado_en
     FROM tarjeta_movimientos WHERE tarjeta_id = $1 ORDER BY creado_en DESC LIMIT 100`,
    [req.params.id],
  );
  res.json(result.rows);
});

// Vehiculos por unidad funcional - dato informativo (no bloquea nada, no
// se usa para autorizar OCPP). Mismo shape que las rutas de tarjetas de arriba.
router.get('/consorcios/:id/vehiculos', async (req, res) => {
  const result = await pool.query(
    `SELECT v.* FROM vehiculos v
     JOIN unidades_funcionales uf ON uf.id = v.uf_id
     WHERE uf.consorcio_id = $1 ORDER BY v.id`,
    [req.params.id],
  );
  res.json(result.rows);
});

router.post('/consorcios/:id/vehiculos', async (req, res) => {
  const {
    uf_id, patente, vin, alias, marca, modelo,
  } = req.body ?? {};
  if (!uf_id) return res.status(400).json({ error: 'uf_id es requerido.' });
  const uf = await pool.query('SELECT id FROM unidades_funcionales WHERE id = $1 AND consorcio_id = $2', [uf_id, req.params.id]);
  if (uf.rowCount === 0) return res.status(404).json({ error: 'Unidad funcional no encontrada en este consorcio.' });

  const result = await pool.query(
    `INSERT INTO vehiculos (uf_id, patente, vin, alias, marca, modelo)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [uf_id, patente ?? null, vin ?? null, alias ?? null, marca ?? null, modelo ?? null],
  );
  res.status(201).json(result.rows[0]);
});

router.put('/vehiculos/:id', async (req, res) => {
  const {
    patente, vin, alias, marca, modelo,
  } = req.body ?? {};
  const result = await pool.query(
    `UPDATE vehiculos SET
       patente = COALESCE($1, patente), vin = COALESCE($2, vin), alias = COALESCE($3, alias),
       marca = COALESCE($4, marca), modelo = COALESCE($5, modelo)
     WHERE id = $6 RETURNING *`,
    [patente ?? null, vin ?? null, alias ?? null, marca ?? null, modelo ?? null, req.params.id],
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Vehiculo no encontrado.' });
  res.json(result.rows[0]);
});

router.delete('/vehiculos/:id', async (req, res) => {
  const result = await pool.query('DELETE FROM vehiculos WHERE id = $1', [req.params.id]);
  if (result.rowCount === 0) return res.status(404).json({ error: 'Vehiculo no encontrado.' });
  res.status(204).end();
});

// Tendencia diaria de consumo (ultimos 15 dias) para el grafico de barras
// del panel del consorcio - equivalente a "Charging energy trend" de
// GRASEN. Se agrega tambien monto_total_expensa aunque hoy no se
// grafique (el ingreso no es prioridad todavia) para no tener que tocar
// esta query cuando se decida activarlo.
router.get('/consorcios/:id/tendencia-kwh', async (req, res) => {
  const result = await pool.query(
    `SELECT date_trunc('day', fecha_inicio) AS dia,
            COALESCE(SUM(kwh_consumidos), 0) AS kwh,
            COALESCE(SUM(monto_total_expensa), 0) AS monto
     FROM liquidacion_sesiones
     WHERE consorcio_id = $1 AND fecha_fin IS NOT NULL AND fecha_inicio >= NOW() - INTERVAL '15 days'
     GROUP BY dia
     ORDER BY dia`,
    [req.params.id],
  );
  res.json(result.rows);
});

// Consumo en tiempo real: lecturas de los ultimos 30 min por cargador, mas
// si tiene una sesion de carga activa en este momento.
router.get('/consorcios/:id/live', async (req, res) => {
  const [cargadores, activos, lecturas, medidorGeneral, acumulados] = await Promise.all([
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
    // Medidor general del edificio (Modbus/Acrel), no por cargador - mismo
    // criterio de ventana (30 min) que las lecturas por cargador de arriba.
    pool.query(
      `SELECT "timestamp", amps_l1, amps_l2, amps_l3, potencia_kw
       FROM lecturas_consorcio
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

  res.json({
    cargadores: cargadores.rows.map((c) => {
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
    medidor_general: {
      readings: medidorGeneral.rows,
      ultima_lectura: medidorGeneral.rows[medidorGeneral.rows.length - 1] ?? null,
    },
  });
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

// ---------------------------------------------------------------------------
// Configuration remota (GetConfiguration/ChangeConfiguration en 1.6,
// GetVariables/SetVariables en 2.0.1) + visor de OCPP Log. Accion sensible
// (toca limites de corriente, seguridad WS, etc. de un equipo real) -
// superadmin only, igual criterio que otras rutas superadmin-exclusivas de
// este mismo archivo (ver abono-items-catalogo mas abajo).
// ---------------------------------------------------------------------------

// Mismo criterio que listener/index.js:getOcppVersion - confiar en el
// protocolo REALMENTE negociado (ChargingStations.protocol) antes que en
// ocpp_version guardado a mano, que puede quedar desactualizado. Backend y
// listener son procesos/contenedores separados sin codigo compartido, por
// eso esto se duplica en vez de importarse.
async function getOcppVersion(stationId) {
  const cs = await pool.query('SELECT protocol FROM "ChargingStations" WHERE id = $1', [stationId]);
  const protocol = cs.rows[0]?.protocol;
  if (protocol) return protocol.includes('1.6') ? '1.6' : '2.0.1';
  const r = await pool.query('SELECT ocpp_version FROM cargadores WHERE ocpp_id = $1', [stationId]);
  return r.rows[0]?.ocpp_version ?? '2.0.1';
}

// Mismo patron que backend/src/routes/public.js:sendAndAwaitConfirmation - el
// REST de CitrineOS es fire-and-forget (success=true solo confirma que el
// mensaje salio, no lo que respondio el cargador). La respuesta real llega
// async y CitrineOS la persiste en su propia tabla OCPPMessages.
const CONFIRMATION_TIMEOUT_MS = 5000;
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

// Lista curada de variables 2.0.1 - no existe un "traer todas" simple sin
// paginar NotifyReport (GetBaseReport/FullInventory). Nombres reales, vistos
// en vivo esta semana en el NotifyReport de un wallbox de proveedor real,
// cubriendo las mismas areas que los grupos Core/Reservation/SmartCharging/
// Authorize del lado 1.6.
const VARIABLES_201_CURADAS = [
  { component: 'OCPPCommCtrlr', variable: 'HeartbeatInterval' },
  { component: 'OCPPCommCtrlr', variable: 'WebSocketPingInterval' },
  { component: 'TxCtrlr', variable: 'EVConnectionTimeOut' },
  { component: 'TxCtrlr', variable: 'StopTxOnInvalidId' },
  { component: 'TxCtrlr', variable: 'StopTxOnEVSideDisconnect' },
  { component: 'AuthCtrlr', variable: 'AuthorizeRemoteStart' },
  { component: 'AuthCtrlr', variable: 'LocalPreAuthorize' },
  { component: 'SampledDataCtrlr', variable: 'TxUpdatedInterval' },
  { component: 'SampledDataCtrlr', variable: 'TxUpdatedMeasurands' },
  { component: 'SmartChargingCtrlr', variable: 'Enabled' },
  { component: 'ReservationCtrlr', variable: 'Enabled' },
];

router.get('/cargadores/:ocppId/configuration', requirePermission('admin_cargadores_avanzado'), async (req, res) => {
  const ocppId = req.params.ocppId;
  const cargador = await pool.query('SELECT id FROM cargadores WHERE ocpp_id = $1', [ocppId]);
  if (cargador.rowCount === 0) return res.status(404).json({ error: 'Cargador no encontrado.' });

  const version = await getOcppVersion(ocppId);
  const is16 = version === '1.6';
  const url = is16
    ? `${CITRINEOS_REST_URL}/ocpp/1.6/configuration/getConfiguration?identifier=${encodeURIComponent(ocppId)}&tenantId=1`
    : `${CITRINEOS_REST_URL}/ocpp/2.0.1/monitoring/getVariables?identifier=${encodeURIComponent(ocppId)}&tenantId=1`;
  const body = is16
    ? {}
    : { getVariableData: VARIABLES_201_CURADAS.map((v) => ({ component: { name: v.component }, variable: { name: v.variable } })) };

  try {
    const { dispatched, payload } = await sendAndAwaitConfirmation(ocppId, is16 ? 'GetConfiguration' : 'GetVariables', url, body);
    if (!dispatched) return res.status(502).json({ error: 'No se pudo comunicar con el cargador.' });
    if (!payload) return res.status(504).json({ error: 'El cargador no respondio a tiempo.' });

    const items = is16
      ? (payload.configurationKey ?? []).map((k) => ({ key: k.key, value: k.value ?? null, readonly: !!k.readonly }))
      : (payload.getVariableResult ?? []).map((r) => ({
        key: `${r.component?.name}.${r.variable?.name}`,
        value: r.attributeValue ?? null,
        readonly: false,
        status: r.attributeStatus,
      }));
    res.json({ version, items, unknownKeys: is16 ? (payload.unknownKey ?? []) : [] });
  } catch (err) {
    console.error('Error leyendo configuracion OCPP:', err);
    res.status(502).json({ error: 'No se pudo comunicar con CitrineOS.' });
  }
});

router.put('/cargadores/:ocppId/configuration', requirePermission('admin_cargadores_avanzado'), async (req, res) => {
  const ocppId = req.params.ocppId;
  const { key, value } = req.body ?? {};
  if (!key || value == null) return res.status(400).json({ error: 'key y value son requeridos.' });

  const cargador = await pool.query('SELECT id FROM cargadores WHERE ocpp_id = $1', [ocppId]);
  if (cargador.rowCount === 0) return res.status(404).json({ error: 'Cargador no encontrado.' });

  const version = await getOcppVersion(ocppId);
  const is16 = version === '1.6';
  const url = is16
    ? `${CITRINEOS_REST_URL}/ocpp/1.6/configuration/changeConfiguration?identifier=${encodeURIComponent(ocppId)}&tenantId=1`
    : `${CITRINEOS_REST_URL}/ocpp/2.0.1/monitoring/setVariables?identifier=${encodeURIComponent(ocppId)}&tenantId=1`;
  let body;
  if (is16) {
    body = { key, value: String(value) };
  } else {
    const [component, variable] = key.split('.');
    body = { setVariableData: [{ component: { name: component }, variable: { name: variable }, attributeValue: String(value) }] };
  }

  try {
    const { dispatched, payload } = await sendAndAwaitConfirmation(ocppId, is16 ? 'ChangeConfiguration' : 'SetVariables', url, body);
    if (!dispatched) return res.status(502).json({ error: 'No se pudo comunicar con el cargador.' });
    if (!payload) return res.status(504).json({ error: 'El cargador no respondio a tiempo.' });

    const status = is16 ? payload.status : payload.setVariableResult?.[0]?.attributeStatus;
    res.json({ ok: status === 'Accepted', status });
  } catch (err) {
    console.error('Error cambiando configuracion OCPP:', err);
    res.status(502).json({ error: 'No se pudo comunicar con CitrineOS.' });
  }
});

router.get('/cargadores/:ocppId/ocpp-log', requirePermission('admin_cargadores_avanzado'), async (req, res) => {
  const ocppId = req.params.ocppId;
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const STATE_LABELS = { 1: 'Enviado (CALL)', 2: 'Confirmado (CALLRESULT)', 4: 'Error (CALLERROR)' };
  const result = await pool.query(
    `SELECT action, state, message, "timestamp"
     FROM "OCPPMessages"
     WHERE "stationId" = $1
     ORDER BY "timestamp" DESC
     LIMIT $2`,
    [ocppId, limit],
  );
  res.json(result.rows.map((r) => {
    // Formato OCPP-J: CALL = [type, id, action, payload] (payload en [3]),
    // CALLRESULT/CALLERROR = [type, id, payload] (payload en [2]). Ademas
    // CitrineOS a veces persiste "message" como STRING en vez de array
    // cuando no logra correlacionar una respuesta malformada (visto en vivo
    // con nuestro propio hardware-sim, que no implementa GetVariables) - en
    // ese caso no hay payload util que extraer, se muestra el string crudo.
    const isArray = Array.isArray(r.message);
    const payload = isArray ? r.message[r.state === '1' ? 3 : 2] : r.message;
    return {
      action: r.action,
      estado: STATE_LABELS[r.state] ?? r.state,
      contenido: payload ?? null,
      timestamp: r.timestamp,
    };
  }));
});

// Alarmas historicas: solo status='Faulted' se guarda (ver listener/index.js
// handleStatusNotification) - el estado en vivo de cualquier otra transicion
// ya lo cubre cargador_estado_actual, esto es historial de fallas reales.
router.get('/cargadores/:ocppId/alarmas', requirePermission('admin_cargadores_avanzado'), async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const result = await pool.query(
    `SELECT id, status_ocpp, error_code, creado_en
     FROM cargador_alarmas WHERE cargador_ocpp_id = $1
     ORDER BY creado_en DESC LIMIT $2`,
    [req.params.ocppId, limit],
  );
  res.json(result.rows);
});

// ---------------------------------------------------------------------------
// Reservations (ReserveNow/CancelReservation) - solo cargadores OCPP 2.0.1:
// CitrineOS no expone reserveNow/cancelReservation por REST para 1.6
// (confirmado via /docs/json, el bridge 1.6 solo tiene remoteStart/Stop/
// unlockConnector/clearCache). Superadmin only por el mismo criterio que
// Configuration/OCPP Log arriba - accion real sobre un equipo en produccion.
// ---------------------------------------------------------------------------

router.post('/cargadores/:ocppId/reservas', requirePermission('admin_cargadores_avanzado'), async (req, res) => {
  const ocppId = req.params.ocppId;
  const { ufId, idTagOcpp, expiraEn } = req.body ?? {};
  if (!idTagOcpp || !expiraEn) {
    return res.status(400).json({ error: 'idTagOcpp y expiraEn son requeridos.' });
  }
  const cargador = await pool.query('SELECT id, consorcio_id FROM cargadores WHERE ocpp_id = $1', [ocppId]);
  if (cargador.rowCount === 0) return res.status(404).json({ error: 'Cargador no encontrado.' });

  const version = await getOcppVersion(ocppId);
  if (version !== '2.0.1') {
    return res.status(400).json({ error: 'Reservations solo soportado en cargadores OCPP 2.0.1 por ahora (CitrineOS no expone reserveNow para 1.6).' });
  }

  const reserva = await pool.query(
    `INSERT INTO reservas (cargador_ocpp_id, consorcio_id, uf_id, id_tag_ocpp, expira_en, creado_por)
     VALUES ($1, $2, $3, $4, $5, 'admin') RETURNING id`,
    [ocppId, cargador.rows[0].consorcio_id, ufId ?? null, idTagOcpp, expiraEn],
  );
  const reservaId = reserva.rows[0].id;

  const url = `${CITRINEOS_REST_URL}/ocpp/2.0.1/evdriver/reserveNow?identifier=${encodeURIComponent(ocppId)}&tenantId=1`;
  const body = { id: reservaId, expiryDateTime: expiraEn, idToken: { idToken: idTagOcpp, type: 'ISO14443' }, evseId: 1 };
  try {
    const { dispatched, payload } = await sendAndAwaitConfirmation(ocppId, 'ReserveNow', url, body);
    if (!dispatched) {
      await pool.query(`UPDATE reservas SET estado = 'rechazada' WHERE id = $1`, [reservaId]);
      return res.status(502).json({ error: 'No se pudo comunicar con el cargador.' });
    }
    const status = payload?.status ?? null;
    if (status !== 'Accepted') {
      await pool.query(`UPDATE reservas SET estado = 'rechazada' WHERE id = $1`, [reservaId]);
      return res.status(409).json({ error: `El cargador rechazo la reserva: ${status ?? 'sin confirmacion'}` });
    }
    res.status(201).json({ id: reservaId, ok: true, status });
  } catch (err) {
    await pool.query(`UPDATE reservas SET estado = 'rechazada' WHERE id = $1`, [reservaId]);
    console.error('Error creando reserva OCPP:', err);
    res.status(502).json({ error: 'No se pudo comunicar con CitrineOS.' });
  }
});

router.delete('/reservas/:id', requirePermission('admin_cargadores_avanzado'), async (req, res) => {
  const reserva = await pool.query(`SELECT id, cargador_ocpp_id FROM reservas WHERE id = $1 AND estado = 'activa'`, [req.params.id]);
  if (reserva.rowCount === 0) return res.status(404).json({ error: 'Reserva no encontrada o ya no esta activa.' });

  const ocppId = reserva.rows[0].cargador_ocpp_id;
  const url = `${CITRINEOS_REST_URL}/ocpp/2.0.1/evdriver/cancelReservation?identifier=${encodeURIComponent(ocppId)}&tenantId=1`;
  try {
    await sendAndAwaitConfirmation(ocppId, 'CancelReservation', url, { reservationId: Number(req.params.id) });
  } catch (err) {
    console.warn('Error cancelando reserva en el cargador (se cancela igual en nuestra DB):', err.message);
  }
  await pool.query(`UPDATE reservas SET estado = 'cancelada' WHERE id = $1`, [req.params.id]);
  res.json({ ok: true });
});

router.get('/consorcios/:id/reservas', async (req, res) => {
  const result = await pool.query(
    `SELECT r.id, r.cargador_ocpp_id, r.uf_id, r.id_tag_ocpp, r.expira_en, r.estado, r.creado_por, r.creado_en,
            uf.numero_departamento, uf.numero_cochera
     FROM reservas r
     LEFT JOIN unidades_funcionales uf ON uf.id = r.uf_id
     WHERE r.consorcio_id = $1
     ORDER BY r.creado_en DESC LIMIT 100`,
    [req.params.id],
  );
  res.json(result.rows);
});

// ---------------------------------------------------------------------------
// System User (RBAC acotado) - CRUD sobre la tabla usuarios ya existente,
// SIN tocar requireRole ni el CHECK constraint de usuarios.rol. Full RBAC
// dinamico (permisos granulares editables) requeriria reescribir el modelo
// de autorizacion de toda la app (26 call sites de requireRole) - fuera de
// alcance por riesgo, ver analisis-plataforma-grasen.md seccion 5 y el plan
// de esta sesion. Solo roles "admin-facing" (superadmin/instalador/
// comercial) - residente/proveedor/consorcio_admin ya se gestionan en sus
// propios flujos (alta de UF, alta de consorcio, alta de proveedor).
// ---------------------------------------------------------------------------
const ROLES_SYSTEM_USER = ['superadmin', 'instalador', 'comercial'];
const INVITE_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://192.168.1.38';

router.get('/usuarios', requirePermission('admin_sistema_usuarios'), async (_req, res) => {
  const result = await pool.query(
    `SELECT id, email, nombre, rol, activo, creado_en
     FROM usuarios WHERE rol = ANY($1) ORDER BY creado_en DESC`,
    [ROLES_SYSTEM_USER],
  );
  res.json(result.rows);
});

router.post('/usuarios', requirePermission('admin_sistema_usuarios'), async (req, res) => {
  const { email, nombre, rol } = req.body ?? {};
  if (!email || !ROLES_SYSTEM_USER.includes(rol)) {
    return res.status(400).json({ error: `email requerido y rol debe ser uno de: ${ROLES_SYSTEM_USER.join(', ')}.` });
  }
  const inviteToken = generateToken();
  const inviteExpires = new Date(Date.now() + INVITE_TOKEN_TTL_MS);
  try {
    const result = await pool.query(
      `INSERT INTO usuarios (email, nombre, rol, reset_token, reset_token_expires)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, email, nombre, rol, activo, creado_en`,
      [email, nombre ?? null, rol, inviteToken, inviteExpires],
    );
    await sendMail({
      to: email,
      subject: 'Bienvenido a CSMS - acceso al panel',
      html: `<p>Se creo una cuenta de ${rol} para vos.</p>
             <p>Elegi tu contrasena para empezar (link valido 7 dias):</p>
             <p><a href="${FRONTEND_URL}/reset-password?token=${inviteToken}">${FRONTEND_URL}/reset-password?token=${inviteToken}</a></p>`,
    });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: `Ya existe un usuario con email "${email}".` });
    throw err;
  }
});

router.put('/usuarios/:id', requirePermission('admin_sistema_usuarios'), async (req, res) => {
  const { activo, rol } = req.body ?? {};
  if (rol !== undefined && !ROLES_SYSTEM_USER.includes(rol)) {
    return res.status(400).json({ error: `rol debe ser uno de: ${ROLES_SYSTEM_USER.join(', ')}.` });
  }
  const result = await pool.query(
    `UPDATE usuarios SET activo = COALESCE($1, activo), rol = COALESCE($2, rol)
     WHERE id = $3 AND rol = ANY($4) RETURNING id, email, nombre, rol, activo, creado_en`,
    [activo ?? null, rol ?? null, req.params.id, ROLES_SYSTEM_USER],
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Usuario no encontrado.' });
  res.json(result.rows[0]);
});

// ---------------------------------------------------------------------------
// Firmware update remoto (UpdateFirmware) y Diagnostico remoto (GetLog).
// El archivo en si (firmware que el cargador baja, log que el cargador sube)
// vive en public.js SIN auth - los cargadores no mandan Bearer token - ver
// comentario alli. Aca solo el dispatch OCPP y el historial, gateado a
// superadmin como el resto de las acciones sensibles sobre un equipo real.
// ---------------------------------------------------------------------------
const FIRMWARE_DIR = path.join(__dirname, '..', '..', 'uploads', 'firmware');
fs.mkdirSync(FIRMWARE_DIR, { recursive: true });
const DIAGNOSTICOS_DIR = path.join(__dirname, '..', '..', 'uploads', 'diagnosticos');
const uploadFirmware = multer({ storage: multer.diskStorage({ destination: FIRMWARE_DIR }), limits: { fileSize: 100 * 1024 * 1024 } });
// Dominio publico real (nginx enruta /api/* a este backend) - el cargador
// necesita una URL alcanzable desde afuera, no el nombre del contenedor.
const BACKEND_PUBLIC_URL = process.env.BACKEND_PUBLIC_URL || 'https://bilon.pagarqr.ar/api';

router.post('/firmware', requirePermission('admin_firmware_ota'), uploadFirmware.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Falta el archivo.' });
  res.status(201).json({ filename: req.file.filename, originalName: req.file.originalname });
});

router.post('/cargadores/:ocppId/firmware', requirePermission('admin_firmware_ota'), async (req, res) => {
  const ocppId = req.params.ocppId;
  const { filename } = req.body ?? {};
  if (!filename) return res.status(400).json({ error: 'filename es requerido (subir primero via POST /admin/firmware).' });
  if (!fs.existsSync(path.join(FIRMWARE_DIR, filename))) return res.status(404).json({ error: 'Archivo no encontrado.' });

  const version = await getOcppVersion(ocppId);
  const is16 = version === '1.6';
  const location = `${BACKEND_PUBLIC_URL}/public/firmware/${encodeURIComponent(filename)}`;
  const requestId = Date.now() % 1000000;
  const url = is16
    ? `${CITRINEOS_REST_URL}/ocpp/1.6/configuration/updateFirmware?identifier=${encodeURIComponent(ocppId)}&tenantId=1`
    : `${CITRINEOS_REST_URL}/ocpp/2.0.1/configuration/updateFirmware?identifier=${encodeURIComponent(ocppId)}&tenantId=1`;
  const body = is16
    ? { location, retrieveDate: new Date().toISOString() }
    : { requestId, firmware: { location, retrieveDateTime: new Date().toISOString() } };

  const record = await pool.query(
    `INSERT INTO firmware_updates (cargador_ocpp_id, filename) VALUES ($1, $2) RETURNING id`,
    [ocppId, filename],
  );
  try {
    const { dispatched, payload } = await sendAndAwaitConfirmation(ocppId, 'UpdateFirmware', url, body);
    const status = !dispatched ? 'Error de comunicacion' : (payload?.status ?? 'Enviado (sin confirmar)');
    await pool.query('UPDATE firmware_updates SET status = $1 WHERE id = $2', [status, record.rows[0].id]);
    res.status(201).json({ id: record.rows[0].id, status });
  } catch (err) {
    await pool.query(`UPDATE firmware_updates SET status = 'Error' WHERE id = $1`, [record.rows[0].id]);
    console.error('Error dispatcheando UpdateFirmware:', err);
    res.status(502).json({ error: 'No se pudo comunicar con CitrineOS.' });
  }
});

router.get('/cargadores/:ocppId/firmware', requirePermission('admin_firmware_ota'), async (req, res) => {
  const result = await pool.query(
    `SELECT id, filename, version_reportada, status, creado_en FROM firmware_updates
     WHERE cargador_ocpp_id = $1 ORDER BY creado_en DESC LIMIT 50`,
    [req.params.ocppId],
  );
  res.json(result.rows);
});

router.post('/cargadores/:ocppId/diagnostico', requirePermission('admin_firmware_ota'), async (req, res) => {
  const ocppId = req.params.ocppId;
  const record = await pool.query(
    `INSERT INTO diagnosticos (cargador_ocpp_id) VALUES ($1) RETURNING id`,
    [ocppId],
  );
  const diagnosticoId = record.rows[0].id;

  const version = await getOcppVersion(ocppId);
  const is16 = version === '1.6';
  const remoteLocation = `${BACKEND_PUBLIC_URL}/public/diagnosticos/${diagnosticoId}/upload`;
  const requestId = Date.now() % 1000000;
  const url = is16
    ? `${CITRINEOS_REST_URL}/ocpp/1.6/reporting/getDiagnostics?identifier=${encodeURIComponent(ocppId)}&tenantId=1`
    : `${CITRINEOS_REST_URL}/ocpp/2.0.1/reporting/getLog?identifier=${encodeURIComponent(ocppId)}&tenantId=1`;
  const body = is16
    ? { location: remoteLocation }
    : { requestId, logType: 'DiagnosticsLog', log: { remoteLocation } };

  try {
    const { dispatched, payload } = await sendAndAwaitConfirmation(ocppId, is16 ? 'GetDiagnostics' : 'GetLog', url, body);
    const status = !dispatched ? 'Error de comunicacion' : (payload?.status ?? 'Enviado (sin confirmar)');
    await pool.query('UPDATE diagnosticos SET status = $1 WHERE id = $2', [status, diagnosticoId]);
    res.status(201).json({ id: diagnosticoId, status });
  } catch (err) {
    await pool.query(`UPDATE diagnosticos SET status = 'Error' WHERE id = $1`, [diagnosticoId]);
    console.error('Error dispatcheando GetLog/GetDiagnostics:', err);
    res.status(502).json({ error: 'No se pudo comunicar con CitrineOS.' });
  }
});

router.get('/cargadores/:ocppId/diagnosticos', requirePermission('admin_firmware_ota'), async (req, res) => {
  const result = await pool.query(
    `SELECT id, status, filename, creado_en FROM diagnosticos
     WHERE cargador_ocpp_id = $1 ORDER BY creado_en DESC LIMIT 50`,
    [req.params.ocppId],
  );
  res.json(result.rows);
});

router.get('/diagnosticos/:id/descargar', requirePermission('admin_firmware_ota'), async (req, res) => {
  const diagnostico = await pool.query('SELECT filename FROM diagnosticos WHERE id = $1', [req.params.id]);
  const filename = diagnostico.rows[0]?.filename;
  if (!filename) return res.status(404).end();
  res.sendFile(path.join(DIAGNOSTICOS_DIR, filename));
});

// ---------------------------------------------------------------------------
// Facturacion Bilon (canon, mantenimiento, backup 4g, cargos puntuales) -
// separada por completo de liquidacion_sesiones (electricidad interna del
// edificio, que Bilon nunca factura, solo reporta). Ver schema_facturacion_bilon.sql.
// ---------------------------------------------------------------------------

function periodoValido(periodo) {
  return typeof periodo === 'string' && /^\d{4}-\d{2}$/.test(periodo);
}

// Reporte de electricidad por UF, para que el administrador lo impute en sus
// propias expensas. Bilon no cobra esto - los montos ya quedaron fijados por
// sesion en liquidacion_sesiones (precio_kwh_aplicado al momento de cada carga).
router.get('/consorcios/:id/reporte-electrico', async (req, res) => {
  const { periodo } = req.query;
  if (!periodoValido(periodo)) {
    return res.status(400).json({ error: 'periodo debe tener formato YYYY-MM.' });
  }
  const result = await pool.query(
    `SELECT uf.id AS uf_id, uf.numero_departamento, uf.numero_cochera,
            COALESCE(SUM(ls.kwh_consumidos), 0) AS kwh_totales,
            COALESCE(SUM(ls.monto_total_expensa), 0) AS monto_sugerido,
            COUNT(ls.id) AS sesiones
     FROM unidades_funcionales uf
     LEFT JOIN liquidacion_sesiones ls
       ON ls.uf_id = uf.id AND ls.periodo_expensa = $2 AND ls.fecha_fin IS NOT NULL
     WHERE uf.consorcio_id = $1
     GROUP BY uf.id, uf.numero_departamento, uf.numero_cochera
     HAVING COUNT(ls.id) > 0
     ORDER BY uf.numero_departamento NULLS LAST, uf.numero_cochera NULLS LAST`,
    [req.params.id, periodo],
  );
  res.json(result.rows);
});

// Abono items (canon fijo por cochera, mantenimiento, backup 4g, etc)
router.get('/consorcios/:id/abono-items', async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM abono_items WHERE consorcio_id = $1 ORDER BY creado_en',
    [req.params.id],
  );
  res.json(result.rows);
});

const TIPOS_ABONO_ITEM = ['fijo_por_edificio', 'fijo_por_cochera', 'prorrateado_activos', 'unico'];

router.post('/consorcios/:id/abono-items', async (req, res) => {
  const {
    nombre, tipo, monto, recurrente,
  } = req.body ?? {};
  if (!nombre || !TIPOS_ABONO_ITEM.includes(tipo) || monto == null) {
    return res.status(400).json({ error: `nombre, monto y tipo (uno de ${TIPOS_ABONO_ITEM.join(', ')}) son requeridos.` });
  }
  const result = await pool.query(
    `INSERT INTO abono_items (consorcio_id, nombre, tipo, monto, recurrente)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [req.params.id, nombre, tipo, monto, recurrente !== false],
  );
  res.status(201).json(result.rows[0]);
});

router.put('/abono-items/:id', async (req, res) => {
  const {
    nombre, tipo, monto, recurrente, activo,
  } = req.body ?? {};
  if (tipo && !TIPOS_ABONO_ITEM.includes(tipo)) {
    return res.status(400).json({ error: `tipo debe ser uno de ${TIPOS_ABONO_ITEM.join(', ')}.` });
  }
  const result = await pool.query(
    `UPDATE abono_items SET
       nombre = COALESCE($1, nombre), tipo = COALESCE($2, tipo), monto = COALESCE($3, monto),
       recurrente = COALESCE($4, recurrente), activo = COALESCE($5, activo)
     WHERE id = $6 RETURNING *`,
    [nombre ?? null, tipo ?? null, monto ?? null, recurrente ?? null, activo ?? null, req.params.id],
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Item no encontrado.' });
  res.json(result.rows[0]);
});

router.delete('/abono-items/:id', async (req, res) => {
  const result = await pool.query('DELETE FROM abono_items WHERE id = $1', [req.params.id]);
  if (result.rowCount === 0) return res.status(404).json({ error: 'Item no encontrado.' });
  res.status(204).end();
});

// Catalogo de plantillas de abono (valores predeterminados) - solo superadmin,
// el instalador no toca precios.
router.get('/abono-items-catalogo', requireRole('superadmin'), async (_req, res) => {
  const result = await pool.query('SELECT * FROM abono_items_catalogo ORDER BY nombre');
  res.json(result.rows);
});

router.post('/abono-items-catalogo', requireRole('superadmin'), async (req, res) => {
  const {
    nombre, tipo, monto_sugerido, tipo_cliente,
  } = req.body ?? {};
  if (!nombre || !TIPOS_ABONO_ITEM.includes(tipo) || monto_sugerido == null) {
    return res.status(400).json({ error: `nombre, monto_sugerido y tipo (uno de ${TIPOS_ABONO_ITEM.join(', ')}) son requeridos.` });
  }
  if (tipo_cliente && !['residencial', 'comercial'].includes(tipo_cliente)) {
    return res.status(400).json({ error: 'tipo_cliente invalido.' });
  }
  const result = await pool.query(
    `INSERT INTO abono_items_catalogo (nombre, tipo, monto_sugerido, tipo_cliente)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [nombre, tipo, monto_sugerido, tipo_cliente ?? null],
  );
  res.status(201).json(result.rows[0]);
});

router.put('/abono-items-catalogo/:id', requireRole('superadmin'), async (req, res) => {
  const {
    nombre, tipo, monto_sugerido, tipo_cliente, activo,
  } = req.body ?? {};
  if (tipo && !TIPOS_ABONO_ITEM.includes(tipo)) {
    return res.status(400).json({ error: `tipo debe ser uno de ${TIPOS_ABONO_ITEM.join(', ')}.` });
  }
  const result = await pool.query(
    `UPDATE abono_items_catalogo SET
       nombre = COALESCE($1, nombre), tipo = COALESCE($2, tipo), monto_sugerido = COALESCE($3, monto_sugerido),
       tipo_cliente = CASE WHEN $6 THEN $4 ELSE tipo_cliente END, activo = COALESCE($5, activo)
     WHERE id = $7 RETURNING *`,
    [nombre ?? null, tipo ?? null, monto_sugerido ?? null, tipo_cliente ?? null, activo ?? null, 'tipo_cliente' in (req.body ?? {}), req.params.id],
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Plantilla no encontrada.' });
  res.json(result.rows[0]);
});

router.delete('/abono-items-catalogo/:id', requireRole('superadmin'), async (req, res) => {
  const result = await pool.query('DELETE FROM abono_items_catalogo WHERE id = $1', [req.params.id]);
  if (result.rowCount === 0) return res.status(404).json({ error: 'Plantilla no encontrada.' });
  res.status(204).end();
});

// Clona las plantillas del catalogo (activas, y que apliquen al tipo_cliente
// de este edificio o sean genericas) como abono_items propios del consorcio,
// editables despues sin afectar el catalogo.
router.post('/consorcios/:id/abono-items/clonar-catalogo', requireRole('superadmin'), async (req, res) => {
  const { catalogo_ids: catalogoIds } = req.body ?? {};
  const consorcio = await pool.query('SELECT tipo_cliente FROM consorcios WHERE id = $1', [req.params.id]);
  if (consorcio.rowCount === 0) return res.status(404).json({ error: 'Consorcio no encontrado.' });
  const tipoCliente = consorcio.rows[0].tipo_cliente;

  const plantillas = Array.isArray(catalogoIds) && catalogoIds.length > 0
    ? await pool.query('SELECT * FROM abono_items_catalogo WHERE activo = TRUE AND id = ANY($1::int[])', [catalogoIds])
    : await pool.query(
      'SELECT * FROM abono_items_catalogo WHERE activo = TRUE AND (tipo_cliente IS NULL OR tipo_cliente = $1)',
      [tipoCliente],
    );
  const creados = [];
  for (const p of plantillas.rows) {
    const result = await pool.query(
      `INSERT INTO abono_items (consorcio_id, nombre, tipo, monto, catalogo_id)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.params.id, p.nombre, p.tipo, p.monto_sugerido, p.id],
    );
    creados.push(result.rows[0]);
  }
  res.status(201).json(creados);
});

// Ajuste masivo por porcentaje - accion manual (no cron), pensada para el
// cierre de fin de mes. consorcio_id ausente = aplica a TODOS los edificios.
router.post('/abono-items/ajuste-masivo', requireRole('superadmin'), async (req, res) => {
  const { porcentaje, consorcio_id: consorcioId } = req.body ?? {};
  if (typeof porcentaje !== 'number' || porcentaje === 0) {
    return res.status(400).json({ error: 'porcentaje es requerido y debe ser distinto de 0.' });
  }
  const result = await pool.query(
    `UPDATE abono_items SET monto = ROUND(monto * (1 + $1::numeric / 100), 2)
     WHERE activo = TRUE AND ($2::int IS NULL OR consorcio_id = $2)
     RETURNING *`,
    [porcentaje, consorcioId ?? null],
  );
  res.json({ actualizados: result.rowCount, items: result.rows });
});

router.post('/abono-items-catalogo/ajuste-masivo', requireRole('superadmin'), async (req, res) => {
  const { porcentaje } = req.body ?? {};
  if (typeof porcentaje !== 'number' || porcentaje === 0) {
    return res.status(400).json({ error: 'porcentaje es requerido y debe ser distinto de 0.' });
  }
  const result = await pool.query(
    `UPDATE abono_items_catalogo SET monto_sugerido = ROUND(monto_sugerido * (1 + $1::numeric / 100), 2)
     WHERE activo = TRUE RETURNING *`,
    [porcentaje],
  );
  res.json({ actualizados: result.rowCount, items: result.rows });
});

// Cargos puntuales (visita tecnica, reparacion) - uf_id null = va al administrador.
router.get('/consorcios/:id/cargos-puntuales', async (req, res) => {
  const { periodo } = req.query;
  const result = await pool.query(
    periodo
      ? `SELECT cp.*, uf.numero_departamento, uf.numero_cochera FROM cargos_puntuales cp
         LEFT JOIN unidades_funcionales uf ON uf.id = cp.uf_id
         WHERE cp.consorcio_id = $1 AND cp.periodo = $2 ORDER BY cp.creado_en DESC`
      : `SELECT cp.*, uf.numero_departamento, uf.numero_cochera FROM cargos_puntuales cp
         LEFT JOIN unidades_funcionales uf ON uf.id = cp.uf_id
         WHERE cp.consorcio_id = $1 ORDER BY cp.creado_en DESC LIMIT 100`,
    periodo ? [req.params.id, periodo] : [req.params.id],
  );
  res.json(result.rows);
});

router.post('/consorcios/:id/cargos-puntuales', async (req, res) => {
  const {
    uf_id, descripcion, monto, periodo,
  } = req.body ?? {};
  if (!descripcion || monto == null || !periodoValido(periodo)) {
    return res.status(400).json({ error: 'descripcion, monto y periodo (YYYY-MM) son requeridos.' });
  }
  if (uf_id) {
    const uf = await pool.query('SELECT id FROM unidades_funcionales WHERE id = $1 AND consorcio_id = $2', [uf_id, req.params.id]);
    if (uf.rowCount === 0) return res.status(404).json({ error: 'Unidad funcional no encontrada en este consorcio.' });
  }
  const result = await pool.query(
    `INSERT INTO cargos_puntuales (consorcio_id, uf_id, descripcion, monto, periodo, creado_por)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [req.params.id, uf_id ?? null, descripcion, monto, periodo, req.user.sub],
  );
  res.status(201).json(result.rows[0]);
});

router.delete('/cargos-puntuales/:id', async (req, res) => {
  const result = await pool.query('DELETE FROM cargos_puntuales WHERE id = $1', [req.params.id]);
  if (result.rowCount === 0) return res.status(404).json({ error: 'Cargo no encontrado.' });
  res.status(204).end();
});

// Genera (o regenera, si no esta pagada) las facturas Bilon de un periodo.
// modo 'administrador': una sola factura al consorcio con todo.
// modo 'propietario_directo': una factura por UF con cargador (canon +
// prorrateo + sus cargos puntuales) + una factura al consorcio con los items
// fijo_por_edificio y los cargos puntuales sin UF asignada (gastos compartidos).
router.post('/consorcios/:id/facturas/generar', async (req, res) => {
  const { periodo } = req.body ?? {};
  if (!periodoValido(periodo)) {
    return res.status(400).json({ error: 'periodo debe tener formato YYYY-MM.' });
  }
  const consorcio = await pool.query('SELECT modo_facturacion FROM consorcios WHERE id = $1', [req.params.id]);
  if (consorcio.rowCount === 0) return res.status(404).json({ error: 'Consorcio no encontrado.' });
  const modo = consorcio.rows[0].modo_facturacion;

  const items = (await pool.query(
    'SELECT * FROM abono_items WHERE consorcio_id = $1 AND activo = TRUE AND recurrente = TRUE',
    [req.params.id],
  )).rows;
  const itemsPorTipo = Object.fromEntries(TIPOS_ABONO_ITEM.map((t) => [t, items.filter((i) => i.tipo === t)]));

  const cargosSinUf = (await pool.query(
    'SELECT * FROM cargos_puntuales WHERE consorcio_id = $1 AND periodo = $2 AND uf_id IS NULL',
    [req.params.id, periodo],
  )).rows;

  async function upsertFactura(ufId, detalle) {
    const montoTotal = detalle.reduce((sum, d) => sum + Number(d.monto), 0);
    if (montoTotal <= 0) return null;
    const result = await pool.query(
      `INSERT INTO facturas_bilon (consorcio_id, uf_id, periodo, detalle, monto_total)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (consorcio_id, COALESCE(uf_id, 0), periodo) DO UPDATE SET
         detalle = EXCLUDED.detalle, monto_total = EXCLUDED.monto_total
       WHERE facturas_bilon.estado = 'pendiente'
       RETURNING *`,
      [req.params.id, ufId, periodo, JSON.stringify(detalle), montoTotal],
    );
    return result.rows[0] ?? null;
  }

  const generadas = [];

  if (modo === 'administrador') {
    const cantidadCargadores = Number((await pool.query(
      'SELECT COUNT(*) AS n FROM cargadores WHERE consorcio_id = $1', [req.params.id],
    )).rows[0].n);
    const detalle = [
      ...itemsPorTipo.fijo_por_edificio.map((i) => ({ concepto: i.nombre, monto: Number(i.monto) })),
      ...itemsPorTipo.fijo_por_cochera.map((i) => ({
        concepto: `${i.nombre} x${cantidadCargadores}`, monto: Number(i.monto) * cantidadCargadores,
      })),
      ...itemsPorTipo.prorrateado_activos.map((i) => ({ concepto: i.nombre, monto: Number(i.monto) })),
      ...cargosSinUf.map((c) => ({ concepto: c.descripcion, monto: Number(c.monto) })),
      ...(await pool.query(
        'SELECT descripcion, monto FROM cargos_puntuales WHERE consorcio_id = $1 AND periodo = $2 AND uf_id IS NOT NULL',
        [req.params.id, periodo],
      )).rows.map((c) => ({ concepto: c.descripcion, monto: Number(c.monto) })),
    ];
    const f = await upsertFactura(null, detalle);
    if (f) generadas.push(f);
  } else {
    const ufsConCargador = (await pool.query(
      `SELECT uf.id, COUNT(ca.id) AS n_cargadores FROM unidades_funcionales uf
       JOIN cargadores ca ON ca.uf_id = uf.id
       WHERE uf.consorcio_id = $1 GROUP BY uf.id`,
      [req.params.id],
    )).rows;

    const montoProrrateadoPorUf = ufsConCargador.length > 0
      ? itemsPorTipo.prorrateado_activos.reduce((sum, i) => sum + Number(i.monto), 0) / ufsConCargador.length
      : 0;

    for (const { id: ufId, n_cargadores: nCargadores } of ufsConCargador) {
      const cargosUf = (await pool.query(
        'SELECT descripcion, monto FROM cargos_puntuales WHERE consorcio_id = $1 AND periodo = $2 AND uf_id = $3',
        [req.params.id, periodo, ufId],
      )).rows;
      const detalle = [
        ...itemsPorTipo.fijo_por_cochera.map((i) => ({
          concepto: `${i.nombre} x${nCargadores}`, monto: Number(i.monto) * Number(nCargadores),
        })),
        ...(montoProrrateadoPorUf > 0
          ? [{ concepto: 'Backup / items compartidos (prorrateado)', monto: Number(montoProrrateadoPorUf.toFixed(2)) }]
          : []),
        ...cargosUf.map((c) => ({ concepto: c.descripcion, monto: Number(c.monto) })),
      ];
      const f = await upsertFactura(ufId, detalle);
      if (f) generadas.push(f);
    }

    const detalleConsorcio = [
      ...itemsPorTipo.fijo_por_edificio.map((i) => ({ concepto: i.nombre, monto: Number(i.monto) })),
      ...cargosSinUf.map((c) => ({ concepto: c.descripcion, monto: Number(c.monto) })),
    ];
    const fConsorcio = await upsertFactura(null, detalleConsorcio);
    if (fConsorcio) generadas.push(fConsorcio);
  }

  res.status(201).json(generadas);
});

router.get('/consorcios/:id/facturas', async (req, res) => {
  const { periodo } = req.query;
  const result = await pool.query(
    periodo
      ? `SELECT fb.*, uf.numero_departamento, uf.numero_cochera FROM facturas_bilon fb
         LEFT JOIN unidades_funcionales uf ON uf.id = fb.uf_id
         WHERE fb.consorcio_id = $1 AND fb.periodo = $2 ORDER BY fb.uf_id NULLS FIRST`
      : `SELECT fb.*, uf.numero_departamento, uf.numero_cochera FROM facturas_bilon fb
         LEFT JOIN unidades_funcionales uf ON uf.id = fb.uf_id
         WHERE fb.consorcio_id = $1 ORDER BY fb.periodo DESC, fb.uf_id NULLS FIRST LIMIT 200`,
    periodo ? [req.params.id, periodo] : [req.params.id],
  );
  res.json(result.rows);
});

router.put('/facturas/:id', async (req, res) => {
  const { estado, detalle } = req.body ?? {};

  if (detalle !== undefined) {
    if (!Array.isArray(detalle) || detalle.length === 0) {
      return res.status(400).json({ error: 'detalle debe ser una lista de items con concepto y monto.' });
    }
    const montoTotal = detalle.reduce((sum, d) => sum + Number(d.monto), 0);
    const result = await pool.query(
      `UPDATE facturas_bilon SET detalle = $1, monto_total = $2
       WHERE id = $3 AND estado = 'pendiente' RETURNING *`,
      [JSON.stringify(detalle), montoTotal, req.params.id],
    );
    if (result.rowCount === 0) {
      return res.status(409).json({ error: 'Solo se puede editar el detalle de una factura pendiente.' });
    }
    return res.json(result.rows[0]);
  }

  if (!['pendiente', 'pagada', 'anulada'].includes(estado)) {
    return res.status(400).json({ error: 'estado debe ser pendiente, pagada o anulada.' });
  }
  const result = await pool.query(
    `UPDATE facturas_bilon SET estado = $1, pagada_en = CASE WHEN $1 = 'pagada' THEN NOW() ELSE pagada_en END
     WHERE id = $2 RETURNING *`,
    [estado, req.params.id],
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Factura no encontrada.' });
  res.json(result.rows[0]);
});

// ---------------------------------------------------------------------------
// Stock / inventario - catalogo de productos, unidades serializadas (wallbox,
// medidor, router) y movimientos por cantidad (consumibles). Ver schema_stock.sql.
// Catalogo/ingreso: solo superadmin. Listar/consumir en una instalacion: los
// dos roles (el instalador elige el material que usa en cada instalacion).
// ---------------------------------------------------------------------------

const CATEGORIAS_PRODUCTO = ['wallbox', 'medidor', 'router', 'otro'];

router.get('/productos-catalogo', async (_req, res) => {
  const result = await pool.query(
    `SELECT p.*,
            CASE WHEN p.serializado
              THEN (SELECT COUNT(*) FROM stock_items si WHERE si.producto_id = p.id AND si.estado = 'en_stock')
              ELSE (SELECT COALESCE(SUM(CASE WHEN sm.tipo IN ('ingreso','devolucion') THEN sm.cantidad
                                              WHEN sm.tipo IN ('egreso_instalacion') THEN -sm.cantidad
                                              ELSE sm.cantidad END), 0)
                    FROM stock_movimientos sm WHERE sm.producto_id = p.id)
            END AS stock_disponible
     FROM productos_catalogo p ORDER BY p.categoria, p.marca, p.modelo`,
  );
  res.json(result.rows);
});

const FASES_WALLBOX = ['monofasico', 'trifasico'];
const CONECTORES_WALLBOX = ['type2', 'nacs'];
const MONTAJES_WALLBOX = ['pared', 'pie'];
const OCPP_PROTOCOLOS_WALLBOX = ['1.6', '2.0.1', 'ambos'];
const TIPOS_CORRIENTE_WALLBOX = ['AC', 'DC'];

router.post('/productos-catalogo', requireRole('superadmin'), async (req, res) => {
  const {
    categoria, marca, modelo, descripcion, serializado, unidad,
    potencia_kw: potenciaKw, fases, conector, montaje,
    ocpp_protocolo: ocppProtocolo, tipo_corriente: tipoCorriente,
  } = req.body ?? {};
  if (!CATEGORIAS_PRODUCTO.includes(categoria) || !modelo) {
    return res.status(400).json({ error: `categoria (${CATEGORIAS_PRODUCTO.join(', ')}) y modelo son requeridos.` });
  }
  if (fases && !FASES_WALLBOX.includes(fases)) {
    return res.status(400).json({ error: `fases debe ser una de ${FASES_WALLBOX.join(', ')}.` });
  }
  if (conector && !CONECTORES_WALLBOX.includes(conector)) {
    return res.status(400).json({ error: `conector debe ser uno de ${CONECTORES_WALLBOX.join(', ')}.` });
  }
  if (montaje && !MONTAJES_WALLBOX.includes(montaje)) {
    return res.status(400).json({ error: `montaje debe ser uno de ${MONTAJES_WALLBOX.join(', ')}.` });
  }
  if (ocppProtocolo && !OCPP_PROTOCOLOS_WALLBOX.includes(ocppProtocolo)) {
    return res.status(400).json({ error: `ocpp_protocolo debe ser uno de ${OCPP_PROTOCOLOS_WALLBOX.join(', ')}.` });
  }
  if (tipoCorriente && !TIPOS_CORRIENTE_WALLBOX.includes(tipoCorriente)) {
    return res.status(400).json({ error: `tipo_corriente debe ser uno de ${TIPOS_CORRIENTE_WALLBOX.join(', ')}.` });
  }
  const result = await pool.query(
    `INSERT INTO productos_catalogo (categoria, marca, modelo, descripcion, serializado, unidad, potencia_kw, fases, conector, montaje, ocpp_protocolo, tipo_corriente)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [categoria, marca ?? null, modelo, descripcion ?? null, serializado !== false, unidad || 'unidad',
      potenciaKw ?? null, fases ?? null, conector ?? null, montaje ?? null, ocppProtocolo ?? null, tipoCorriente ?? null],
  );
  res.status(201).json(result.rows[0]);
});

router.put('/productos-catalogo/:id', requireRole('superadmin'), async (req, res) => {
  const {
    categoria, marca, modelo, descripcion, activo,
    potencia_kw: potenciaKw, fases, conector, montaje,
    ocpp_protocolo: ocppProtocolo, tipo_corriente: tipoCorriente,
  } = req.body ?? {};
  if (categoria && !CATEGORIAS_PRODUCTO.includes(categoria)) {
    return res.status(400).json({ error: `categoria debe ser una de ${CATEGORIAS_PRODUCTO.join(', ')}.` });
  }
  if (fases && !FASES_WALLBOX.includes(fases)) {
    return res.status(400).json({ error: `fases debe ser una de ${FASES_WALLBOX.join(', ')}.` });
  }
  if (conector && !CONECTORES_WALLBOX.includes(conector)) {
    return res.status(400).json({ error: `conector debe ser uno de ${CONECTORES_WALLBOX.join(', ')}.` });
  }
  if (montaje && !MONTAJES_WALLBOX.includes(montaje)) {
    return res.status(400).json({ error: `montaje debe ser uno de ${MONTAJES_WALLBOX.join(', ')}.` });
  }
  if (ocppProtocolo && !OCPP_PROTOCOLOS_WALLBOX.includes(ocppProtocolo)) {
    return res.status(400).json({ error: `ocpp_protocolo debe ser uno de ${OCPP_PROTOCOLOS_WALLBOX.join(', ')}.` });
  }
  if (tipoCorriente && !TIPOS_CORRIENTE_WALLBOX.includes(tipoCorriente)) {
    return res.status(400).json({ error: `tipo_corriente debe ser uno de ${TIPOS_CORRIENTE_WALLBOX.join(', ')}.` });
  }
  const result = await pool.query(
    `UPDATE productos_catalogo SET
       categoria = COALESCE($1, categoria), marca = COALESCE($2, marca), modelo = COALESCE($3, modelo),
       descripcion = COALESCE($4, descripcion), activo = COALESCE($5, activo),
       potencia_kw = COALESCE($6, potencia_kw), fases = COALESCE($7, fases),
       conector = COALESCE($8, conector), montaje = COALESCE($9, montaje),
       ocpp_protocolo = COALESCE($10, ocpp_protocolo), tipo_corriente = COALESCE($11, tipo_corriente)
     WHERE id = $12 RETURNING *`,
    [categoria ?? null, marca ?? null, modelo ?? null, descripcion ?? null, activo ?? null,
      potenciaKw ?? null, fases ?? null, conector ?? null, montaje ?? null,
      ocppProtocolo ?? null, tipoCorriente ?? null, req.params.id],
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Producto no encontrado.' });
  res.json(result.rows[0]);
});

// Ingreso de unidades serializadas (wallbox/medidor/router) - acepta un array
// de identificadores para cargar un lote de una (ej: 10 wallbox importados).
router.post('/stock-items', requireRole('superadmin'), async (req, res) => {
  const {
    producto_id: productoId, identificadores, costo_compra: costoCompra, proveedor_id: proveedorId,
  } = req.body ?? {};
  if (!productoId || !Array.isArray(identificadores) || identificadores.length === 0) {
    return res.status(400).json({ error: 'producto_id e identificadores (array) son requeridos.' });
  }
  const creados = [];
  const errores = [];
  for (const identificador of identificadores) {
    try {
      const result = await pool.query(
        `INSERT INTO stock_items (producto_id, identificador, costo_compra, ingresado_por, proveedor_id)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [productoId, String(identificador).trim(), costoCompra ?? null, req.user.sub, proveedorId ?? null],
      );
      creados.push(result.rows[0]);
    } catch (err) {
      if (err.code === '23505') {
        errores.push({ identificador, error: 'Ya existe en stock.' });
      } else {
        throw err;
      }
    }
  }
  res.status(201).json({ creados, errores });
});

router.get('/stock-items', async (req, res) => {
  const {
    producto_id: productoId, estado, categoria,
  } = req.query;
  const conditions = [];
  const params = [];
  if (productoId) { params.push(productoId); conditions.push(`si.producto_id = $${params.length}`); }
  if (estado) { params.push(estado); conditions.push(`si.estado = $${params.length}`); }
  if (categoria) { params.push(categoria); conditions.push(`p.categoria = $${params.length}`); }
  const result = await pool.query(
    `SELECT si.*, p.categoria, p.marca, p.modelo,
            p.potencia_kw, p.fases, p.conector, p.montaje, p.ocpp_protocolo, p.tipo_corriente
     FROM stock_items si JOIN productos_catalogo p ON p.id = si.producto_id
     ${conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''}
     ORDER BY si.creado_en DESC LIMIT 500`,
    params,
  );
  res.json(result.rows);
});

router.put('/stock-items/:id', requireRole('superadmin'), async (req, res) => {
  const { estado, costo_compra: costoCompra } = req.body ?? {};
  if (estado && !['en_stock', 'instalado', 'devuelto', 'baja'].includes(estado)) {
    return res.status(400).json({ error: 'estado invalido.' });
  }
  const result = await pool.query(
    `UPDATE stock_items SET estado = COALESCE($1, estado), costo_compra = COALESCE($2, costo_compra)
     WHERE id = $3 RETURNING *`,
    [estado ?? null, costoCompra ?? null, req.params.id],
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Item de stock no encontrado.' });
  res.json(result.rows[0]);
});

// Movimientos de productos NO serializados (ingreso/ajuste manual - el
// egreso_instalacion se genera solo al crear una instalacion, ver abajo).
router.post('/stock-movimientos', requireRole('superadmin'), async (req, res) => {
  const {
    producto_id: productoId, tipo, cantidad, costo_unitario: costoUnitario, nota, proveedor_id: proveedorId,
  } = req.body ?? {};
  if (!productoId || !['ingreso', 'ajuste', 'devolucion'].includes(tipo) || !cantidad) {
    return res.status(400).json({ error: 'producto_id, tipo (ingreso/ajuste/devolucion) y cantidad son requeridos.' });
  }
  const result = await pool.query(
    `INSERT INTO stock_movimientos (producto_id, tipo, cantidad, costo_unitario, creado_por, nota, proveedor_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [productoId, tipo, cantidad, costoUnitario ?? null, req.user.sub, nota ?? null, proveedorId ?? null],
  );
  res.status(201).json(result.rows[0]);
});

// ---------------------------------------------------------------------------
// Proveedores comerciales (empresas a las que Bilon les compra material) -
// distinto de /superadmin/proveedores (fabricantes de wallbox probando su
// equipo, "Fabricas" en la UI). El historial de compras se arma leyendo
// stock_items/stock_movimientos por proveedor_id, no se duplica.
// ---------------------------------------------------------------------------

router.get('/proveedores', async (_req, res) => {
  const result = await pool.query('SELECT * FROM proveedores_comerciales ORDER BY activo DESC, nombre_empresa');
  res.json(result.rows);
});

router.post('/proveedores', requireRole('superadmin'), async (req, res) => {
  const {
    nombre_empresa: nombreEmpresa, cuit, contacto_nombre: contactoNombre,
    contacto_email: contactoEmail, contacto_telefono: contactoTelefono, direccion, nota,
  } = req.body ?? {};
  if (!nombreEmpresa) return res.status(400).json({ error: 'nombre_empresa es requerido.' });
  const result = await pool.query(
    `INSERT INTO proveedores_comerciales (nombre_empresa, cuit, contacto_nombre, contacto_email, contacto_telefono, direccion, nota)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [nombreEmpresa, cuit ?? null, contactoNombre ?? null, contactoEmail ?? null, contactoTelefono ?? null, direccion ?? null, nota ?? null],
  );
  res.status(201).json(result.rows[0]);
});

router.put('/proveedores/:id', requireRole('superadmin'), async (req, res) => {
  const {
    nombre_empresa: nombreEmpresa, cuit, contacto_nombre: contactoNombre,
    contacto_email: contactoEmail, contacto_telefono: contactoTelefono, direccion, nota, activo,
  } = req.body ?? {};
  const result = await pool.query(
    `UPDATE proveedores_comerciales SET
       nombre_empresa = COALESCE($1, nombre_empresa), cuit = COALESCE($2, cuit),
       contacto_nombre = COALESCE($3, contacto_nombre), contacto_email = COALESCE($4, contacto_email),
       contacto_telefono = COALESCE($5, contacto_telefono), direccion = COALESCE($6, direccion),
       nota = COALESCE($7, nota), activo = COALESCE($8, activo)
     WHERE id = $9 RETURNING *`,
    [nombreEmpresa ?? null, cuit ?? null, contactoNombre ?? null, contactoEmail ?? null,
      contactoTelefono ?? null, direccion ?? null, nota ?? null, activo ?? null, req.params.id],
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Proveedor no encontrado.' });
  res.json(result.rows[0]);
});

router.get('/proveedores/:id/compras', async (req, res) => {
  const result = await pool.query(
    `SELECT 'serializado' AS origen, si.creado_en AS fecha, p.marca, p.modelo, 1 AS cantidad, si.identificador, si.costo_compra AS costo
     FROM stock_items si JOIN productos_catalogo p ON p.id = si.producto_id
     WHERE si.proveedor_id = $1
     UNION ALL
     SELECT 'movimiento' AS origen, sm.creado_en AS fecha, p.marca, p.modelo, sm.cantidad, NULL AS identificador, sm.costo_unitario AS costo
     FROM stock_movimientos sm JOIN productos_catalogo p ON p.id = sm.producto_id
     WHERE sm.proveedor_id = $1 AND sm.tipo = 'ingreso'
     ORDER BY fecha DESC LIMIT 300`,
    [req.params.id],
  );
  res.json(result.rows);
});

router.get('/stock-movimientos', async (req, res) => {
  const { producto_id: productoId } = req.query;
  const result = await pool.query(
    productoId
      ? 'SELECT * FROM stock_movimientos WHERE producto_id = $1 ORDER BY creado_en DESC LIMIT 200'
      : 'SELECT * FROM stock_movimientos ORDER BY creado_en DESC LIMIT 200',
    productoId ? [productoId] : [],
  );
  res.json(result.rows);
});

// ---------------------------------------------------------------------------
// Instalaciones - lo que el instalador carga al terminar un trabajo. Consume
// stock (marca stock_items instalados, descuenta stock_movimientos) y despues
// puede facturarse (desglosado o kit resumido) via /instalaciones/:id/facturar.
// ---------------------------------------------------------------------------

router.get('/consorcios/:id/instalaciones', async (req, res) => {
  const result = await pool.query(
    `SELECT i.*, u.email AS instalador_email, uf.numero_departamento, uf.numero_cochera
     FROM instalaciones i
     LEFT JOIN usuarios u ON u.id = i.instalador_usuario_id
     LEFT JOIN unidades_funcionales uf ON uf.id = i.uf_id
     WHERE i.consorcio_id = $1 ORDER BY i.creado_en DESC`,
    [req.params.id],
  );
  res.json(result.rows);
});

router.get('/instalaciones/:id', async (req, res) => {
  const instalacion = await pool.query('SELECT * FROM instalaciones WHERE id = $1', [req.params.id]);
  if (instalacion.rowCount === 0) return res.status(404).json({ error: 'Instalacion no encontrada.' });
  const items = await pool.query(
    `SELECT ii.*, p.categoria, p.marca, p.modelo, si.identificador
     FROM instalacion_items ii
     JOIN productos_catalogo p ON p.id = ii.producto_id
     LEFT JOIN stock_items si ON si.id = ii.stock_item_id
     WHERE ii.instalacion_id = $1`,
    [req.params.id],
  );
  res.json({ ...instalacion.rows[0], items: items.rows });
});

// items: [{ producto_id, stock_item_id? (serializado), cantidad? (no serializado) }]
// Punto UNICO para instalar material (antes habia 2 caminos separados: el
// alta rapida de cargador en Unidades, que registraba el wallbox en OCPP sin
// trazar stock/factura, y esta ruta, que trazaba stock/factura sin registrar
// el wallbox en OCPP - quedaban desincronizados y el mismo item de stock
// aparecia disponible en un lado y no en el otro). Ahora: si el carrito
// incluye un wallbox, esta ruta tambien crea la fila en "cargadores".
router.post('/consorcios/:id/instalaciones', async (req, res) => {
  const { cochera_id: cocheraId, notas, items } = req.body ?? {};
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items (array, al menos 1) es requerido.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let ufId = null;
    if (cocheraId) {
      const cochera = await client.query(
        `SELECT coc.id, coc.uf_id FROM cocheras coc
         JOIN unidades_funcionales uf ON uf.id = coc.uf_id
         WHERE coc.id = $1 AND uf.consorcio_id = $2`,
        [cocheraId, req.params.id],
      );
      if (cochera.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Cochera no encontrada en este consorcio.' });
      }
      ufId = cochera.rows[0].uf_id;

      const yaOcupada = await client.query('SELECT id FROM cargadores WHERE cochera_id = $1', [cocheraId]);
      if (yaOcupada.rowCount > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Esta cochera ya tiene un wallbox asignado.' });
      }
    }

    // Resolver categoria de cada item antes de tocar la base - a lo sumo 1
    // wallbox por instalacion (1 instalacion = 1 cochera = 1 wallbox).
    const itemsConProducto = [];
    let wallboxCount = 0;
    for (const item of items) {
      const producto = await client.query('SELECT * FROM productos_catalogo WHERE id = $1', [item.producto_id]);
      if (producto.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: `Producto ${item.producto_id} no encontrado.` });
      }
      const p = producto.rows[0];
      if (p.categoria === 'wallbox') wallboxCount += 1;
      itemsConProducto.push({ item, p });
    }
    if (wallboxCount > 1) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Una instalacion es para una sola cochera: agrega el segundo wallbox en otra instalacion.' });
    }
    if (wallboxCount === 1 && !cocheraId) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Selecciona la cochera para instalar el wallbox.' });
    }

    const instalacion = await client.query(
      `INSERT INTO instalaciones (consorcio_id, uf_id, instalador_usuario_id, notas)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.params.id, ufId, req.user.sub, notas ?? null],
    );
    const instalacionId = instalacion.rows[0].id;

    const itemsCreados = [];
    let cargadorCreado = null;
    for (const { item, p } of itemsConProducto) {
      if (p.serializado) {
        if (!item.stock_item_id) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: `${p.modelo} es serializado, falta stock_item_id.` });
        }
        const stockItem = await client.query(
          `UPDATE stock_items SET estado = 'instalado', consorcio_id = $1, instalacion_id = $2
           WHERE id = $3 AND estado = 'en_stock' RETURNING *`,
          [req.params.id, instalacionId, item.stock_item_id],
        );
        if (stockItem.rowCount === 0) {
          await client.query('ROLLBACK');
          return res.status(409).json({ error: `El item de stock ${item.stock_item_id} no esta disponible.` });
        }
        const result = await client.query(
          `INSERT INTO instalacion_items (instalacion_id, producto_id, stock_item_id, costo_unitario)
           VALUES ($1,$2,$3,$4) RETURNING *`,
          [instalacionId, item.producto_id, item.stock_item_id, stockItem.rows[0].costo_compra],
        );
        itemsCreados.push(result.rows[0]);

        if (p.categoria === 'wallbox') {
          const si = stockItem.rows[0];
          try {
            const cargador = await client.query(
              `INSERT INTO cargadores (ocpp_id, charge_point_vendor, charge_point_model, consorcio_id, uf_id, cochera_id, ocpp_version, stock_item_id)
               VALUES ($1,$2,$3,$4,$5,$6,'2.0.1',$7) RETURNING *`,
              [si.identificador, p.marca, p.modelo, req.params.id, ufId, cocheraId, si.id],
            );
            cargadorCreado = cargador.rows[0];
          } catch (err) {
            await client.query('ROLLBACK');
            if (err.code === '23505') {
              return res.status(409).json({ error: `Ya existe un cargador con ocpp_id "${si.identificador}".` });
            }
            throw err;
          }
        }
      } else {
        const cantidad = Number(item.cantidad) || 1;
        await client.query(
          `INSERT INTO stock_movimientos (producto_id, tipo, cantidad, instalacion_id, creado_por)
           VALUES ($1,'egreso_instalacion',$2,$3,$4)`,
          [item.producto_id, cantidad, instalacionId, req.user.sub],
        );
        const result = await client.query(
          `INSERT INTO instalacion_items (instalacion_id, producto_id, cantidad)
           VALUES ($1,$2,$3) RETURNING *`,
          [instalacionId, item.producto_id, cantidad],
        );
        itemsCreados.push(result.rows[0]);
      }
    }

    if (cargadorCreado) {
      await client.query('UPDATE instalaciones SET cargador_id = $1 WHERE id = $2', [cargadorCreado.id, instalacionId]);
      instalacion.rows[0].cargador_id = cargadorCreado.id;
    }

    await client.query('COMMIT');
    res.status(201).json({ ...instalacion.rows[0], items: itemsCreados, cargador: cargadorCreado });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// Genera el/los cargo(s) puntual(es) de una instalacion ya cargada -
// desglosado (uno por item) o kit resumido (uno solo, con descripcion y
// monto propios, ej: "Kit de instalacion completo para 1 vehiculo").
router.post('/instalaciones/:id/facturar', async (req, res) => {
  const {
    modo, descripcion_kit: descripcionKit, monto_kit: montoKit, periodo,
  } = req.body ?? {};
  if (!['desglosado', 'kit'].includes(modo) || !periodoValido(periodo)) {
    return res.status(400).json({ error: 'modo (desglosado/kit) y periodo (YYYY-MM) son requeridos.' });
  }
  const instalacion = await pool.query('SELECT * FROM instalaciones WHERE id = $1', [req.params.id]);
  if (instalacion.rowCount === 0) return res.status(404).json({ error: 'Instalacion no encontrada.' });
  const { consorcio_id: consorcioId, uf_id: ufId } = instalacion.rows[0];

  const items = (await pool.query(
    `SELECT ii.*, p.categoria, p.marca, p.modelo
     FROM instalacion_items ii JOIN productos_catalogo p ON p.id = ii.producto_id
     WHERE ii.instalacion_id = $1`,
    [req.params.id],
  )).rows;

  const cargosCreados = [];
  if (modo === 'desglosado') {
    for (const item of items) {
      const monto = Number(item.costo_unitario ?? 0) * Number(item.cantidad ?? 1);
      if (monto <= 0) continue;
      const result = await pool.query(
        `INSERT INTO cargos_puntuales (consorcio_id, uf_id, descripcion, monto, periodo, creado_por)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [consorcioId, ufId, `${item.marca ?? ''} ${item.modelo}`.trim(), monto, periodo, req.user.sub],
      );
      cargosCreados.push(result.rows[0]);
    }
  } else {
    const monto = montoKit != null
      ? Number(montoKit)
      : items.reduce((sum, i) => sum + Number(i.costo_unitario ?? 0) * Number(i.cantidad ?? 1), 0);
    const result = await pool.query(
      `INSERT INTO cargos_puntuales (consorcio_id, uf_id, descripcion, monto, periodo, creado_por)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [consorcioId, ufId, descripcionKit || 'Kit de instalacion completo', monto, periodo, req.user.sub],
    );
    cargosCreados.push(result.rows[0]);
  }

  await pool.query('UPDATE instalaciones SET facturada = TRUE WHERE id = $1', [req.params.id]);
  res.status(201).json(cargosCreados);
});

// ---------------------------------------------------------------------------
// Reconocimiento de facturas de proveedor por IA (imagen o PDF) - solo
// extrae y devuelve un preview, no persiste nada. La confirmacion (crear el
// gasto en Contabilidad) la hace el frontend llamando a /contabilidad/gastos
// con los datos ya revisados/corregidos por el usuario.
// ---------------------------------------------------------------------------

const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const FACTURA_IA_PROMPT = `Sos un asistente que extrae datos de una factura de compra (de un proveedor a una empresa).
Devolve EXCLUSIVAMENTE un objeto JSON valido (sin texto adicional, sin markdown, sin backticks) con EXACTAMENTE estos campos:
- proveedor_nombre (string o null - nombre o razon social del emisor de la factura)
- cuit (string o null - CUIT del emisor)
- numero_factura (string o null)
- fecha (string "YYYY-MM-DD" o null)
- items (array de objetos, cada uno con: descripcion (string), cantidad (number, default 1), precio_unitario (number o null), monto (number))
- monto_total (number o null - el total de la factura)

No inventes datos que no esten en el documento. Si un campo no esta presente, usa null. Los montos son numeros (sin simbolo de moneda, con punto decimal).`;

router.post('/facturas-ia/preview', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Falta el archivo.' });
  }
  if (!process.env.OPENROUTER_API_KEY) {
    return res.status(500).json({ error: 'Falta configurar OPENROUTER_API_KEY en el servidor.' });
  }

  const name = req.file.originalname.toLowerCase();
  const mimeType = req.file.mimetype;
  let messages;

  try {
    if (IMAGE_MIME_TYPES.includes(mimeType)) {
      const base64 = req.file.buffer.toString('base64');
      messages = [{
        role: 'user',
        content: [
          { type: 'text', text: FACTURA_IA_PROMPT },
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
        ],
      }];
    } else if (name.endsWith('.pdf')) {
      const parsed = await pdfParse(req.file.buffer);
      const rawContent = parsed.text;
      if (!rawContent || rawContent.trim().length < 20) {
        return res.status(400).json({ error: 'El PDF no tiene texto legible (parece escaneado). Proba subiendo una foto/imagen de la factura en su lugar.' });
      }
      messages = [{ role: 'user', content: `${FACTURA_IA_PROMPT}\n\nContenido del documento:\n${rawContent.slice(0, 40000)}` }];
    } else {
      return res.status(400).json({ error: 'Formato no soportado. Usa una imagen (jpg/png/webp) o un PDF.' });
    }
  } catch (err) {
    console.error('Error leyendo factura para IA:', err);
    return res.status(400).json({ error: 'No se pudo leer el archivo. Verifica que no este corrupto.' });
  }

  try {
    const aiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'anthropic/claude-sonnet-5',
        messages,
        temperature: 0,
      }),
    });
    const data = await aiRes.json();
    if (!aiRes.ok) {
      console.error('Error de OpenRouter:', data);
      return res.status(502).json({ error: 'El servicio de IA no pudo procesar la factura.' });
    }
    let text = (data.choices?.[0]?.message?.content ?? '').trim();
    text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/, '');
    let extraido;
    try {
      extraido = JSON.parse(text);
    } catch {
      console.error('IA devolvio JSON invalido:', text);
      return res.status(502).json({ error: 'La IA no devolvio un formato valido. Proba con una imagen mas clara o cargalo a mano.' });
    }
    res.json(extraido);
  } catch (err) {
    console.error('Error llamando a OpenRouter:', err);
    res.status(502).json({ error: 'No se pudo comunicar con el servicio de IA.' });
  }
});

module.exports = router;
