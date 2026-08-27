// Modulo Comercial / CRM de ventas. Todos los usuarios con acceso ven todos
// los contactos (no hay particionado por vendedor) - solo se registra quien
// es el responsable de cada contacto/actividad. Ver schema_comercial.sql y
// marketing/preguntas_modulo_ventas.md.

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const XLSX = require('xlsx');
const pdfParse = require('pdf-parse');
const { pool } = require('../db');
const { authenticate, requirePermission } = require('../auth/middleware');
const { calcularTroncal, DISCLAIMER_PREDIMENSIONADO } = require('../lib/electricoEV');
const {
  mailConfigurado, enviarMail, enviarYRegistrarMail, revisarBandeja,
} = require('../services/mail');

const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads', 'comercial');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
const AGENTE_DIR = path.join(UPLOADS_DIR, 'agente-informes');
fs.mkdirSync(AGENTE_DIR, { recursive: true });

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://192.168.1.38';

// Token simple para el link de "darse de baja" en campañas: no hace falta
// login para clickearlo desde el mail, pero tampoco queremos que cualquiera
// pueda dar de baja a otro contacto adivinando su id.
function tokenBaja(contactoId) {
  return crypto.createHmac('sha256', process.env.JWT_SECRET || 'dev-secret').update(String(contactoId)).digest('hex').slice(0, 16);
}

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS_DIR,
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).slice(0, 10);
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
});
const uploadMemory = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const router = express.Router();

// Sin autenticacion a proposito: los <img>/<a> del navegador no mandan el
// Bearer token (solo lo agrega el interceptor de axios), asi que estos
// archivos se sirven por nombre de archivo UUID no listable en vez de por
// sesion. Igual de razonable que un link "no listado" de cualquier otro
// servicio de documentos compartidos.
router.get('/archivos/:filename', (req, res) => {
  const filePath = path.join(UPLOADS_DIR, path.basename(req.params.filename));
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Archivo no encontrado.' });
  res.sendFile(filePath);
});

// Sin autenticacion a proposito: se clickea desde el mail, sin sesion
// iniciada. Protegido con un token derivado del id (tokenBaja) para que no
// se pueda dar de baja a otro contacto adivinando el id en la URL.
router.get('/baja', async (req, res) => {
  const contactoId = Number(req.query.c);
  const token = req.query.t;
  res.set('Content-Type', 'text/html; charset=utf-8');
  if (!contactoId || !token || token !== tokenBaja(contactoId)) {
    return res.status(400).send('<html><body style="font-family:sans-serif;text-align:center;padding:60px"><p>Link invalido.</p></body></html>');
  }
  await pool.query('UPDATE comercial_contactos SET no_contactar = TRUE WHERE id = $1', [contactoId]);
  res.send('<html><body style="font-family:sans-serif;text-align:center;padding:60px"><p>Listo, no vas a recibir mas campañas de mail nuestras.</p></body></html>');
});

router.use(authenticate, requirePermission('comercial'));

const ALERTA_CASE = `
  CASE
    WHEN c.no_contactar THEN 'No contactar'
    WHEN c.fecha_proxima_accion IS NULL THEN 'Sin fecha'
    WHEN c.fecha_proxima_accion < CURRENT_DATE THEN 'Vencido'
    WHEN c.fecha_proxima_accion = CURRENT_DATE THEN 'Hoy'
    WHEN c.fecha_proxima_accion <= CURRENT_DATE + INTERVAL '7 days' THEN 'Proximos 7 dias'
    ELSE 'Sin fecha'
  END`;

async function responsableActual(req) {
  if (req.body?.responsable_nombre) return req.body.responsable_nombre;
  const result = await pool.query('SELECT nombre, email FROM usuarios WHERE id = $1', [req.user.sub]);
  return result.rows[0]?.nombre || result.rows[0]?.email || null;
}

async function siguienteCodigo() {
  const result = await pool.query(
    `SELECT codigo FROM comercial_contactos WHERE codigo ~ '^CT-[0-9]+$' ORDER BY (substring(codigo FROM 4))::int DESC LIMIT 1`,
  );
  const ultimo = result.rows[0]?.codigo;
  const n = ultimo ? Number(ultimo.slice(3)) + 1 : 1;
  return `CT-${String(n).padStart(4, '0')}`;
}

async function siguienteCodigoCotizacion() {
  const result = await pool.query(
    `SELECT codigo FROM comercial_cotizaciones WHERE codigo ~ '^CE-[0-9]+$' ORDER BY (substring(codigo FROM 4))::int DESC LIMIT 1`,
  );
  const ultimo = result.rows[0]?.codigo;
  const n = ultimo ? Number(ultimo.slice(3)) + 1 : 1;
  return `CE-${String(n).padStart(4, '0')}`;
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

router.get('/dashboard', async (_req, res) => {
  const totales = await pool.query('SELECT COUNT(*) AS n FROM comercial_contactos');
  const porEstado = await pool.query(
    `SELECT estado_comercial, COUNT(*) AS n FROM comercial_contactos GROUP BY estado_comercial`,
  );
  const alertas = await pool.query(
    `SELECT ${ALERTA_CASE} AS alerta, COUNT(*) AS n FROM comercial_contactos c GROUP BY alerta`,
  );
  res.json({
    contactos_totales: Number(totales.rows[0].n),
    por_estado: porEstado.rows,
    alertas: alertas.rows,
  });
});

// ---------------------------------------------------------------------------
// Contactos
// ---------------------------------------------------------------------------

const FILTROS_CONTACTOS = {
  no_contactados: `c.ultimo_contacto IS NULL`,
  sin_respuesta: `EXISTS (SELECT 1 FROM comercial_seguimientos s WHERE s.contacto_id = c.id AND s.tipo_actividad = 'Campaña')
                  AND NOT EXISTS (SELECT 1 FROM comercial_seguimientos s2 WHERE s2.contacto_id = c.id AND s2.tipo_actividad ILIKE 'Respuesta recibida%')`,
  inactivos_30d: `c.ultimo_contacto IS NOT NULL AND c.ultimo_contacto < CURRENT_DATE - INTERVAL '30 days'`,
  sin_email: `c.email IS NULL`,
};

router.get('/contactos', async (req, res) => {
  const {
    estado, prioridad, responsable, search, filtro,
  } = req.query;
  const conditions = [];
  const params = [];
  if (estado) { params.push(estado); conditions.push(`c.estado_comercial = $${params.length}`); }
  if (prioridad) { params.push(prioridad); conditions.push(`c.prioridad = $${params.length}`); }
  if (responsable) { params.push(responsable); conditions.push(`c.responsable_nombre = $${params.length}`); }
  if (filtro && FILTROS_CONTACTOS[filtro]) { conditions.push(FILTROS_CONTACTOS[filtro]); }
  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(c.nombre ILIKE $${params.length} OR c.apellido ILIKE $${params.length} OR c.email ILIKE $${params.length} OR c.administracion_empresa ILIKE $${params.length})`);
  }
  const result = await pool.query(
    `SELECT c.*, ${ALERTA_CASE} AS alerta,
            (CURRENT_DATE - c.ultimo_contacto) AS dias_sin_contacto
     FROM comercial_contactos c
     ${conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''}
     ORDER BY c.fecha_proxima_accion ASC NULLS LAST, c.apellido`,
    params,
  );
  res.json(result.rows);
});

router.get('/contactos/:id', async (req, res) => {
  const contacto = await pool.query(
    `SELECT c.*, ${ALERTA_CASE} AS alerta,
            (CURRENT_DATE - c.ultimo_contacto) AS dias_sin_contacto
     FROM comercial_contactos c WHERE c.id = $1`,
    [req.params.id],
  );
  if (contacto.rowCount === 0) return res.status(404).json({ error: 'Contacto no encontrado.' });

  const seguimientos = await pool.query(
    'SELECT * FROM comercial_seguimientos WHERE contacto_id = $1 ORDER BY fecha DESC, id DESC',
    [req.params.id],
  );
  const visitas = await pool.query(
    'SELECT * FROM comercial_visitas WHERE contacto_id = $1 ORDER BY fecha_hora DESC',
    [req.params.id],
  );
  const presupuestos = await pool.query(
    'SELECT id, fecha, estado, moneda, opciones FROM comercial_presupuestos WHERE contacto_id = $1 ORDER BY fecha DESC',
    [req.params.id],
  );
  const relevamientos = await pool.query(
    'SELECT id, fecha, estado, edificio_nombre FROM comercial_relevamientos WHERE contacto_id = $1 ORDER BY fecha DESC',
    [req.params.id],
  );
  const cotizaciones = await pool.query(
    'SELECT id, codigo, fecha, estado, moneda, bom, edificio FROM comercial_cotizaciones WHERE contacto_id = $1 ORDER BY fecha DESC',
    [req.params.id],
  );

  res.json({
    ...contacto.rows[0],
    seguimientos: seguimientos.rows,
    visitas: visitas.rows,
    presupuestos: presupuestos.rows,
    relevamientos: relevamientos.rows,
    cotizaciones: cotizaciones.rows,
  });
});

router.post('/contactos', async (req, res) => {
  const {
    apellido, nombre, tipo_contacto: tipoContacto, email, administracion_empresa: adminEmpresa, cuit,
    telefono, zona, origen, interes_principal: interesPrincipal, prioridad, observaciones,
  } = req.body ?? {};
  if (!apellido || !nombre) return res.status(400).json({ error: 'apellido y nombre son requeridos.' });

  const codigo = await siguienteCodigo();
  const responsableNombre = await responsableActual(req);
  const result = await pool.query(
    `INSERT INTO comercial_contactos
       (codigo, apellido, nombre, tipo_contacto, email, administracion_empresa, cuit, telefono, zona, origen,
        interes_principal, prioridad, responsable_usuario_id, responsable_nombre, observaciones)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
    [codigo, apellido, nombre, tipoContacto || 'Otros', email ?? null, adminEmpresa ?? null, cuit ?? null,
      telefono ?? null, zona ?? null, origen ?? null, interesPrincipal ?? null, prioridad || 'Media',
      req.user.sub, responsableNombre, observaciones ?? null],
  );
  res.status(201).json(result.rows[0]);
});

router.put('/contactos/:id', async (req, res) => {
  const {
    apellido, nombre, tipo_contacto: tipoContacto, email, administracion_empresa: adminEmpresa, cuit,
    telefono, zona, origen, interes_principal: interesPrincipal, estado_comercial: estadoComercial,
    prioridad, responsable_usuario_id: responsableUsuarioId, responsable_nombre: responsableNombre,
    proxima_accion: proximaAccion, fecha_proxima_accion: fechaProximaAccion, consentimiento_comercial: consentimiento,
    no_contactar: noContactar, observaciones,
  } = req.body ?? {};

  const result = await pool.query(
    `UPDATE comercial_contactos SET
       apellido = COALESCE($1, apellido), nombre = COALESCE($2, nombre),
       tipo_contacto = COALESCE($3, tipo_contacto), email = COALESCE($4, email),
       administracion_empresa = COALESCE($5, administracion_empresa), cuit = COALESCE($6, cuit),
       telefono = COALESCE($7, telefono), zona = COALESCE($8, zona), origen = COALESCE($9, origen),
       interes_principal = COALESCE($10, interes_principal), estado_comercial = COALESCE($11, estado_comercial),
       prioridad = COALESCE($12, prioridad), responsable_usuario_id = COALESCE($13, responsable_usuario_id),
       responsable_nombre = COALESCE($14, responsable_nombre), proxima_accion = COALESCE($15, proxima_accion),
       fecha_proxima_accion = COALESCE($16, fecha_proxima_accion),
       consentimiento_comercial = COALESCE($17, consentimiento_comercial),
       no_contactar = COALESCE($18, no_contactar), observaciones = COALESCE($19, observaciones),
       actualizado_en = NOW()
     WHERE id = $20 RETURNING *`,
    [apellido ?? null, nombre ?? null, tipoContacto ?? null, email ?? null, adminEmpresa ?? null, cuit ?? null,
      telefono ?? null, zona ?? null, origen ?? null, interesPrincipal ?? null, estadoComercial ?? null,
      prioridad ?? null, responsableUsuarioId ?? null, responsableNombre ?? null, proximaAccion ?? null,
      fechaProximaAccion ?? null, consentimiento ?? null, noContactar ?? null, observaciones ?? null,
      req.params.id],
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Contacto no encontrado.' });
  res.json(result.rows[0]);
});

// ---------------------------------------------------------------------------
// Seguimientos (timeline de actividad por contacto)
// ---------------------------------------------------------------------------

router.post('/contactos/:id/seguimientos', async (req, res) => {
  const {
    fecha, canal, tipo_actividad: tipoActividad, resultado_resumen: resultadoResumen, mail_completo: mailCompleto,
    estado_comercial_despues: estadoDespues, proxima_accion: proximaAccion, fecha_proxima_accion: fechaProximaAccion,
    notas,
  } = req.body ?? {};

  const responsableNombre = await responsableActual(req);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const seguimiento = await client.query(
      `INSERT INTO comercial_seguimientos
         (contacto_id, fecha, canal, tipo_actividad, resultado_resumen, mail_completo, estado_comercial_despues,
          proxima_accion, fecha_proxima_accion, responsable_usuario_id, responsable_nombre, notas)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [req.params.id, fecha || new Date().toISOString().slice(0, 10), canal || 'Otro', tipoActividad ?? null,
        resultadoResumen ?? null, mailCompleto ?? null, estadoDespues ?? null, proximaAccion ?? null,
        fechaProximaAccion ?? null, req.user.sub, responsableNombre, notas ?? null],
    );
    await client.query(
      `UPDATE comercial_contactos SET
         ultimo_contacto = $1,
         estado_comercial = COALESCE($2, estado_comercial),
         proxima_accion = COALESCE($3, proxima_accion),
         fecha_proxima_accion = COALESCE($4, fecha_proxima_accion),
         actualizado_en = NOW()
       WHERE id = $5`,
      [fecha || new Date().toISOString().slice(0, 10), estadoDespues ?? null, proximaAccion ?? null,
        fechaProximaAccion ?? null, req.params.id],
    );
    await client.query('COMMIT');
    res.status(201).json(seguimiento.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// Visitas / calendario
// ---------------------------------------------------------------------------

router.get('/visitas', async (req, res) => {
  const { desde, hasta } = req.query;
  const conditions = [];
  const params = [];
  if (desde) { params.push(desde); conditions.push(`v.fecha_hora >= $${params.length}`); }
  if (hasta) { params.push(hasta); conditions.push(`v.fecha_hora <= $${params.length}`); }
  const result = await pool.query(
    `SELECT v.*, c.nombre, c.apellido, c.administracion_empresa
     FROM comercial_visitas v
     JOIN comercial_contactos c ON c.id = v.contacto_id
     ${conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''}
     ORDER BY v.fecha_hora ASC`,
    params,
  );
  res.json(result.rows);
});

router.post('/contactos/:id/visitas', async (req, res) => {
  const { fecha_hora: fechaHora, direccion, notas } = req.body ?? {};
  if (!fechaHora) return res.status(400).json({ error: 'fecha_hora es requerido.' });
  const responsableNombre = await responsableActual(req);
  const result = await pool.query(
    `INSERT INTO comercial_visitas (contacto_id, fecha_hora, direccion, responsable_usuario_id, responsable_nombre, notas)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [req.params.id, fechaHora, direccion ?? null, req.user.sub, responsableNombre, notas ?? null],
  );
  res.status(201).json(result.rows[0]);
});

router.put('/visitas/:id', async (req, res) => {
  const { fecha_hora: fechaHora, estado, direccion, notas } = req.body ?? {};
  if (estado && !['agendada', 'realizada', 'cancelada'].includes(estado)) {
    return res.status(400).json({ error: 'estado invalido.' });
  }
  const result = await pool.query(
    `UPDATE comercial_visitas SET
       fecha_hora = COALESCE($1, fecha_hora), estado = COALESCE($2, estado),
       direccion = COALESCE($3, direccion), notas = COALESCE($4, notas)
     WHERE id = $5 RETURNING *`,
    [fechaHora ?? null, estado ?? null, direccion ?? null, notas ?? null, req.params.id],
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Visita no encontrada.' });
  res.json(result.rows[0]);
});

// ---------------------------------------------------------------------------
// Catalogo de items (materiales/servicios reutilizables para presupuestos)
// ---------------------------------------------------------------------------

router.get('/catalogo-items', async (_req, res) => {
  const result = await pool.query('SELECT * FROM comercial_catalogo_items WHERE activo = TRUE ORDER BY categoria NULLS LAST, nombre');
  res.json(result.rows);
});

router.post('/catalogo-items', async (req, res) => {
  const {
    nombre, unidad, precio_unitario: precioUnitario, costo, categoria, proveedor,
  } = req.body ?? {};
  if (!nombre || precioUnitario === undefined) {
    return res.status(400).json({ error: 'nombre y precio_unitario son requeridos.' });
  }
  if (Number(precioUnitario) < 0) {
    return res.status(400).json({ error: 'precio_unitario no puede ser negativo.' });
  }
  const result = await pool.query(
    `INSERT INTO comercial_catalogo_items (nombre, unidad, precio_unitario, costo, categoria, proveedor)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [nombre, unidad || 'unidad', Number(precioUnitario), costo != null && costo !== '' ? Number(costo) : null,
      categoria ?? null, proveedor ?? null],
  );
  res.status(201).json(result.rows[0]);
});

router.put('/catalogo-items/:id', async (req, res) => {
  const {
    nombre, unidad, precio_unitario: precioUnitario, costo, categoria, proveedor, activo,
  } = req.body ?? {};
  if (precioUnitario !== undefined && Number(precioUnitario) < 0) {
    return res.status(400).json({ error: 'precio_unitario no puede ser negativo.' });
  }
  const result = await pool.query(
    `UPDATE comercial_catalogo_items SET
       nombre = COALESCE($1, nombre), unidad = COALESCE($2, unidad),
       precio_unitario = COALESCE($3, precio_unitario), costo = COALESCE($4, costo),
       categoria = COALESCE($5, categoria), proveedor = COALESCE($6, proveedor),
       activo = COALESCE($7, activo), actualizado_en = NOW()
     WHERE id = $8 RETURNING *`,
    [nombre ?? null, unidad ?? null, precioUnitario !== undefined ? Number(precioUnitario) : null,
      costo != null && costo !== '' ? Number(costo) : null,
      categoria ?? null, proveedor ?? null, activo ?? null, req.params.id],
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Item no encontrado.' });
  res.json(result.rows[0]);
});

// Import IA de listas de precios de proveedores: sube un archivo (imagen,
// PDF, planilla), la IA lo compara contra NUESTRO catalogo (le mandamos los
// nombres/categorias existentes) y devuelve, para los items que reconoce,
// el precio nuevo encontrado y el nombre del proveedor - nunca inventa
// coincidencias ni precios que no esten en el documento.
const ACTUALIZAR_PRECIOS_PROMPT = (catalogoTexto) => `Sos un asistente que compara una lista de precios de un proveedor de materiales electricos/de infraestructura con nuestro catalogo interno, para detectar actualizaciones de precio.

Nuestro catalogo actual (id - nombre - categoria - unidad - precio actual):
${catalogoTexto}

Analiza el documento adjunto (lista de precios de un proveedor) y para cada item de NUESTRO catalogo que reconozcas en el documento (aunque el nombre este escrito distinto - mismo producto, marca o especificacion tecnica equivalente), extrae el precio nuevo y el nombre del proveedor (si el documento lo indica, o inferilo del nombre del archivo/encabezado si es evidente).

Reglas:
- Nunca inventes una coincidencia: si no estas razonablemente seguro de que es el mismo producto, no lo incluyas.
- Nunca inventes un precio que no este en el documento.
- Si el documento no menciona el nombre del proveedor en ningun lado, dejalo en null.

Devolve SOLO un array JSON (sin texto adicional, sin markdown), un objeto por cada coincidencia encontrada:
[{"catalogo_item_id": number, "nombre_catalogo": string, "precio_nuevo": number, "proveedor": string|null}]

Si no reconoces ningun item, devolve [].`;

router.post('/catalogo-items/importar-preview', uploadMemory.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Falta el archivo.' });
  if (!process.env.OPENROUTER_API_KEY) {
    return res.status(500).json({ error: 'Falta configurar OPENROUTER_API_KEY en el servidor.' });
  }

  const catalogo = await pool.query('SELECT id, nombre, categoria, unidad, precio_unitario FROM comercial_catalogo_items WHERE activo = TRUE ORDER BY nombre');
  const catalogoTexto = catalogo.rows.map((c) => `${c.id} - ${c.nombre} - ${c.categoria || 'sin categoria'} - ${c.unidad} - $${c.precio_unitario}`).join('\n');
  const prompt = ACTUALIZAR_PRECIOS_PROMPT(catalogoTexto);

  const name = req.file.originalname.toLowerCase();
  const mimeType = req.file.mimetype;
  let messages;

  try {
    if (IMAGE_MIME_TYPES.includes(mimeType)) {
      const base64 = req.file.buffer.toString('base64');
      messages = [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
        ],
      }];
    } else {
      let rawContent;
      if (name.endsWith('.pdf')) {
        rawContent = (await pdfParse(req.file.buffer)).text;
      } else if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        rawContent = JSON.stringify(XLSX.utils.sheet_to_json(sheet, { defval: '' }));
      } else {
        rawContent = req.file.buffer.toString('utf8');
      }
      if (!rawContent || !rawContent.trim()) {
        return res.status(400).json({ error: 'El archivo no tiene contenido legible. Proba con una imagen o una planilla.' });
      }
      messages = [{ role: 'user', content: `${prompt}\n\nContenido del documento (lista de precios del proveedor):\n${rawContent.slice(0, 60000)}` }];
    }
  } catch (err) {
    console.error('Error leyendo lista de precios:', err);
    return res.status(400).json({ error: 'No se pudo leer el archivo. Verifica que no este corrupto.' });
  }

  try {
    const aiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: 'anthropic/claude-sonnet-5', messages, temperature: 0 }),
    });
    const data = await aiRes.json();
    if (!aiRes.ok) {
      console.error('Error de OpenRouter (import precios):', data);
      return res.status(502).json({ error: 'El servicio de IA no pudo procesar el archivo.' });
    }
    let text = (data.choices?.[0]?.message?.content ?? '').trim();
    text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/, '');
    let matches;
    try {
      matches = JSON.parse(text);
    } catch {
      console.error('IA devolvio JSON invalido (import precios):', text);
      return res.status(502).json({ error: 'La IA no devolvio un formato valido. Proba con un archivo mas claro.' });
    }
    if (!Array.isArray(matches)) matches = [];

    const catalogoPorId = new Map(catalogo.rows.map((c) => [c.id, c]));
    const resultado = matches
      .filter((m) => catalogoPorId.has(Number(m.catalogo_item_id)) && m.precio_nuevo != null)
      .map((m) => {
        const item = catalogoPorId.get(Number(m.catalogo_item_id));
        return {
          catalogo_item_id: item.id,
          nombre: item.nombre,
          categoria: item.categoria,
          unidad: item.unidad,
          precio_actual: Number(item.precio_unitario),
          precio_nuevo: Number(m.precio_nuevo),
          proveedor: m.proveedor || null,
        };
      });

    res.json(resultado);
  } catch (err) {
    console.error('Error llamando a OpenRouter (import precios):', err);
    res.status(502).json({ error: 'No se pudo comunicar con el servicio de IA.' });
  }
});

router.post('/catalogo-items/importar-confirmar', async (req, res) => {
  const { items } = req.body ?? {};
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items debe ser una lista no vacia.' });
  }
  let actualizados = 0;
  for (const it of items) {
    if (!it.catalogo_item_id || it.precio_nuevo == null || Number(it.precio_nuevo) < 0) continue;
    // eslint-disable-next-line no-await-in-loop
    await pool.query(
      `UPDATE comercial_catalogo_items SET
         precio_unitario = $1, proveedor = COALESCE($2, proveedor), actualizado_en = NOW()
       WHERE id = $3`,
      [Number(it.precio_nuevo), it.proveedor || null, it.catalogo_item_id],
    );
    actualizados += 1;
  }
  res.json({ actualizados });
});

// ---------------------------------------------------------------------------
// Presupuestos
// ---------------------------------------------------------------------------

const CLAUSULAS_DEFAULT = `Los valores indicados no incluyen IVA ni tasas impositivas adicionales.
El metraje de cable y demas materiales estimados por metro se establece con caracter preliminar; se reajusta segun lo efectivamente instalado (demasia o economia).
Forma de pago y ejecucion a convenir formalmente al momento de la adjudicacion.`;

router.get('/presupuestos/nuevo-borrador', async (_req, res) => {
  res.json({ clausulas: CLAUSULAS_DEFAULT });
});

router.get('/contactos/:id/presupuestos', async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM comercial_presupuestos WHERE contacto_id = $1 ORDER BY fecha DESC, id DESC',
    [req.params.id],
  );
  res.json(result.rows);
});

router.get('/presupuestos/:id', async (req, res) => {
  const result = await pool.query(
    `SELECT p.*, c.nombre, c.apellido, c.administracion_empresa, c.email, c.telefono
     FROM comercial_presupuestos p JOIN comercial_contactos c ON c.id = p.contacto_id
     WHERE p.id = $1`,
    [req.params.id],
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Presupuesto no encontrado.' });
  res.json(result.rows[0]);
});

router.post('/contactos/:id/presupuestos', async (req, res) => {
  const {
    fecha, validez_hasta: validezHasta, moneda, opciones, clausulas,
  } = req.body ?? {};
  const responsableNombre = await responsableActual(req);
  const result = await pool.query(
    `INSERT INTO comercial_presupuestos (contacto_id, fecha, validez_hasta, moneda, opciones, clausulas, responsable_usuario_id, responsable_nombre)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [req.params.id, fecha || new Date().toISOString().slice(0, 10), validezHasta ?? null, moneda || 'ARS',
      JSON.stringify(opciones ?? []), clausulas ?? CLAUSULAS_DEFAULT, req.user.sub, responsableNombre],
  );
  res.status(201).json(result.rows[0]);
});

router.put('/presupuestos/:id', async (req, res) => {
  const {
    fecha, validez_hasta: validezHasta, moneda, opciones, clausulas, estado,
  } = req.body ?? {};
  if (estado && !['borrador', 'enviado', 'aprobado', 'rechazado', 'vencido'].includes(estado)) {
    return res.status(400).json({ error: 'estado invalido.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE comercial_presupuestos SET
         fecha = COALESCE($1, fecha), validez_hasta = COALESCE($2, validez_hasta),
         moneda = COALESCE($3, moneda), opciones = COALESCE($4, opciones),
         clausulas = COALESCE($5, clausulas), estado = COALESCE($6, estado),
         enviado_en = CASE WHEN $6 = 'enviado' AND enviado_en IS NULL THEN NOW() ELSE enviado_en END,
         actualizado_en = NOW()
       WHERE id = $7 RETURNING *`,
      [fecha ?? null, validezHasta ?? null, moneda ?? null, opciones !== undefined ? JSON.stringify(opciones) : null,
        clausulas ?? null, estado ?? null, req.params.id],
    );
    if (result.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Presupuesto no encontrado.' });
    }
    // Al marcar un presupuesto como enviado, el contacto avanza en el embudo
    // (mismo comportamiento automatico que tenia la planilla Excel).
    if (estado === 'enviado') {
      await client.query(
        `UPDATE comercial_contactos SET estado_comercial = 'Presupuesto enviado', actualizado_en = NOW() WHERE id = $1`,
        [result.rows[0].contacto_id],
      );
    }
    await client.query('COMMIT');
    res.json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

router.delete('/presupuestos/:id', async (req, res) => {
  const result = await pool.query(`DELETE FROM comercial_presupuestos WHERE id = $1 AND estado = 'borrador'`, [req.params.id]);
  if (result.rowCount === 0) {
    return res.status(409).json({ error: 'Solo se puede borrar un presupuesto en borrador.' });
  }
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Cotizador de infraestructura EV - reemplaza el flujo de Presupuestos para
// cotizar contactos. Estructura edificio -> pisos -> troncales -> cocheras,
// con calculo electrico real por troncal (electricoEV.js). Ver
// marketing/cotizador.md para la especificacion completa.
// ---------------------------------------------------------------------------

router.get('/contactos/:id/cotizaciones', async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM comercial_cotizaciones WHERE contacto_id = $1 ORDER BY fecha DESC, id DESC',
    [req.params.id],
  );
  res.json(result.rows);
});

router.get('/cotizaciones/:id', async (req, res) => {
  const result = await pool.query(
    `SELECT q.*, c.nombre, c.apellido, c.administracion_empresa, c.email, c.telefono
     FROM comercial_cotizaciones q JOIN comercial_contactos c ON c.id = q.contacto_id
     WHERE q.id = $1`,
    [req.params.id],
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Cotizacion no encontrada.' });
  res.json({ ...result.rows[0], disclaimer_predimensionado: DISCLAIMER_PREDIMENSIONADO });
});

router.post('/contactos/:id/cotizaciones', async (req, res) => {
  const responsableNombre = await responsableActual(req);
  const codigo = await siguienteCodigoCotizacion();
  const result = await pool.query(
    `INSERT INTO comercial_cotizaciones (contacto_id, codigo, responsable_usuario_id, responsable_nombre)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [req.params.id, codigo, req.user.sub, responsableNombre],
  );
  res.status(201).json(result.rows[0]);
});

router.put('/cotizaciones/:id', async (req, res) => {
  const {
    edificio, pisos, infraestructura, wallboxes, bom, margen_pct: margenPct, iva_pct: ivaPct,
    clausulas, estado, fecha, validez_hasta: validezHasta, moneda,
  } = req.body ?? {};
  if (estado && !['borrador', 'enviado', 'aprobado', 'rechazado', 'vencido'].includes(estado)) {
    return res.status(400).json({ error: 'estado invalido.' });
  }
  if (estado === 'enviado') {
    let bomAEnviar = bom;
    if (bomAEnviar === undefined) {
      const existing = await pool.query('SELECT bom FROM comercial_cotizaciones WHERE id = $1', [req.params.id]);
      bomAEnviar = existing.rows[0]?.bom || [];
    }
    const pendientes = (bomAEnviar || []).filter((l) => l.pendiente_precio).length;
    if (pendientes > 0) {
      return res.status(400).json({ error: `No se puede marcar como enviada: ${pendientes} item(s) del presupuesto sin precio cargado.` });
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE comercial_cotizaciones SET
         edificio = COALESCE($1, edificio), pisos = COALESCE($2, pisos),
         infraestructura = COALESCE($3, infraestructura), wallboxes = COALESCE($4, wallboxes),
         bom = COALESCE($5, bom), margen_pct = COALESCE($6, margen_pct), iva_pct = COALESCE($7, iva_pct),
         clausulas = COALESCE($8, clausulas), estado = COALESCE($9, estado),
         fecha = COALESCE($10, fecha), validez_hasta = COALESCE($11, validez_hasta), moneda = COALESCE($12, moneda),
         enviado_en = CASE WHEN $9 = 'enviado' AND enviado_en IS NULL THEN NOW() ELSE enviado_en END,
         actualizado_en = NOW()
       WHERE id = $13 RETURNING *`,
      [
        edificio !== undefined ? JSON.stringify(edificio) : null,
        pisos !== undefined ? JSON.stringify(pisos) : null,
        infraestructura !== undefined ? JSON.stringify(infraestructura) : null,
        wallboxes !== undefined ? JSON.stringify(wallboxes) : null,
        bom !== undefined ? JSON.stringify(bom) : null,
        margenPct ?? null, ivaPct ?? null, clausulas ?? null, estado ?? null,
        fecha ?? null, validezHasta ?? null, moneda ?? null, req.params.id,
      ],
    );
    if (result.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Cotizacion no encontrada.' });
    }
    // Mismo comportamiento que Presupuestos: al marcar como enviada, el
    // contacto avanza en el embudo comercial.
    if (estado === 'enviado') {
      await client.query(
        `UPDATE comercial_contactos SET estado_comercial = 'Presupuesto enviado', actualizado_en = NOW() WHERE id = $1`,
        [result.rows[0].contacto_id],
      );
    }
    await client.query('COMMIT');
    res.json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

router.post('/cotizaciones/:id/recalcular', async (req, res) => {
  const existing = await pool.query('SELECT pisos FROM comercial_cotizaciones WHERE id = $1', [req.params.id]);
  if (existing.rowCount === 0) return res.status(404).json({ error: 'Cotizacion no encontrada.' });

  const pisosRecalculados = (existing.rows[0].pisos || []).map((piso) => ({
    ...piso,
    troncales: (piso.troncales || []).map((troncal) => ({ ...troncal, calculo: calcularTroncal(troncal) })),
  }));

  const result = await pool.query(
    `UPDATE comercial_cotizaciones SET pisos = $1, actualizado_en = NOW() WHERE id = $2 RETURNING *`,
    [JSON.stringify(pisosRecalculados), req.params.id],
  );
  res.json({ ...result.rows[0], disclaimer_predimensionado: DISCLAIMER_PREDIMENSIONADO });
});

router.post('/cotizaciones/:id/wallboxes', async (req, res) => {
  const {
    cochera_id: cocheraId, piso_id: pisoId, troncal_id: troncalId, modelo, potencia_kw: potenciaKw,
    longitud_cable_m: longitudCableM, config,
  } = req.body ?? {};
  if (!cocheraId) return res.status(400).json({ error: 'cochera_id es requerido.' });

  const itemsGenerados = [
    { descripcion: `Wallbox ${modelo || ''} ${potenciaKw ? `${potenciaKw}kW` : ''}`.trim(), unidad: 'un', cantidad: 1 },
    { descripcion: 'Caja portatermica', unidad: 'un', cantidad: 1 },
    { descripcion: 'Termica individual', unidad: 'un', cantidad: 1 },
    { descripcion: 'Diferencial/proteccion individual', unidad: 'un', cantidad: 1 },
    { descripcion: 'Cable desde infraestructura preparada', unidad: 'm', cantidad: Number(longitudCableM) || 0 },
    { descripcion: 'Punto Ethernet + conexionado', unidad: 'un', cantidad: 1 },
    { descripcion: 'Instalacion y conexionado', unidad: 'gl', cantidad: 1 },
    { descripcion: 'Configuracion OCPP + alta CSMS', unidad: 'gl', cantidad: 1 },
    { descripcion: 'Pruebas', unidad: 'gl', cantidad: 1 },
  ];

  const wallbox = {
    id: crypto.randomUUID(),
    cochera_id: cocheraId,
    piso_id: pisoId ?? null,
    troncal_id: troncalId ?? null,
    modelo: modelo ?? null,
    potencia_kw: potenciaKw ?? null,
    longitud_cable_m: longitudCableM ?? null,
    config: config ?? null,
    csms_registrado: false,
    items_generados: itemsGenerados,
    creado_en: new Date().toISOString(),
  };

  const result = await pool.query(
    `UPDATE comercial_cotizaciones SET wallboxes = wallboxes || $1::jsonb, actualizado_en = NOW() WHERE id = $2 RETURNING *`,
    [JSON.stringify([wallbox]), req.params.id],
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Cotizacion no encontrada.' });
  res.status(201).json(result.rows[0]);
});

router.delete('/cotizaciones/:id/wallboxes/:wallboxId', async (req, res) => {
  const existing = await pool.query('SELECT wallboxes FROM comercial_cotizaciones WHERE id = $1', [req.params.id]);
  if (existing.rowCount === 0) return res.status(404).json({ error: 'Cotizacion no encontrada.' });
  const restantes = (existing.rows[0].wallboxes || []).filter((w) => w.id !== req.params.wallboxId);
  const result = await pool.query(
    `UPDATE comercial_cotizaciones SET wallboxes = $1, actualizado_en = NOW() WHERE id = $2 RETURNING *`,
    [JSON.stringify(restantes), req.params.id],
  );
  res.json(result.rows[0]);
});

// Arma el BOM categorizado a partir de lo ya configurado/calculado (troncales,
// infraestructura compartida, wallboxes de etapa 2). No matchea contra el
// catalogo automaticamente ni inventa precios: cada linea queda con
// precio_unitario=null y pendiente_precio=true hasta que se elija manualmente
// un item de comercial_catalogo_items en el paso de presupuesto.
router.post('/cotizaciones/:id/bom/generar', async (req, res) => {
  const existing = await pool.query('SELECT * FROM comercial_cotizaciones WHERE id = $1', [req.params.id]);
  if (existing.rowCount === 0) return res.status(404).json({ error: 'Cotizacion no encontrada.' });
  const cotizacion = existing.rows[0];

  // Tarifas "estimado" (sacadas de referencias de mercado, no de un catalogo
  // curado por costo real) para las lineas fijas de servicio/tablero que se
  // repiten en toda cotizacion - se auto-seleccionan aca para no obligar a
  // elegirlas a mano cada vez, pero quedan marcadas (estimado:true) para
  // revision antes de enviar. Las lineas por troncal (cable/termica/puntos)
  // NO se auto-matchean: varian caso a caso y deben elegirse a mano.
  const { rows: catalogoActivo } = await pool.query('SELECT * FROM comercial_catalogo_items WHERE activo = TRUE');
  const buscarDefault = (categoria, matchNombre) => catalogoActivo.find(
    (c) => c.estimado && c.categoria === categoria && (!matchNombre || c.nombre.includes(matchNombre)),
  );
  const buscarPorNombre = (matchNombre) => catalogoActivo.find((c) => c.nombre.includes(matchNombre));

  // Dimensionado de switch por troncal: 1 puerto por cochera + 1 de uplink,
  // redondeado a la serie real de switches ya cargada en catalogo (8/16/24/48
  // puertos, TP-Link TL-SG10xx).
  const PUERTOS_SWITCH_DISPONIBLES = [8, 16, 24, 48];
  const puertosNecesarios = (cantCocheras) => {
    const necesarios = (Number(cantCocheras) || 0) + 1;
    return PUERTOS_SWITCH_DISPONIBLES.find((p) => p >= necesarios) ?? PUERTOS_SWITCH_DISPONIBLES[PUERTOS_SWITCH_DISPONIBLES.length - 1];
  };
  const buscarSwitch = (puertos) => catalogoActivo.find((c) => c.categoria === 'Red Ethernet' && c.nombre.includes(`${puertos} puertos`));

  // Match al tamaño mas cercano DISPONIBLE en catalogo (nunca hacia abajo -
  // nunca subdimensionar cable/proteccion) para cable de troncal y termica,
  // que hasta ahora quedaban siempre pendiente_precio aunque el catalogo ya
  // tuviera un item que sirve. Sin esto el vendedor tenia que elegir a mano
  // cada linea de cada troncal, incluso cuando el match obvio ya existia.
  const buscarCableMasCercano = (mm2Necesario) => {
    const candidatos = catalogoActivo
      .map((c) => {
        const m = c.nombre.match(/3x(\d+(?:\.\d+)?)mm2/i);
        return m ? { item: c, mm2: Number(m[1]) } : null;
      })
      .filter((c) => c && c.mm2 >= mm2Necesario)
      .sort((a, b) => a.mm2 - b.mm2);
    return candidatos[0]?.item ?? null;
  };
  const buscarTermicaMasCercana = (calibreNecesario) => {
    const candidatos = catalogoActivo
      .filter((c) => /llave termica|mccb/i.test(c.nombre))
      .map((c) => {
        const rango = c.nombre.match(/(\d+)\s*-\s*(\d+)A/i);
        if (rango) return { item: c, ampMax: Number(rango[2]) };
        const unico = c.nombre.match(/(\d+)A\b/i);
        return unico ? { item: c, ampMax: Number(unico[1]) } : null;
      })
      .filter((c) => c && c.ampMax >= calibreNecesario)
      .sort((a, b) => a.ampMax - b.ampMax);
    return candidatos[0]?.item ?? null;
  };

  const linea = (categoria, descripcion, unidad, cantidad, defaultItem) => {
    if (defaultItem) {
      const precio = Number(defaultItem.precio_unitario);
      return {
        categoria, catalogo_item_id: defaultItem.id, descripcion, unidad, cantidad,
        precio_unitario: precio, costo: defaultItem.costo != null ? Number(defaultItem.costo) : null,
        subtotal: precio * cantidad, pendiente_precio: false, estimado: !!defaultItem.estimado,
      };
    }
    return {
      categoria, catalogo_item_id: null, descripcion, unidad, cantidad,
      precio_unitario: null, costo: null, subtotal: null, pendiente_precio: true,
    };
  };

  const lineas = [];
  for (const piso of cotizacion.pisos || []) {
    for (const troncal of piso.troncales || []) {
      const nombreTroncal = `${troncal.nombre || `Troncal ${troncal.id}`} (piso ${piso.nombre || piso.id})`;
      if (troncal.calculo) {
        const metros = (Number(troncal.distancia_tablero_a_inicio_m) || 0) + (Number(troncal.longitud_troncal_m) || 0);
        lineas.push(linea(
          'Cableado y canalizaciones',
          `Cable ${troncal.calculo.seccion_mm2}mm2 - ${nombreTroncal}`,
          'm',
          metros,
          buscarCableMasCercano(troncal.calculo.seccion_mm2),
        ));
        const calibreTxt = troncal.calculo.calibre_termica_a != null
          ? `${troncal.calculo.calibre_termica_a}A`
          : 'a definir por proyecto (corriente fuera de rango normalizado, ver advertencia)';
        lineas.push(linea(
          'Tableros y protecciones',
          `Termica ${calibreTxt} - ${nombreTroncal}`,
          'un',
          1,
          troncal.calculo.calibre_termica_a != null ? buscarTermicaMasCercana(troncal.calculo.calibre_termica_a) : null,
        ));
      }
      const cantCocheras = (troncal.cocheras || []).length;
      lineas.push(linea(
        'Red Ethernet',
        `Puntos Ethernet Cat6 - ${nombreTroncal}`,
        'un',
        cantCocheras,
        buscarPorNombre('Punto de red Ethernet Cat6'),
      ));

      // Red/alimentacion por troncal: siempre se agrega 1 switch dimensionado
      // a la cantidad de cocheras de ESE troncal (no uno generico para todo
      // el edificio), mas el cableado de alimentacion 220V y el backbone UTP
      // que lo conectan de vuelta al tablero/gateway.
      const puertos = puertosNecesarios(cantCocheras);
      lineas.push(linea('Red Ethernet', `Switch ${puertos} puertos - ${nombreTroncal}`, 'un', 1, buscarSwitch(puertos)));
      const metrosRun = (Number(troncal.distancia_tablero_a_inicio_m) || 0) + (Number(troncal.longitud_troncal_m) || 0);
      lineas.push(linea('Cableado y canalizaciones', `Cable 220V p/switch - ${nombreTroncal}`, 'm', metrosRun, buscarPorNombre('Cable cobre 3x1.5mm2')));
      lineas.push(linea('Red Ethernet', `Cable UTP backbone (uplink switch) - ${nombreTroncal}`, 'm', metrosRun, buscarPorNombre('Cable UTP Cat6')));
      lineas.push(linea('Red Ethernet', `Conectores RJ-45 (backbone) - ${nombreTroncal}`, 'un', 2, buscarPorNombre('Ficha RJ-45')));
    }
  }

  const infra = cotizacion.infraestructura || {};
  // Router, medidor general + gateway Modbus y su fuente: infraestructura
  // base obligatoria de todo el sistema (siempre 1 de cada uno), ya no
  // depende de tildar checkboxes a mano.
  lineas.push(linea('Comunicaciones', 'Router WAN + 4G/LTE failover', 'un', 1, buscarPorNombre('Router doble WAN')));
  lineas.push(linea('Medición', 'Medidor trifasico general del edificio, RS485/Modbus (incluye gateway Modbus TCP - ver kit)', 'un', 1, buscarPorNombre('Gateway Modbus Ethernet AWT100')));
  lineas.push(linea('Comunicaciones', 'Fuente 24V DIN p/gateway Modbus', 'un', 1, buscarPorNombre('Fuente 220v a 24v')));
  if (infra.tablero_principal) lineas.push(linea('Tableros y protecciones', 'Tablero principal EV', 'un', 1, buscarDefault('Tableros y protecciones', 'Tablero principal')));

  for (const wb of cotizacion.wallboxes || []) {
    for (const item of wb.items_generados || []) {
      lineas.push(linea('Wallboxes iniciales', `${item.descripcion} - cochera ${wb.cochera_id}`, item.unidad, item.cantidad));
    }
  }

  lineas.push(linea('Ingeniería', 'Proyecto e ingenieria de detalle', 'gl', 1, buscarDefault('Ingeniería')));
  lineas.push(linea('Mano de obra', 'Instalacion de infraestructura', 'gl', 1, buscarDefault('Mano de obra')));
  lineas.push(linea('Puesta en marcha', 'Puesta en marcha, configuracion CSMS/OCPP y pruebas', 'gl', 1, buscarDefault('Puesta en marcha')));

  const result = await pool.query(
    `UPDATE comercial_cotizaciones SET bom = $1, actualizado_en = NOW() WHERE id = $2 RETURNING *`,
    [JSON.stringify(lineas), req.params.id],
  );
  res.json({ ...result.rows[0], disclaimer_predimensionado: DISCLAIMER_PREDIMENSIONADO });
});

router.delete('/cotizaciones/:id', async (req, res) => {
  const result = await pool.query(`DELETE FROM comercial_cotizaciones WHERE id = $1 AND estado = 'borrador'`, [req.params.id]);
  if (result.rowCount === 0) {
    return res.status(409).json({ error: 'Solo se puede borrar una cotizacion en borrador.' });
  }
  res.status(204).end();
});

// HTML con estilos inline (los clientes de mail no cargan hojas de estilo
// externas ni respetan className/Tailwind) - misma estructura/contenido que
// CotizacionImprimir.jsx, reescrita para email. Nunca incluye costo interno,
// catalogo_item_id ni margen por separado - mismo criterio que la vista de
// impresion (marketing/cotizador.md seccion 42).
// Resumen ejecutivo, NO itemizado - el mail nunca lista los items del BOM
// uno por uno (eso queda solo para consulta interna via "Detalle interno" /
// "Vista de impresion" dentro del sistema, ambos detras de login). El mail
// muestra: como se estructura el proyecto (pisos/troncales/cocheras, sin
// precios), que sistemas incluye (derivado de lo que realmente tiene esta
// cotizacion, no una lista fija), presupuesto por rubro (no por item) y el
// total.
function generarHtmlCotizacionMail(cot) {
  const margenFactor = 1 + (Number(cot.margen_pct) || 0) / 100;
  const ivaFactor = (Number(cot.iva_pct) || 0) / 100;

  const categorias = [];
  for (const linea of cot.bom || []) {
    const precioFinal = (Number(linea.precio_unitario) || 0) * margenFactor;
    const subtotal = (Number(linea.cantidad) || 0) * precioFinal;
    let cat = categorias.find((c) => c.nombre === linea.categoria);
    if (!cat) { cat = { nombre: linea.categoria, subtotal: 0 }; categorias.push(cat); }
    cat.subtotal += subtotal;
  }
  const subtotalGeneral = categorias.reduce((s, c) => s + c.subtotal, 0);
  const ivaMonto = subtotalGeneral * ivaFactor;
  const totalGeneral = subtotalGeneral + ivaMonto;

  const pisos = cot.pisos || [];
  const troncalesFlat = pisos.flatMap((p) => (p.troncales || []).map((t) => ({ ...t, pisoNombre: p.nombre })));
  const cocherasPreparadas = troncalesFlat.reduce((s, t) => s + (t.cocheras || []).length, 0);

  const estructuraHtml = troncalesFlat.length === 0 ? '' : `
    <div style="margin-top:28px;">
      <h2 style="border-bottom:2px solid #2563eb;padding-bottom:4px;font-size:16px;color:#1d4ed8;">Estructura del proyecto</h2>
      <p style="font-size:13px;color:#334155;">
        ${pisos.length} piso${pisos.length === 1 ? '' : 's'}, ${troncalesFlat.length} troncal${troncalesFlat.length === 1 ? '' : 'es'} de alimentacion,
        preparando ${cocherasPreparadas} cochera${cocherasPreparadas === 1 ? '' : 's'} para carga de vehiculos electricos.
      </p>
      <table style="width:100%;font-size:13px;border-collapse:collapse;margin-top:8px;">
        <thead><tr style="text-align:left;color:#94a3b8;font-size:11px;text-transform:uppercase;">
          <th style="padding:4px 0;">Piso</th><th style="padding:4px 0;">Troncal</th><th style="padding:4px 0;text-align:right;">Cocheras</th>
        </tr></thead>
        <tbody>
          ${troncalesFlat.map((t) => `<tr style="border-top:1px solid #f1f5f9;">
            <td style="padding:4px 0;">${t.pisoNombre || '-'}</td>
            <td style="padding:4px 0;">${t.nombre || '-'}</td>
            <td style="padding:4px 0;text-align:right;">${(t.cocheras || []).length}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;

  const infra = cot.infraestructura || {};
  const tieneCategoria = (nombre) => categorias.some((c) => c.nombre === nombre);
  const sistemas = ['Balanceo dinamico de carga (DLM): la energia se reparte automaticamente entre los vehiculos conectados sin superar nunca la capacidad electrica del edificio.'];
  if (tieneCategoria('Comunicaciones')) {
    sistemas.push('Conectividad a internet: conexion principal del edificio, mas respaldo 4G/LTE independiente para que el sistema siga operativo ante una falla de conectividad.');
  }
  if (tieneCategoria('Medición')) {
    sistemas.push('Medicion electrica en tiempo real (RS485/Modbus): consumo del edificio y de cada punto de carga, disponible para reportes y facturacion.');
  }
  if (infra.tablero_principal) {
    sistemas.push('Tablero principal EV nuevo, dedicado a la infraestructura de carga.');
  }
  if (tieneCategoria('Red Ethernet')) {
    sistemas.push('Red de datos Ethernet dedicada, con un switch por troncal dimensionado a la cantidad de cocheras de ese tramo.');
  }

  const sistemasHtml = `
    <div style="margin-top:28px;">
      <h2 style="border-bottom:2px solid #2563eb;padding-bottom:4px;font-size:16px;color:#1d4ed8;">Sistemas incluidos</h2>
      <ul style="font-size:13px;color:#334155;padding-left:18px;margin:8px 0 0;">
        ${sistemas.map((s) => `<li style="margin-bottom:6px;">${s}</li>`).join('')}
      </ul>
    </div>
  `;

  const categoriasHtml = categorias.length === 0 ? '' : `
    <div style="margin-top:28px;">
      <h2 style="border-bottom:2px solid #2563eb;padding-bottom:4px;font-size:16px;color:#1d4ed8;">Presupuesto por rubro</h2>
      <table style="width:100%;font-size:13px;border-collapse:collapse;margin-top:4px;">
        <tbody>
          ${categorias.map((c) => `<tr style="border-top:1px solid #f1f5f9;">
            <td style="padding:5px 0;">${c.nombre}</td>
            <td style="padding:5px 0;text-align:right;font-weight:600;">${moneyMail(c.subtotal)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;max-width:640px;margin:0 auto;">
    <h1 style="font-size:20px;margin-bottom:2px;">COTIZACION DE INFRAESTRUCTURA EV</h1>
    ${cot.codigo ? `<p style="font-size:12px;color:#64748b;margin-top:0;">${cot.codigo}</p>` : ''}
    <table style="width:100%;font-size:13px;">
      <tr style="border-top:1px solid #f1f5f9;"><td style="width:35%;padding:4px 0;color:#64748b;">Para</td><td style="padding:4px 0;">${cot.apellido}, ${cot.nombre}</td></tr>
      <tr style="border-top:1px solid #f1f5f9;"><td style="padding:4px 0;color:#64748b;">Edificio</td><td style="padding:4px 0;">${cot.edificio?.nombre || '-'}${cot.edificio?.direccion ? ` - ${cot.edificio.direccion}` : ''}</td></tr>
      <tr style="border-top:1px solid #f1f5f9;"><td style="padding:4px 0;color:#64748b;">Fecha de emision</td><td style="padding:4px 0;">${fechaMail(cot.fecha)}</td></tr>
      ${cot.validez_hasta ? `<tr style="border-top:1px solid #f1f5f9;"><td style="padding:4px 0;color:#64748b;">Validez de la oferta</td><td style="padding:4px 0;">${fechaMail(cot.validez_hasta)}</td></tr>` : ''}
    </table>

    ${estructuraHtml}
    ${sistemasHtml}
    ${categoriasHtml}

    <div style="margin-top:28px;border-top:2px solid #0f172a;padding-top:10px;text-align:right;">
      <p style="font-size:13px;color:#475569;margin:2px 0;">Subtotal: ${moneyMail(subtotalGeneral)}</p>
      <p style="font-size:13px;color:#475569;margin:2px 0;">IVA (${Number(cot.iva_pct) || 0}%): ${moneyMail(ivaMonto)}</p>
      <p style="font-size:18px;font-weight:700;margin:6px 0 0;">Total general: ${moneyMail(totalGeneral)}</p>
    </div>

    <div style="margin-top:24px;background:#fffbeb;padding:12px;border-radius:8px;">
      <p style="font-size:11px;color:#92400e;margin:0;">${DISCLAIMER_PREDIMENSIONADO}</p>
    </div>
    ${cot.clausulas ? `<div style="margin-top:20px;"><h2 style="font-size:12px;text-transform:uppercase;color:#64748b;border-bottom:1px solid #e2e8f0;padding-bottom:4px;">Condiciones comerciales</h2><p style="font-size:11px;color:#475569;white-space:pre-line;">${cot.clausulas}</p></div>` : ''}
    <p style="margin-top:10px;font-size:11px;color:#94a3b8;">El detalle completo de materiales y precios unitarios queda disponible para consulta interna del equipo BILON.</p>
    <p style="margin-top:24px;text-align:center;font-size:11px;color:#94a3b8;">Smart & Safe / BILON - Gestion inteligente de edificios</p>
  </div>`;
}

router.post('/cotizaciones/:id/enviar-mail', async (req, res) => {
  const result = await pool.query(
    `SELECT q.*, c.nombre, c.apellido, c.email
     FROM comercial_cotizaciones q
     JOIN comercial_contactos c ON c.id = q.contacto_id
     WHERE q.id = $1`,
    [req.params.id],
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Cotizacion no encontrada.' });
  const cot = result.rows[0];
  if (!cot.email) return res.status(400).json({ error: 'El contacto no tiene email cargado.' });
  const pendientes = (cot.bom || []).filter((l) => l.pendiente_precio).length;
  if (pendientes > 0) {
    return res.status(400).json({ error: `No se puede enviar: ${pendientes} item(s) del presupuesto sin precio cargado.` });
  }

  const html = generarHtmlCotizacionMail(cot);
  const responsableNombre = await responsableActual(req);
  try {
    await enviarYRegistrarMail({
      to: cot.email,
      subject: `Cotizacion${cot.codigo ? ` ${cot.codigo}` : ''} - Infraestructura EV - BILON`,
      html,
      text: html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
      contactoId: cot.contacto_id,
      responsableNombre,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'No se pudo enviar el mail.' });
  }
  await pool.query(
    `UPDATE comercial_contactos SET estado_comercial = 'Presupuesto enviado', actualizado_en = NOW() WHERE id = $1 AND estado_comercial NOT IN ('Ganado','Perdido')`,
    [cot.contacto_id],
  );
  res.json({ enviado: true, to: cot.email });
});

// Busca un precio de referencia REAL en internet (MercadoLibre Argentina de
// preferencia) para UNA linea puntual del BOM que no tiene match en el
// catalogo - accion explicita por linea (nunca automatica al generar el BOM)
// para que un precio de IA nunca se cuele en una cotizacion sin que el
// vendedor lo vea y confirme. Usa perplexity/sonar (modelo con busqueda web
// real en OpenRouter, no un chat comun) y exige que la IA devuelva null si
// no encontro una fuente real, en vez de inventar un numero.
router.post('/cotizaciones/:id/bom/:index/buscar-ia', async (req, res) => {
  if (!process.env.OPENROUTER_API_KEY) {
    return res.status(500).json({ error: 'Falta configurar OPENROUTER_API_KEY en el servidor.' });
  }
  const idx = Number(req.params.index);
  const result = await pool.query('SELECT * FROM comercial_cotizaciones WHERE id = $1', [req.params.id]);
  if (result.rowCount === 0) return res.status(404).json({ error: 'Cotizacion no encontrada.' });
  const cot = result.rows[0];
  const bom = cot.bom || [];
  if (!Number.isInteger(idx) || idx < 0 || idx >= bom.length) {
    return res.status(400).json({ error: 'Indice de item invalido.' });
  }
  const itemLinea = bom[idx];

  // Pregunta en lenguaje natural (no una instruccion de "devolve solo JSON")
  // - probado en produccion: pedirle JSON puro desde el vamos lo vuelve
  // demasiado conservador y devuelve null incluso para items que SI
  // encuentra en busqueda libre. Dejandolo razonar/buscar normal y pidiendo
  // el JSON solo al final, en la ultima linea, encuentra bien y sigue
  // devolviendo null cuando corresponde (no inventa).
  const prompt = `Busca en internet (preferentemente MercadoLibre Argentina; si no hay resultado ahi, en otro sitio argentino confiable) el precio de venta actual en pesos argentinos de: ${itemLinea.descripcion} (categoria: ${itemLinea.categoria}, unidad: ${itemLinea.unidad}). Es para presupuestar una obra de infraestructura electrica/carga de vehiculos electricos en Argentina.

Si no encontras nada que coincida ni siquiera aproximadamente, decilo claramente - nunca inventes un numero sin una fuente real que lo respalde.

Al final de tu respuesta, en la ULTIMA linea y solo ahi, escribi un objeto JSON de una sola linea con el resultado:
{"precio_ars": number o null, "fuente_url": string o null, "nota": "frase corta"}`;

  try {
    const aiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'perplexity/sonar', messages: [{ role: 'user', content: prompt }], temperature: 0,
      }),
    });
    const data = await aiRes.json();
    if (!aiRes.ok) {
      console.error('Error de OpenRouter (buscar-ia):', data);
      return res.status(502).json({ error: 'El servicio de IA no pudo buscar el precio.' });
    }
    const fullText = (data.choices?.[0]?.message?.content ?? '').trim();
    const lineas = fullText.split('\n').map((l) => l.trim()).filter(Boolean);
    const lineaJson = [...lineas].reverse().find((l) => l.startsWith('{') && l.endsWith('}'));
    let resultado;
    try {
      resultado = JSON.parse(lineaJson || fullText);
    } catch {
      console.error('IA devolvio JSON invalido (buscar-ia):', fullText);
      return res.status(502).json({ error: 'La IA no devolvio un formato valido - proba de nuevo o cargalo a mano.' });
    }

    const precio = Number(resultado.precio_ars);
    if (!resultado.precio_ars || !Number.isFinite(precio) || precio <= 0) {
      return res.json({
        encontrado: false,
        nota: resultado.nota || 'La IA no encontro un precio de referencia confiable para este item.',
      });
    }

    const primeraCita = data.choices?.[0]?.message?.annotations?.find((a) => a.type === 'url_citation')?.url_citation?.url;
    const fuenteUrl = resultado.fuente_url || primeraCita || null;
    const nuevaLinea = {
      ...itemLinea,
      precio_unitario: precio,
      costo: precio,
      subtotal: precio * (Number(itemLinea.cantidad) || 0),
      pendiente_precio: false,
      estimado: true,
      fuente_ia: fuenteUrl,
      catalogo_item_id: null,
    };
    const nuevoBom = [...bom];
    nuevoBom[idx] = nuevaLinea;

    const updateResult = await pool.query(
      `UPDATE comercial_cotizaciones SET bom = $1, actualizado_en = NOW() WHERE id = $2 RETURNING *`,
      [JSON.stringify(nuevoBom), req.params.id],
    );
    res.json({
      encontrado: true, cotizacion: updateResult.rows[0], nota: resultado.nota, fuente_url: fuenteUrl,
    });
  } catch (err) {
    console.error('Error llamando a OpenRouter (buscar-ia):', err);
    res.status(502).json({ error: 'No se pudo conectar con el servicio de IA.' });
  }
});

// ---------------------------------------------------------------------------
// Relevamiento tecnico
// ---------------------------------------------------------------------------

router.get('/contactos/:id/relevamientos', async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM comercial_relevamientos WHERE contacto_id = $1 ORDER BY fecha DESC, id DESC',
    [req.params.id],
  );
  res.json(result.rows);
});

router.get('/relevamientos/:id', async (req, res) => {
  const result = await pool.query(
    `SELECT r.*, c.nombre, c.apellido, c.administracion_empresa
     FROM comercial_relevamientos r JOIN comercial_contactos c ON c.id = r.contacto_id
     WHERE r.id = $1`,
    [req.params.id],
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Relevamiento no encontrado.' });
  res.json(result.rows[0]);
});

router.post('/contactos/:id/relevamientos', async (req, res) => {
  const { visita_id: visitaId } = req.body ?? {};
  const responsableNombre = await responsableActual(req);
  const result = await pool.query(
    `INSERT INTO comercial_relevamientos (contacto_id, visita_id, realizado_por)
     VALUES ($1,$2,$3) RETURNING *`,
    [req.params.id, visitaId ?? null, responsableNombre],
  );
  res.status(201).json(result.rows[0]);
});

router.put('/relevamientos/:id', async (req, res) => {
  const {
    edificio_nombre: edificioNombre, direccion, uf_count: ufCount, cocheras_count: cocherasCount,
    tableros, tarifa_categoria: tarifaCategoria, potencia_contratada: potenciaContratada,
    demanda_maxima: demandaMaxima, fecha_demanda_maxima: fechaDemandaMaxima, generador,
    cargadores_existentes: cargadoresExistentes, notas, estado,
  } = req.body ?? {};
  if (estado && !['borrador', 'revisado'].includes(estado)) {
    return res.status(400).json({ error: 'estado invalido.' });
  }
  const result = await pool.query(
    `UPDATE comercial_relevamientos SET
       edificio_nombre = COALESCE($1, edificio_nombre), direccion = COALESCE($2, direccion),
       uf_count = COALESCE($3, uf_count), cocheras_count = COALESCE($4, cocheras_count),
       tableros = COALESCE($5, tableros), tarifa_categoria = COALESCE($6, tarifa_categoria),
       potencia_contratada = COALESCE($7, potencia_contratada), demanda_maxima = COALESCE($8, demanda_maxima),
       fecha_demanda_maxima = COALESCE($9, fecha_demanda_maxima), generador = COALESCE($10, generador),
       cargadores_existentes = COALESCE($11, cargadores_existentes), notas = COALESCE($12, notas),
       estado = COALESCE($13, estado), actualizado_en = NOW()
     WHERE id = $14 RETURNING *`,
    [edificioNombre ?? null, direccion ?? null, ufCount ?? null, cocherasCount ?? null,
      tableros !== undefined ? JSON.stringify(tableros) : null, tarifaCategoria ?? null,
      potenciaContratada ?? null, demandaMaxima ?? null, fechaDemandaMaxima ?? null,
      generador !== undefined ? JSON.stringify(generador) : null,
      cargadoresExistentes !== undefined ? JSON.stringify(cargadoresExistentes) : null,
      notas ?? null, estado ?? null, req.params.id],
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Relevamiento no encontrado.' });

  // Un relevamiento en curso hace avanzar al contacto en el embudo.
  if (result.rowCount > 0) {
    await pool.query(
      `UPDATE comercial_contactos SET estado_comercial = 'Relevamiento tecnico', actualizado_en = NOW()
       WHERE id = $1 AND estado_comercial IN ('Nuevo','Contactado','Interesado','Reunion agendada')`,
      [result.rows[0].contacto_id],
    );
  }
  res.json(result.rows[0]);
});

router.post('/relevamientos/:id/archivos', upload.single('archivo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'archivo es requerido.' });
  const tipo = req.body?.tipo === 'documento' ? 'documento' : 'foto';
  const columna = tipo === 'documento' ? 'documentos' : 'fotos';
  const entry = { nombre: req.file.originalname, filename: req.file.filename, tipo };

  const result = await pool.query(
    `UPDATE comercial_relevamientos SET ${columna} = ${columna} || $1::jsonb, actualizado_en = NOW()
     WHERE id = $2 RETURNING *`,
    [JSON.stringify([entry]), req.params.id],
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Relevamiento no encontrado.' });
  res.status(201).json(result.rows[0]);
});

// ---------------------------------------------------------------------------
// Informes tecnicos (generados a partir de un relevamiento, con calculos de
// ingenieria automaticos - misma logica que el dictamen de referencia:
// corriente monofasica vs trifasica, margen de potencia contratada, y
// capacidad real del grupo electrogeno segun su ajuste de disparo).
// ---------------------------------------------------------------------------

function calcularInforme(relevamiento) {
  const cargadores = (relevamiento.cargadores_existentes || []).map((c) => {
    const p = Number(c.potencia_kw) || 0;
    let corrienteA;
    let riesgo;
    let nota;
    if (c.fases === 'Trifasico') {
      corrienteA = (p * 1000) / (Math.sqrt(3) * 380);
      riesgo = false;
      nota = 'Carga trifasica equilibrada: la corriente resultante en el neutro se anula.';
    } else {
      corrienteA = (p * 1000) / 220;
      riesgo = true;
      nota = 'Carga monofasica de alta potencia: exige toda su corriente sobre una sola fase, con riesgo de desbalance y sobrecarga del conductor neutro si se replica en varias unidades.';
    }
    return { ...c, corriente_a: Number(corrienteA.toFixed(2)), riesgo, nota };
  });

  const potenciaContratada = Number(relevamiento.potencia_contratada) || 0;
  const demandaMaxima = Number(relevamiento.demanda_maxima) || 0;
  const margenKw = Number((potenciaContratada - demandaMaxima).toFixed(2));
  const suministro = {
    potencia_contratada: potenciaContratada,
    demanda_maxima: demandaMaxima,
    margen_kw: margenKw,
    estado: margenKw < 0 ? 'Saturado (demanda supera lo contratado)' : margenKw < 5 ? 'Ajustado' : 'Con margen',
  };

  const tarifaComparativa = {
    opcion_a_remanente_kw: Number((49.9 - demandaMaxima).toFixed(2)),
    opcion_a_nota: 'Maximizar Tarifa T2 hasta el limite legal de 49,9 kW. No requiere obra mayor en el pilar ni cambio de medicion.',
    opcion_b_nota: 'Tarifa T3 (Grandes Demandas, +50 kW) requiere medicion indirecta y obra mayor en el pilar - recomendado solo si se proyecta una demanda alta a mediano/largo plazo.',
  };

  let generador = null;
  if (relevamiento.generador && (relevamiento.generador.corriente_nominal || relevamiento.generador.potencia_kva)) {
    const iN = Number(relevamiento.generador.corriente_nominal) || 0;
    const ajuste = Number(relevamiento.generador.ajuste_disparo_pct) || 100;
    const iReal = iN * (ajuste / 100);
    const pMaxW = Math.sqrt(3) * 380 * iReal * 0.85;
    generador = {
      ...relevamiento.generador,
      corriente_real_a: Number(iReal.toFixed(2)),
      potencia_max_kw: Number((pMaxW / 1000).toFixed(2)),
    };
  }

  return {
    cargadores, suministro, tarifa_comparativa: tarifaComparativa, generador,
  };
}

router.get('/relevamientos/:id/informes', async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM comercial_informes WHERE relevamiento_id = $1 ORDER BY version DESC',
    [req.params.id],
  );
  res.json(result.rows);
});

router.get('/informes/:id', async (req, res) => {
  const result = await pool.query(
    `SELECT i.*, r.edificio_nombre, r.direccion, r.uf_count, r.cocheras_count, c.nombre, c.apellido
     FROM comercial_informes i
     JOIN comercial_relevamientos r ON r.id = i.relevamiento_id
     JOIN comercial_contactos c ON c.id = r.contacto_id
     WHERE i.id = $1`,
    [req.params.id],
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Informe no encontrado.' });
  res.json(result.rows[0]);
});

router.post('/relevamientos/:id/informes', async (req, res) => {
  const relevamiento = await pool.query('SELECT * FROM comercial_relevamientos WHERE id = $1', [req.params.id]);
  if (relevamiento.rowCount === 0) return res.status(404).json({ error: 'Relevamiento no encontrado.' });
  const r = relevamiento.rows[0];

  // calcularInforme() usa 0 por defecto para los campos numericos que faltan
  // (Number(x) || 0) - sin esta validacion se puede generar un informe
  // "valido" pero vacio/sin sentido si el relevamiento nunca se completo.
  const faltantes = [];
  if (!r.edificio_nombre?.trim()) faltantes.push('nombre del edificio');
  if (!r.potencia_contratada && !r.demanda_maxima) faltantes.push('potencia contratada o demanda maxima');
  if (faltantes.length > 0) {
    return res.status(400).json({ error: `Completa el relevamiento antes de generar el informe: falta ${faltantes.join(' y ')}.` });
  }

  const version = await pool.query(
    'SELECT COALESCE(MAX(version), 0) + 1 AS v FROM comercial_informes WHERE relevamiento_id = $1',
    [req.params.id],
  );
  const contenido = {
    relevamiento_snapshot: relevamiento.rows[0],
    calculos: calcularInforme(relevamiento.rows[0]),
  };
  const result = await pool.query(
    `INSERT INTO comercial_informes (relevamiento_id, version, contenido) VALUES ($1,$2,$3) RETURNING *`,
    [req.params.id, version.rows[0].v, JSON.stringify(contenido)],
  );
  res.status(201).json(result.rows[0]);
});

router.put('/informes/:id/firmar', async (req, res) => {
  const { firmado_por: firmadoPor, firmado_matricula: firmadoMatricula, firma_datos: firmaDatos } = req.body ?? {};
  if (!firmadoPor || !firmadoMatricula || !firmaDatos) {
    return res.status(400).json({ error: 'firmado_por, firmado_matricula y firma_datos son requeridos.' });
  }
  const result = await pool.query(
    `UPDATE comercial_informes SET
       estado = 'firmado', firmado_por = $1, firmado_matricula = $2, firma_datos = $3, fecha_firma = NOW()
     WHERE id = $4 AND estado = 'borrador' RETURNING *`,
    [firmadoPor, firmadoMatricula, firmaDatos, req.params.id],
  );
  if (result.rowCount === 0) {
    return res.status(409).json({ error: 'El informe no existe o ya esta firmado.' });
  }
  res.json(result.rows[0]);
});

function moneyMail(n) {
  return `$${(Number(n) || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Columnas DATE de postgres llegan como objeto Date (pg las auto-convierte),
// no como string ISO - String(date).slice(0,10) da un timestamp humano tipo
// "Tue Aug 11" en vez de la fecha. Esto normaliza ambos casos.
function fechaMail(v) {
  if (!v) return '-';
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? String(v).slice(0, 10) : d.toISOString().slice(0, 10);
}

// HTML con estilos inline (los clientes de mail no cargan hojas de estilo
// externas ni respetan className/Tailwind) - misma estructura/contenido que
// InformeImprimir.jsx, reescrita para email.
function generarHtmlInformeMail(inf) {
  const { calculos } = inf.contenido;
  const cargadoresHtml = calculos.cargadores.length === 0 ? '' : `
    <h2 style="margin-top:28px;border-bottom:2px solid #2563eb;padding-bottom:4px;font-size:16px;color:#1d4ed8;">3. Analisis de riesgo de cargadores existentes</h2>
    <table style="width:100%;font-size:13px;border-collapse:collapse;">
      <thead><tr style="text-align:left;color:#94a3b8;font-size:11px;text-transform:uppercase;">
        <th style="padding:4px 0;">Equipo</th><th style="padding:4px 0;">Fases</th><th style="padding:4px 0;text-align:right;">Potencia</th><th style="padding:4px 0;text-align:right;">Corriente</th>
      </tr></thead>
      <tbody>
        ${calculos.cargadores.map((c) => `<tr style="border-top:1px solid #f1f5f9;">
          <td style="padding:4px 0;">${c.marca_modelo || '-'}</td>
          <td style="padding:4px 0;">${c.fases}</td>
          <td style="padding:4px 0;text-align:right;">${c.potencia_kw} kW</td>
          <td style="padding:4px 0;text-align:right;">${c.corriente_a} A</td>
        </tr>`).join('')}
      </tbody>
    </table>
    ${calculos.cargadores.map((c, i) => `<p style="margin-top:6px;font-size:11px;color:#475569;"><strong>${c.marca_modelo || `Equipo ${i + 1}`}:</strong> ${c.nota}</p>`).join('')}
  `;
  const generadorHtml = !calculos.generador ? '' : `
    <h2 style="margin-top:28px;border-bottom:2px solid #2563eb;padding-bottom:4px;font-size:16px;color:#1d4ed8;">5. Sistema de respaldo (grupo electrogeno)</h2>
    <table style="width:100%;font-size:13px;">
      <tr style="border-top:1px solid #f1f5f9;"><td style="width:50%;padding:4px 0;color:#64748b;">Potencia nominal</td><td style="padding:4px 0;">${calculos.generador.potencia_kva} kVA</td></tr>
      <tr style="border-top:1px solid #f1f5f9;"><td style="padding:4px 0;color:#64748b;">Corriente nominal / ajuste de disparo</td><td style="padding:4px 0;">${calculos.generador.corriente_nominal} A / ${calculos.generador.ajuste_disparo_pct}%</td></tr>
      <tr style="border-top:1px solid #f1f5f9;"><td style="padding:4px 0;color:#64748b;">Corriente real disponible</td><td style="padding:4px 0;">${calculos.generador.corriente_real_a} A</td></tr>
      <tr style="border-top:1px solid #f1f5f9;"><td style="padding:4px 0;color:#64748b;font-weight:600;">Potencia activa maxima disponible</td><td style="padding:4px 0;font-weight:600;">${calculos.generador.potencia_max_kw} kW</td></tr>
    </table>
  `;
  const firmaHtml = inf.estado === 'firmado'
    ? `<p style="text-align:center;font-size:12px;color:#334155;">Firmado por <strong>${inf.firmado_por}</strong> - Matricula ${inf.firmado_matricula}</p>`
    : `<p style="text-align:center;font-size:12px;font-style:italic;color:#94a3b8;">Pendiente de firma</p>`;

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;max-width:640px;margin:0 auto;">
    <h1 style="font-size:20px;margin-bottom:2px;">INFORME TECNICO DE INGENIERIA</h1>
    <p style="font-size:12px;color:#64748b;margin-top:0;">Analisis de Infraestructura Electrica para Movilidad Electrica (VE)</p>
    <p style="font-size:13px;">
      <strong>Ubicacion:</strong> ${inf.edificio_nombre || '-'}${inf.direccion ? `, ${inf.direccion}` : ''}<br>
      <strong>Cliente:</strong> ${inf.apellido}, ${inf.nombre}<br>
      <strong>Version:</strong> ${inf.version}
    </p>

    <h2 style="margin-top:28px;border-bottom:2px solid #2563eb;padding-bottom:4px;font-size:16px;color:#1d4ed8;">1. Relevamiento de infraestructura</h2>
    <table style="width:100%;font-size:13px;">
      <tr style="border-top:1px solid #f1f5f9;"><td style="width:50%;padding:4px 0;color:#64748b;">Unidades funcionales</td><td style="padding:4px 0;">${inf.uf_count ?? '-'}</td></tr>
      <tr style="border-top:1px solid #f1f5f9;"><td style="padding:4px 0;color:#64748b;">Plazas de estacionamiento</td><td style="padding:4px 0;">${inf.cocheras_count ?? '-'}</td></tr>
    </table>

    <h2 style="margin-top:28px;border-bottom:2px solid #2563eb;padding-bottom:4px;font-size:16px;color:#1d4ed8;">2. Capacidad de suministro</h2>
    <table style="width:100%;font-size:13px;">
      <tr style="border-top:1px solid #f1f5f9;"><td style="width:50%;padding:4px 0;color:#64748b;">Potencia contratada</td><td style="padding:4px 0;">${calculos.suministro.potencia_contratada} kW</td></tr>
      <tr style="border-top:1px solid #f1f5f9;"><td style="padding:4px 0;color:#64748b;">Demanda maxima registrada</td><td style="padding:4px 0;">${calculos.suministro.demanda_maxima} kW</td></tr>
      <tr style="border-top:1px solid #f1f5f9;"><td style="padding:4px 0;color:#64748b;">Margen disponible</td><td style="padding:4px 0;">${calculos.suministro.margen_kw} kW</td></tr>
      <tr style="border-top:1px solid #f1f5f9;"><td style="padding:4px 0;color:#64748b;">Estado</td><td style="padding:4px 0;font-weight:600;">${calculos.suministro.estado}</td></tr>
    </table>

    ${cargadoresHtml}

    <h2 style="margin-top:28px;border-bottom:2px solid #2563eb;padding-bottom:4px;font-size:16px;color:#1d4ed8;">4. Planificacion de infraestructura</h2>
    <p style="font-size:13px;"><strong>Opcion A - Maximizar Tarifa T2 (49,9 kW):</strong> ${calculos.tarifa_comparativa.opcion_a_nota} Remanente estimado ${calculos.tarifa_comparativa.opcion_a_remanente_kw} kW.</p>
    <p style="font-size:13px;"><strong>Opcion B - Tarifa T3 (+50 kW):</strong> ${calculos.tarifa_comparativa.opcion_b_nota}</p>

    ${generadorHtml}

    <h2 style="margin-top:28px;border-bottom:2px solid #2563eb;padding-bottom:4px;font-size:16px;color:#1d4ed8;">6. Conclusion</h2>
    <p style="font-size:13px;color:#334155;">
      El presente relevamiento establece la infraestructura de recarga de vehiculos electricos (IRVE) segun lo detallado en las
      secciones anteriores, en conformidad con la reglamentacion AEA 90364-7-722 (Instalaciones Electricas en Inmuebles -
      Suministro para Vehiculos Electricos). Se recomienda una arquitectura centralizada con gestion dinamica de carga (DLM)
      bajo protocolo OCPP para garantizar que la sumatoria de potencia de los cargadores nunca supere el limite fisico de la
      acometida principal.
    </p>

    <div style="margin-top:32px;">${firmaHtml}</div>
    <p style="margin-top:24px;text-align:center;font-size:11px;color:#94a3b8;">BILON Smart Buildings - Gestion inteligente de edificios</p>
  </div>`;
}

router.post('/informes/:id/enviar-mail', async (req, res) => {
  const result = await pool.query(
    `SELECT i.*, r.edificio_nombre, r.direccion, r.uf_count, r.cocheras_count, c.id AS contacto_id, c.nombre, c.apellido, c.email
     FROM comercial_informes i
     JOIN comercial_relevamientos r ON r.id = i.relevamiento_id
     JOIN comercial_contactos c ON c.id = r.contacto_id
     WHERE i.id = $1`,
    [req.params.id],
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Informe no encontrado.' });
  const inf = result.rows[0];
  if (!inf.email) return res.status(400).json({ error: 'El contacto no tiene email cargado.' });

  const html = generarHtmlInformeMail(inf);
  const responsableNombre = await responsableActual(req);
  try {
    await enviarYRegistrarMail({
      to: inf.email,
      subject: `Informe tecnico - ${inf.edificio_nombre || `${inf.apellido}, ${inf.nombre}`} - BILON`,
      html,
      text: html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
      contactoId: inf.contacto_id,
      responsableNombre,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'No se pudo enviar el mail.' });
  }
  res.json({ enviado: true, to: inf.email });
});

// ---------------------------------------------------------------------------
// Importar contactos: Excel/CSV, PDF, imagen o texto - con IA. Solo
// previsualiza (no escribe en la base) hasta que el usuario confirma.
// ---------------------------------------------------------------------------

const IMPORTAR_CONTACTOS_PROMPT = `Sos un asistente que extrae datos de contactos comerciales (personas o administraciones/empresas de consorcios) a partir de un documento, planilla, imagen o texto.
Devolve EXCLUSIVAMENTE un array JSON valido (sin texto adicional, sin markdown, sin backticks), donde cada elemento tiene EXACTAMENTE estos campos:
- apellido (string, requerido)
- nombre (string, requerido)
- tipo_contacto (string, uno de: "Socio/a", "Egresado", "Administrador", "Consorcista", "Proveedor", "Otros" - "Otros" si no se puede inferir)
- email (string o null)
- telefono (string o null)
- administracion_empresa (string o null)
- cuit (string o null)
- zona (string o null)
- observaciones (string o null - cualquier dato adicional relevante que no entre en los campos anteriores)

Si una fila/contacto no tiene apellido y nombre identificables, omitila. No inventes datos que no esten en el documento. Si el documento no tiene contactos, devolve un array vacio [].`;

router.post('/contactos/importar-preview', uploadMemory.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Falta el archivo.' });
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
          { type: 'text', text: IMPORTAR_CONTACTOS_PROMPT },
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
        ],
      }];
    } else {
      let rawContent;
      if (name.endsWith('.pdf')) {
        rawContent = (await pdfParse(req.file.buffer)).text;
      } else if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv')) {
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        rawContent = JSON.stringify(XLSX.utils.sheet_to_json(sheet, { defval: '' }));
      } else if (name.endsWith('.txt') || name.endsWith('.csv')) {
        rawContent = req.file.buffer.toString('utf8');
      } else {
        rawContent = req.file.buffer.toString('utf8');
      }
      if (!rawContent || !rawContent.trim()) {
        return res.status(400).json({ error: 'El archivo no tiene contenido legible. Proba con una imagen o una planilla.' });
      }
      messages = [{ role: 'user', content: `${IMPORTAR_CONTACTOS_PROMPT}\n\nContenido del documento:\n${rawContent.slice(0, 60000)}` }];
    }
  } catch (err) {
    console.error('Error leyendo archivo de import de contactos:', err);
    return res.status(400).json({ error: 'No se pudo leer el archivo. Verifica que no este corrupto.' });
  }

  try {
    const aiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: 'anthropic/claude-sonnet-5', messages, temperature: 0 }),
    });
    const data = await aiRes.json();
    if (!aiRes.ok) {
      console.error('Error de OpenRouter:', data);
      return res.status(502).json({ error: 'El servicio de IA no pudo procesar el archivo.' });
    }
    let text = (data.choices?.[0]?.message?.content ?? '').trim();
    text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/, '');
    let extraidos;
    try {
      extraidos = JSON.parse(text);
    } catch {
      console.error('IA devolvio JSON invalido:', text);
      return res.status(502).json({ error: 'La IA no devolvio un formato valido. Proba con un archivo mas claro o carga los contactos a mano.' });
    }
    if (!Array.isArray(extraidos)) extraidos = [];

    const emails = extraidos.map((c) => c.email).filter(Boolean).map((e) => e.toLowerCase());
    const existentes = emails.length > 0
      ? await pool.query('SELECT LOWER(email) AS email FROM comercial_contactos WHERE LOWER(email) = ANY($1)', [emails])
      : { rows: [] };
    const emailsExistentes = new Set(existentes.rows.map((r) => r.email));

    res.json(extraidos.map((c) => ({ ...c, duplicado: c.email ? emailsExistentes.has(c.email.toLowerCase()) : false })));
  } catch (err) {
    console.error('Error llamando a OpenRouter:', err);
    res.status(502).json({ error: 'No se pudo comunicar con el servicio de IA.' });
  }
});

router.post('/contactos/importar-confirmar', async (req, res) => {
  const { contactos } = req.body ?? {};
  if (!Array.isArray(contactos) || contactos.length === 0) {
    return res.status(400).json({ error: 'contactos debe ser una lista no vacia.' });
  }
  const responsableNombre = await responsableActual(req);

  let creados = 0;
  const omitidos = [];
  for (const c of contactos) {
    if (!c.apellido || !c.nombre) { omitidos.push(c); continue; }
    // eslint-disable-next-line no-await-in-loop
    const codigo = await siguienteCodigo();
    // eslint-disable-next-line no-await-in-loop
    await pool.query(
      `INSERT INTO comercial_contactos
         (codigo, apellido, nombre, tipo_contacto, email, administracion_empresa, cuit, telefono, zona,
          responsable_usuario_id, responsable_nombre, observaciones)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [codigo, c.apellido, c.nombre, c.tipo_contacto || 'Otros', c.email ?? null, c.administracion_empresa ?? null,
        c.cuit ?? null, c.telefono ?? null, c.zona ?? null, req.user.sub, responsableNombre, c.observaciones ?? null],
    );
    creados += 1;
  }
  res.status(201).json({ creados, omitidos: omitidos.length });
});

// ---------------------------------------------------------------------------
// Agente de tareas: mismo modelo de chat, pero con herramientas acotadas que
// SI leen/escriben datos. Adrede limitado a un set fijo de acciones (no
// ejecuta SQL arbitrario ni codigo) para que el radio de accion sea
// predecible. Solo disponible en /comercial (superadmin y comercial).
// ---------------------------------------------------------------------------

const ESTADOS_VALIDOS = [
  'Nuevo', 'Contactado', 'Interesado', 'Reunion agendada', 'Relevamiento tecnico',
  'Presupuesto enviado', 'Negociacion', 'Ganado', 'Perdido', 'Pausado',
];

const AGENTE_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'buscar_contactos',
      description: 'Busca contactos comerciales por estado, prioridad y/o texto libre (nombre, apellido, email, empresa). Devuelve hasta 20 resultados.',
      parameters: {
        type: 'object',
        properties: {
          estado: { type: 'string', enum: ESTADOS_VALIDOS },
          prioridad: { type: 'string', enum: ['Alta', 'Media', 'Baja'] },
          texto: { type: 'string', description: 'Texto libre a buscar' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'resumen_contacto',
      description: 'Trae el detalle completo de un contacto (datos, ultimos seguimientos, presupuestos) dado su id numerico.',
      parameters: {
        type: 'object',
        properties: { contacto_id: { type: 'integer' } },
        required: ['contacto_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generar_reporte_embudo',
      description: 'Genera y guarda un archivo de texto con el estado actual del embudo de ventas (cantidad de contactos por estado del embudo y por alerta de seguimiento). Devuelve el id del informe generado para que el usuario lo descargue despues.',
      parameters: {
        type: 'object',
        properties: { titulo: { type: 'string' } },
      },
    },
  },
];

async function ejecutarHerramienta(nombre, args, req) {
  if (nombre === 'buscar_contactos') {
    const conditions = [];
    const params = [];
    if (args.estado) { params.push(args.estado); conditions.push(`estado_comercial = $${params.length}`); }
    if (args.prioridad) { params.push(args.prioridad); conditions.push(`prioridad = $${params.length}`); }
    if (args.texto) {
      params.push(`%${args.texto}%`);
      conditions.push(`(nombre ILIKE $${params.length} OR apellido ILIKE $${params.length} OR email ILIKE $${params.length} OR administracion_empresa ILIKE $${params.length})`);
    }
    const result = await pool.query(
      `SELECT id, apellido, nombre, estado_comercial, prioridad, administracion_empresa, responsable_nombre
       FROM comercial_contactos ${conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''}
       ORDER BY apellido LIMIT 20`,
      params,
    );
    return { contactos: result.rows };
  }

  if (nombre === 'resumen_contacto') {
    const contacto = await pool.query('SELECT * FROM comercial_contactos WHERE id = $1', [args.contacto_id]);
    if (contacto.rowCount === 0) return { error: 'Contacto no encontrado.' };
    const seguimientos = await pool.query(
      'SELECT fecha, canal, resultado_resumen, estado_comercial_despues FROM comercial_seguimientos WHERE contacto_id = $1 ORDER BY fecha DESC LIMIT 5',
      [args.contacto_id],
    );
    const presupuestos = await pool.query(
      'SELECT id, fecha, estado, opciones FROM comercial_presupuestos WHERE contacto_id = $1 ORDER BY fecha DESC LIMIT 5',
      [args.contacto_id],
    );
    return { contacto: contacto.rows[0], seguimientos: seguimientos.rows, presupuestos: presupuestos.rows };
  }

  if (nombre === 'generar_reporte_embudo') {
    const porEstado = await pool.query('SELECT estado_comercial, COUNT(*) AS n FROM comercial_contactos GROUP BY estado_comercial');
    const alertas = await pool.query(`SELECT ${ALERTA_CASE} AS alerta, COUNT(*) AS n FROM comercial_contactos c GROUP BY alerta`);
    const fecha = new Date().toISOString().slice(0, 10);
    const titulo = args.titulo || `Reporte de embudo comercial - ${fecha}`;
    const lineas = [
      titulo,
      '='.repeat(titulo.length),
      '',
      'Contactos por estado:',
      ...porEstado.rows.map((r) => `  - ${r.estado_comercial}: ${r.n}`),
      '',
      'Contactos por alerta de seguimiento:',
      ...alertas.rows.map((r) => `  - ${r.alerta}: ${r.n}`),
      '',
      `Generado el ${new Date().toLocaleString('es-AR')}`,
    ];
    const filename = `${crypto.randomUUID()}.txt`;
    fs.writeFileSync(path.join(AGENTE_DIR, filename), lineas.join('\n'), 'utf8');
    const responsableNombre = await responsableActual(req);
    const informe = await pool.query(
      `INSERT INTO comercial_agente_informes (nombre, filename, tipo, creado_por_usuario_id, creado_por_nombre)
       VALUES ($1,$2,'texto',$3,$4) RETURNING id`,
      [titulo, filename, req.user.sub, responsableNombre],
    );
    return { informe_id: informe.rows[0].id, nombre: titulo };
  }

  return { error: 'Herramienta desconocida.' };
}

function agenteSystemPrompt() {
  return `Sos el agente de tareas del modulo Comercial de BILON Smart Buildings. Ayudas a buscar informacion de contactos y a generar reportes usando SOLO las herramientas disponibles.
No inventes datos - si necesitas informacion, llama a la herramienta correspondiente. Si el usuario pide algo que ninguna herramienta puede hacer, decilo con honestidad.
Cuando generes un reporte con generar_reporte_embudo, avisale al usuario que ya quedo disponible para descargar en "Informes generados".
Respondes siempre en español, tono directo y breve. Nunca uses markdown (nada de **negrita**, #titulos, ni backticks) - el chat solo muestra texto plano.`;
}

router.post('/agente/tarea', async (req, res) => {
  if (!process.env.OPENROUTER_API_KEY) {
    return res.status(500).json({ error: 'Falta configurar OPENROUTER_API_KEY en el servidor.' });
  }
  const { mensaje, historial } = req.body ?? {};
  if (!mensaje || typeof mensaje !== 'string') {
    return res.status(400).json({ error: 'mensaje es requerido.' });
  }
  const historialSeguro = Array.isArray(historial)
    ? historial.slice(-6).filter((h) => h && (h.role === 'user' || h.role === 'assistant') && typeof h.content === 'string')
    : [];

  const messages = [
    { role: 'system', content: agenteSystemPrompt() },
    ...historialSeguro.map((h) => ({ role: h.role, content: h.content })),
    { role: 'user', content: mensaje.slice(0, 2000) },
  ];

  try {
    const primera = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'anthropic/claude-sonnet-5', messages, tools: AGENTE_TOOLS, temperature: 0.2,
      }),
    });
    const dataPrimera = await primera.json();
    if (!primera.ok) {
      console.error('Error de OpenRouter (agente):', dataPrimera);
      return res.status(502).json({ error: 'El agente no esta disponible en este momento.' });
    }
    const choice = dataPrimera.choices?.[0]?.message;
    const toolCalls = choice?.tool_calls ?? [];

    if (toolCalls.length === 0) {
      return res.json({ respuesta: choice?.content ?? '', informe_id: null });
    }

    let informeId = null;
    const toolMessages = [];
    for (const call of toolCalls.slice(0, 3)) {
      let args = {};
      try { args = JSON.parse(call.function.arguments || '{}'); } catch { /* args invalidos, usa {} */ }
      // eslint-disable-next-line no-await-in-loop
      const resultado = await ejecutarHerramienta(call.function.name, args, req);
      if (resultado.informe_id) informeId = resultado.informe_id;
      toolMessages.push({
        role: 'tool', tool_call_id: call.id, content: JSON.stringify(resultado).slice(0, 8000),
      });
    }

    const segunda = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'anthropic/claude-sonnet-5',
        messages: [...messages, choice, ...toolMessages],
        temperature: 0.2,
      }),
    });
    const dataSegunda = await segunda.json();
    if (!segunda.ok) {
      console.error('Error de OpenRouter (agente, 2da vuelta):', dataSegunda);
      return res.status(502).json({ error: 'El agente no pudo terminar la tarea.' });
    }
    res.json({ respuesta: dataSegunda.choices?.[0]?.message?.content ?? '', informe_id: informeId });
  } catch (err) {
    console.error('Error en agente de tareas:', err);
    res.status(502).json({ error: 'No se pudo comunicar con el agente.' });
  }
});

router.get('/agente/informes', async (_req, res) => {
  const result = await pool.query('SELECT * FROM comercial_agente_informes ORDER BY creado_en DESC LIMIT 100');
  res.json(result.rows);
});

router.get('/agente/informes/:id/descargar', async (req, res) => {
  const result = await pool.query('SELECT * FROM comercial_agente_informes WHERE id = $1', [req.params.id]);
  if (result.rowCount === 0) return res.status(404).json({ error: 'Informe no encontrado.' });
  const filePath = path.join(AGENTE_DIR, result.rows[0].filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Archivo no encontrado en disco.' });
  res.download(filePath, `${result.rows[0].nombre}.txt`);
});

// ---------------------------------------------------------------------------
// Mail: campanias de envio + lectura/resumen de bandeja de entrada.
// ---------------------------------------------------------------------------

router.get('/mail/estado', (_req, res) => {
  res.json({ configurado: mailConfigurado() });
});

// ---------------------------------------------------------------------------
// Campañas guardadas: se crean una vez (con el asistente) y se pueden
// enviar varias veces, en distintos momentos, a distintos subconjuntos de
// contactos (elegidos aparte, en /contactos con filtros + seleccion).
// ---------------------------------------------------------------------------

router.get('/campanias', async (_req, res) => {
  const result = await pool.query(
    `SELECT id, asunto, LEFT(regexp_replace(cuerpo_html, '<[^>]+>', ' ', 'g'), 160) AS resumen,
            creado_por_nombre, creado_en, actualizado_en, veces_enviada, ultimo_envio_en
       FROM comercial_campanias ORDER BY actualizado_en DESC`,
  );
  res.json(result.rows);
});

router.get('/campanias/:id', async (req, res) => {
  const result = await pool.query('SELECT * FROM comercial_campanias WHERE id = $1', [req.params.id]);
  if (result.rowCount === 0) return res.status(404).json({ error: 'Campaña no encontrada.' });
  res.json(result.rows[0]);
});

router.post('/campanias', async (req, res) => {
  const { asunto, cuerpo_html: cuerpoHtml } = req.body ?? {};
  if (!asunto?.trim() || !cuerpoHtml?.trim()) return res.status(400).json({ error: 'asunto y cuerpo_html son requeridos.' });
  const responsableNombre = await responsableActual(req);
  const result = await pool.query(
    `INSERT INTO comercial_campanias (asunto, cuerpo_html, creado_por_usuario_id, creado_por_nombre)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [asunto.trim(), cuerpoHtml, req.user.sub, responsableNombre],
  );
  res.status(201).json(result.rows[0]);
});

router.put('/campanias/:id', async (req, res) => {
  const { asunto, cuerpo_html: cuerpoHtml } = req.body ?? {};
  if (!asunto?.trim() || !cuerpoHtml?.trim()) return res.status(400).json({ error: 'asunto y cuerpo_html son requeridos.' });
  const result = await pool.query(
    `UPDATE comercial_campanias SET asunto = $1, cuerpo_html = $2, actualizado_en = NOW() WHERE id = $3 RETURNING *`,
    [asunto.trim(), cuerpoHtml, req.params.id],
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Campaña no encontrada.' });
  res.json(result.rows[0]);
});

router.delete('/campanias/:id', async (req, res) => {
  const result = await pool.query('DELETE FROM comercial_campanias WHERE id = $1', [req.params.id]);
  if (result.rowCount === 0) return res.status(404).json({ error: 'Campaña no encontrada.' });
  res.json({ eliminada: true });
});

router.post('/campanias/:id/enviar', async (req, res) => {
  if (!mailConfigurado()) return res.status(500).json({ error: 'Mail no configurado en el servidor.' });
  const { contacto_ids: contactoIds } = req.body ?? {};
  if (!Array.isArray(contactoIds) || contactoIds.length === 0) {
    return res.status(400).json({ error: 'contacto_ids debe ser una lista no vacia.' });
  }

  const campania = await pool.query('SELECT * FROM comercial_campanias WHERE id = $1', [req.params.id]);
  if (campania.rowCount === 0) return res.status(404).json({ error: 'Campaña no encontrada.' });
  const { asunto, cuerpo_html: cuerpoHtml } = campania.rows[0];

  const responsableNombre = await responsableActual(req);

  // Las imagenes propias (subidas al editor de campanias, servidas desde
  // /api/comercial/archivos/:filename) se mandan como adjunto inline (CID) en
  // vez de <img src="https://..."> remoto: la mayoria de los clientes de mail
  // (Gmail incluido) bloquean imagenes externas por defecto en la primera
  // vista ("mostrar imagenes"), pero un adjunto inline viaja con el mail y se
  // ve siempre. Se calcula una sola vez, es igual para todos los contactos.
  const attachmentsBase = [];
  let cuerpoConImagenesInline = cuerpoHtml;
  const imgRegex = /<img([^>]*)\ssrc=["']([^"']*\/api\/comercial\/archivos\/([a-zA-Z0-9._-]+))["']([^>]*)>/gi;
  let imgMatch;
  let cidIndex = 0;
  // eslint-disable-next-line no-cond-assign
  while ((imgMatch = imgRegex.exec(cuerpoHtml)) !== null) {
    const [full, before, , filename, after] = imgMatch;
    const filePath = path.join(UPLOADS_DIR, path.basename(filename));
    if (fs.existsSync(filePath)) {
      cidIndex += 1;
      const cid = `campania${req.params.id}img${cidIndex}@bilon`;
      attachmentsBase.push({ filename: path.basename(filename), path: filePath, cid });
      cuerpoConImagenesInline = cuerpoConImagenesInline.replace(full, `<img${before} src="cid:${cid}"${after}>`);
    }
  }

  const contactos = await pool.query(
    'SELECT id, apellido, nombre, email FROM comercial_contactos WHERE id = ANY($1) AND no_contactar = FALSE AND email IS NOT NULL',
    [contactoIds],
  );

  let enviados = 0;
  const fallidos = [];
  for (const [i, c] of contactos.rows.entries()) {
    const bajaUrl = `${FRONTEND_URL}/api/comercial/baja?c=${c.id}&t=${tokenBaja(c.id)}`;
    const footerHtml = `<p style="margin-top:24px;font-size:11px;color:#999;">Si no queres recibir mas mails nuestros, <a href="${bajaUrl}" style="color:#999;">hace click aca para darte de baja</a>.</p>`;
    // Reemplazo de marcadores por contacto - la IA que redacta la campania
    // escribe estos placeholders (ver campaniaSystemPrompt) esperando que se
    // completen por destinatario; sin esto llegaban literales ("Hola [Nombre],").
    const nombreCompleto = `${c.nombre || ''} ${c.apellido || ''}`.trim();
    const cuerpoPersonalizado = cuerpoConImagenesInline
      .replace(/\[Nombre Completo\]/gi, nombreCompleto || 'estimado/a')
      .replace(/\[Nombre\]/gi, c.nombre || 'estimado/a')
      .replace(/\[Apellido\]/gi, c.apellido || '');
    const cuerpoHtmlConFooter = cuerpoPersonalizado + footerHtml;
    const cuerpoTexto = `${cuerpoHtmlConFooter.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}\n\nDarte de baja: ${bajaUrl}`;

    // Throttle: dejamos ~1.2s entre mails para no mandar todo en un solo
    // pico (Gmail SMTP personal, no un servicio pensado para bulk).
    // eslint-disable-next-line no-await-in-loop
    if (i > 0) await new Promise((r) => { setTimeout(r, 1200); });

    let intentos = 0;
    let enviado = false;
    let ultimoError = null;
    while (intentos < 2 && !enviado) {
      intentos += 1;
      try {
        // eslint-disable-next-line no-await-in-loop
        await enviarYRegistrarMail({
          to: c.email,
          subject: asunto,
          html: cuerpoHtmlConFooter,
          text: cuerpoTexto,
          contactoId: c.id,
          responsableNombre,
          attachments: attachmentsBase,
        });
        enviado = true;
      } catch (err) {
        ultimoError = err;
        if (intentos < 2) {
          // eslint-disable-next-line no-await-in-loop
          await new Promise((r) => { setTimeout(r, 2000); });
        }
      }
    }

    if (enviado) {
      // eslint-disable-next-line no-await-in-loop
      await pool.query(
        `INSERT INTO comercial_seguimientos (contacto_id, fecha, canal, tipo_actividad, resultado_resumen, responsable_usuario_id, responsable_nombre)
         VALUES ($1, CURRENT_DATE, 'Email', 'Campaña', $2, $3, $4)`,
        [c.id, asunto, req.user.sub, responsableNombre],
      );
      // eslint-disable-next-line no-await-in-loop
      await pool.query(`UPDATE comercial_contactos SET ultimo_contacto = CURRENT_DATE WHERE id = $1`, [c.id]);
      enviados += 1;
    } else {
      console.error(`Error enviando campania a contacto ${c.id}:`, ultimoError);
      fallidos.push({ contacto_id: c.id, nombre: `${c.apellido}, ${c.nombre}` });
    }
  }

  await pool.query(
    `UPDATE comercial_campanias SET veces_enviada = veces_enviada + 1, ultimo_envio_en = NOW() WHERE id = $1`,
    [req.params.id],
  );

  const omitidosSinEmail = contactoIds.length - contactos.rowCount;
  res.json({ enviados, fallidos, omitidos_sin_email_o_no_contactar: omitidosSinEmail });
});

// ---------------------------------------------------------------------------
// Asistente de campañas: chatea con el usuario para armar asunto + cuerpo,
// y genera imagenes con IA para insertar en el editor enriquecido.
// ---------------------------------------------------------------------------

function campaniaSystemPrompt(textoMarca) {
  return `Sos un asistente de marketing que ayuda a armar campañas de mail para BILON Smart Buildings, una empresa que instala cargadores de vehiculos electricos en cocheras de consorcios/edificios (le vende a administraciones de consorcio, socios/propietarios, y contactos comerciales en general).

Charlas con el usuario para entender la campaña que quiere mandar, haciendo preguntas breves UNA POR VEZ (no todas juntas) sobre lo que falte:
- publico objetivo (que tipo de contacto: administraciones, socios, leads en general, etc)
- objetivo de la campaña (dar a conocer el servicio, invitar a algo, reactivar un contacto frio, oferta puntual, etc)
- tono deseado (formal, cercano, urgente, informativo)
- si quiere que le generes una imagen con IA (y que imagen), si va a subir la suya, o si prefiere sin imagen

No hace falta preguntar las 4 cosas si el usuario ya fue claro de entrada. Cuando tengas informacion suficiente, generá vos mismo el asunto y el cuerpo del mail en HTML simple (parrafos <p>, se puede usar <strong>, <em>, <ul>/<li> - SIN imagenes insertadas, sin estilos inline raros: la imagen la agrega el usuario aparte en el editor).

Reglas:
- Preguntas una por vez, breves, en español, tono directo.
- Marcadores de personalizacion reales (SI se reemplazan por los datos de cada contacto al enviar, usalos con confianza donde quede natural en el saludo/texto): [Nombre], [Apellido], [Nombre Completo]. No inventes otros marcadores tipo [Empresa] o [Direccion] - esos NO se reemplazan y quedarian literales en el mail.
- Nunca inventes datos concretos de la empresa que no tengas (precios, telefonos, direcciones) - si hace falta un dato asi, dejalo como placeholder simple tipo "[completar]" y avisale al usuario en tu respuesta.
- Nunca uses markdown en el campo "respuesta" (texto plano nomas, nada de **negrita** ni backticks).
${textoMarca ? `\nInformacion real de la empresa (usala para datos concretos en vez de placeholders, y para que el tono/estilo del texto sea coherente):\n${textoMarca}\n` : ''}
Devolve EXCLUSIVAMENTE un objeto JSON valido (sin backticks, sin texto adicional) con estos campos:
- listo (boolean): true solo cuando ya generaste asunto y cuerpo_html
- respuesta (string): tu mensaje para el usuario (la pregunta, o un mensaje breve confirmando que armaste el borrador)
- asunto (string o null): asunto del mail, solo si listo=true
- cuerpo_html (string o null): cuerpo del mail en HTML, solo si listo=true`;
}

router.post('/campanias/chat', async (req, res) => {
  if (!process.env.OPENROUTER_API_KEY) return res.status(500).json({ error: 'Falta configurar OPENROUTER_API_KEY en el servidor.' });
  const { mensaje, historial } = req.body ?? {};
  if (!mensaje || typeof mensaje !== 'string') return res.status(400).json({ error: 'mensaje es requerido.' });

  const historialSeguro = Array.isArray(historial)
    ? historial.slice(-14).filter((h) => h && (h.role === 'user' || h.role === 'assistant') && typeof h.content === 'string')
    : [];

  const documentos = await pool.query(
    `SELECT texto_extraido FROM comercial_recursos_marca WHERE tipo = 'documento' AND texto_extraido IS NOT NULL ORDER BY creado_en DESC LIMIT 3`,
  );
  const textoMarca = documentos.rows.map((d) => d.texto_extraido).join('\n---\n').slice(0, 8000) || null;

  const messages = [
    { role: 'system', content: campaniaSystemPrompt(textoMarca) },
    ...historialSeguro.map((h) => ({ role: h.role, content: h.content })),
    { role: 'user', content: mensaje.slice(0, 2000) },
  ];

  try {
    const aiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: 'anthropic/claude-sonnet-5', messages, temperature: 0.4 }),
    });
    const data = await aiRes.json();
    if (!aiRes.ok) {
      console.error('Error de OpenRouter (campania chat):', data);
      return res.status(502).json({ error: 'El asistente no esta disponible en este momento.' });
    }
    let text = (data.choices?.[0]?.message?.content ?? '').trim();
    text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/, '');
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { listo: false, respuesta: text };
    }
    res.json({
      respuesta: parsed.respuesta ?? '',
      listo: Boolean(parsed.listo),
      asunto: parsed.listo ? (parsed.asunto ?? null) : null,
      cuerpo_html: parsed.listo ? (parsed.cuerpo_html ?? null) : null,
    });
  } catch (err) {
    console.error('Error llamando a OpenRouter (campania chat):', err);
    res.status(502).json({ error: 'No se pudo comunicar con el asistente.' });
  }
});

async function generarImagenCampaniaIA(prompt) {
  const referencias = await pool.query(
    `SELECT filename, mime_type, tipo FROM comercial_recursos_marca WHERE tipo IN ('logo', 'imagen_referencia') ORDER BY tipo, creado_en DESC LIMIT 3`,
  );

  const contenido = [{
    type: 'text',
    text: referencias.rowCount > 0
      ? `Genera una imagen para usar en un mail de marketing de venta/instalacion de cargadores de vehiculos electricos para cocheras de edificios/consorcios. Estilo profesional y limpio, apto para un email comercial. Te adjunto ${referencias.rows.some((r) => r.tipo === 'logo') ? 'el logo de la empresa' : ''}${referencias.rows.some((r) => r.tipo === 'logo') && referencias.rows.some((r) => r.tipo === 'imagen_referencia') ? ' e ' : ''}${referencias.rows.some((r) => r.tipo === 'imagen_referencia') ? 'imagenes de referencia de estilo' : ''} - copia esa estetica (colores, tipografia, composicion) en la imagen nueva; si te mande el logo, incluilo de forma prolija. Descripcion pedida: ${prompt}`
      : `Genera una imagen para usar en un mail de marketing de venta/instalacion de cargadores de vehiculos electricos para cocheras de edificios/consorcios. Estilo profesional y limpio, apto para un email comercial. Descripcion pedida: ${prompt}`,
  }];
  for (const ref of referencias.rows) {
    try {
      const buffer = fs.readFileSync(path.join(UPLOADS_DIR, ref.filename));
      contenido.push({ type: 'image_url', image_url: { url: `data:${ref.mime_type};base64,${buffer.toString('base64')}` } });
    } catch (err) {
      console.error(`No se pudo leer recurso de marca ${ref.filename}:`, err.message);
    }
  }

  const aiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash-image',
      messages: [{ role: 'user', content: contenido }],
      modalities: ['image', 'text'],
    }),
  });
  const data = await aiRes.json();
  if (!aiRes.ok) {
    console.error('Error de OpenRouter (imagen campania):', data);
    throw new Error('openrouter_error');
  }
  const imagenes = data.choices?.[0]?.message?.images;
  const dataUrl = imagenes?.[0]?.image_url?.url;
  const match = typeof dataUrl === 'string' ? dataUrl.match(/^data:(image\/\w+);base64,(.+)$/) : null;
  if (!match) {
    console.error('OpenRouter no devolvio una imagen valida:', JSON.stringify(data).slice(0, 500));
    throw new Error('no_image_returned');
  }
  const [, mime, base64] = match;
  const ext = mime === 'image/jpeg' ? 'jpg' : mime.split('/')[1];
  const filename = `${crypto.randomUUID()}.${ext}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, filename), Buffer.from(base64, 'base64'));
  return filename;
}

router.post('/campanias/imagen-ia', async (req, res) => {
  if (!process.env.OPENROUTER_API_KEY) return res.status(500).json({ error: 'Falta configurar OPENROUTER_API_KEY en el servidor.' });
  const { prompt } = req.body ?? {};
  if (!prompt?.trim()) return res.status(400).json({ error: 'prompt es requerido.' });
  try {
    const filename = await generarImagenCampaniaIA(prompt.trim());
    res.json({ filename });
  } catch (err) {
    console.error('Error generando imagen con IA:', err.message);
    res.status(502).json({ error: 'No se pudo generar la imagen. Proba con otra descripcion, o subi tu propia imagen.' });
  }
});

router.post('/campanias/imagen-subir', upload.single('archivo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Falta el archivo.' });
  if (!IMAGE_MIME_TYPES.includes(req.file.mimetype)) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'El archivo debe ser una imagen (jpg, png, webp o gif).' });
  }
  res.json({ filename: req.file.filename });
});

// ---------------------------------------------------------------------------
// Marca de la empresa: logo, imagenes de referencia de estilo y documentos
// (PDF con info/tono de la empresa) que el asistente de campañas usa como
// contexto - para el texto (via texto_extraido) y para la generacion de
// imagenes (logo/referencia se mandan como input al modelo).
// ---------------------------------------------------------------------------

const TIPOS_RECURSO_MARCA = ['logo', 'imagen_referencia', 'documento'];

router.get('/marca', async (_req, res) => {
  const result = await pool.query(
    'SELECT id, tipo, nombre, filename, mime_type, creado_en FROM comercial_recursos_marca ORDER BY tipo, creado_en DESC',
  );
  res.json(result.rows);
});

router.post('/marca', upload.single('archivo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Falta el archivo.' });
  const { tipo, nombre } = req.body ?? {};
  if (!TIPOS_RECURSO_MARCA.includes(tipo)) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: `tipo debe ser uno de: ${TIPOS_RECURSO_MARCA.join(', ')}.` });
  }
  const esImagen = IMAGE_MIME_TYPES.includes(req.file.mimetype);
  const esPdf = req.file.mimetype === 'application/pdf';
  if ((tipo === 'logo' || tipo === 'imagen_referencia') && !esImagen) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'Logo e imagenes de referencia deben ser una imagen (jpg, png, webp o gif).' });
  }
  if (tipo === 'documento' && !esImagen && !esPdf) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'El documento debe ser un PDF o una imagen.' });
  }

  let textoExtraido = null;
  if (esPdf) {
    try {
      textoExtraido = (await pdfParse(fs.readFileSync(req.file.path))).text?.slice(0, 15000) || null;
    } catch (err) {
      console.error('Error extrayendo texto de PDF de marca:', err.message);
    }
  }

  const result = await pool.query(
    `INSERT INTO comercial_recursos_marca (tipo, nombre, filename, mime_type, texto_extraido)
     VALUES ($1, $2, $3, $4, $5) RETURNING id, tipo, nombre, filename, mime_type, creado_en`,
    [tipo, nombre?.trim() || req.file.originalname, req.file.filename, req.file.mimetype, textoExtraido],
  );
  res.status(201).json(result.rows[0]);
});

router.delete('/marca/:id', async (req, res) => {
  const existente = await pool.query('SELECT filename FROM comercial_recursos_marca WHERE id = $1', [req.params.id]);
  if (existente.rowCount === 0) return res.status(404).json({ error: 'Recurso no encontrado.' });
  await pool.query('DELETE FROM comercial_recursos_marca WHERE id = $1', [req.params.id]);
  fs.unlink(path.join(UPLOADS_DIR, existente.rows[0].filename), () => {});
  res.json({ eliminado: true });
});

router.post('/bandeja/revisar', async (_req, res) => {
  if (!mailConfigurado()) return res.status(500).json({ error: 'Mail no configurado en el servidor.' });
  try {
    const resultado = await revisarBandeja();
    res.json(resultado);
  } catch (err) {
    console.error('Error revisando bandeja:', err);
    res.status(502).json({ error: 'No se pudo conectar a la bandeja de entrada.' });
  }
});

// ---------------------------------------------------------------------------
// Bandeja tipo Gmail (comercial_mails): listado, detalle, responder.
// ---------------------------------------------------------------------------

router.get('/mails/no-leidos', async (_req, res) => {
  const result = await pool.query(`SELECT COUNT(*) AS n FROM comercial_mails WHERE direccion = 'entrante' AND leido = FALSE`);
  res.json({ no_leidos: Number(result.rows[0].n) });
});

router.get('/mails', async (req, res) => {
  const { leido, contacto_id: contactoId, direccion } = req.query;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = 30;
  const offset = (page - 1) * limit;

  const where = [];
  const params = [];
  if (leido === 'false') { where.push(`m.direccion = 'entrante' AND m.leido = FALSE`); }
  if (direccion === 'entrante' || direccion === 'saliente') { params.push(direccion); where.push(`m.direccion = $${params.length}`); }
  if (contactoId) { params.push(contactoId); where.push(`m.contacto_id = $${params.length}`); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const total = await pool.query(`SELECT COUNT(*) AS n FROM comercial_mails m ${whereSql}`, params);
  params.push(limit, offset);
  const rows = await pool.query(
    `SELECT m.id, m.direccion, m.contacto_id, m.de_email, m.de_nombre, m.para_email, m.asunto,
            LEFT(COALESCE(m.resumen_ia, m.cuerpo_texto, ''), 160) AS snippet, m.resumen_ia, m.leido, m.fecha,
            c.apellido AS contacto_apellido, c.nombre AS contacto_nombre
       FROM comercial_mails m
       LEFT JOIN comercial_contactos c ON c.id = m.contacto_id
       ${whereSql}
       ORDER BY m.fecha DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  res.json({ mails: rows.rows, total: Number(total.rows[0].n), page, limit });
});

router.get('/mails/:id', async (req, res) => {
  const result = await pool.query(
    `SELECT m.*, c.apellido AS contacto_apellido, c.nombre AS contacto_nombre
       FROM comercial_mails m
       LEFT JOIN comercial_contactos c ON c.id = m.contacto_id
      WHERE m.id = $1`,
    [req.params.id],
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Mail no encontrado.' });
  if (result.rows[0].direccion === 'entrante' && !result.rows[0].leido) {
    await pool.query('UPDATE comercial_mails SET leido = TRUE WHERE id = $1', [req.params.id]);
    result.rows[0].leido = true;
  }
  res.json(result.rows[0]);
});

router.post('/mails/:id/responder', async (req, res) => {
  if (!mailConfigurado()) return res.status(500).json({ error: 'Mail no configurado en el servidor.' });
  const { cuerpo } = req.body ?? {};
  if (!cuerpo?.trim()) return res.status(400).json({ error: 'cuerpo es requerido.' });

  const original = await pool.query('SELECT * FROM comercial_mails WHERE id = $1', [req.params.id]);
  if (original.rowCount === 0) return res.status(404).json({ error: 'Mail no encontrado.' });
  const orig = original.rows[0];
  const destinatario = orig.direccion === 'entrante' ? orig.de_email : orig.para_email;
  if (!destinatario) return res.status(400).json({ error: 'El mail original no tiene remitente/destinatario valido.' });

  const asuntoRespuesta = orig.asunto?.toLowerCase().startsWith('re:') ? orig.asunto : `Re: ${orig.asunto ?? ''}`;
  const responsableNombre = await responsableActual(req);

  try {
    await enviarYRegistrarMail({
      to: destinatario,
      subject: asuntoRespuesta,
      html: cuerpo.replace(/\n/g, '<br>'),
      text: cuerpo,
      contactoId: orig.contacto_id,
      responsableNombre,
      inReplyTo: orig.message_id,
    });
    if (orig.contacto_id) {
      await pool.query(
        `INSERT INTO comercial_seguimientos (contacto_id, fecha, canal, tipo_actividad, resultado_resumen, responsable_usuario_id, responsable_nombre)
         VALUES ($1, CURRENT_DATE, 'Email', 'Respuesta', $2, $3, $4)`,
        [orig.contacto_id, asuntoRespuesta, req.user.sub, responsableNombre],
      );
      await pool.query(`UPDATE comercial_contactos SET ultimo_contacto = CURRENT_DATE WHERE id = $1`, [orig.contacto_id]);
    }
    res.json({ enviado: true });
  } catch (err) {
    console.error('Error respondiendo mail:', err);
    res.status(502).json({ error: 'No se pudo enviar la respuesta.' });
  }
});

router.post('/mails/:id/reenviar', async (req, res) => {
  if (!mailConfigurado()) return res.status(500).json({ error: 'Mail no configurado en el servidor.' });
  const { to, mensaje } = req.body ?? {};
  if (!to?.trim()) return res.status(400).json({ error: 'to es requerido.' });

  const original = await pool.query('SELECT * FROM comercial_mails WHERE id = $1', [req.params.id]);
  if (original.rowCount === 0) return res.status(404).json({ error: 'Mail no encontrado.' });
  const orig = original.rows[0];

  const asuntoReenvio = orig.asunto?.toLowerCase().startsWith('fwd:') ? orig.asunto : `Fwd: ${orig.asunto ?? ''}`;
  const encabezado = `De: ${orig.de_nombre || orig.de_email}\nAsunto original: ${orig.asunto ?? ''}\n\n`;
  const cuerpoTexto = `${mensaje?.trim() ? `${mensaje.trim()}\n\n` : ''}---------- Mensaje reenviado ----------\n${encabezado}${orig.cuerpo_texto ?? ''}`;
  const cuerpoHtml = cuerpoTexto.replace(/\n/g, '<br>');

  const destino = await pool.query('SELECT id FROM comercial_contactos WHERE LOWER(email) = LOWER($1) LIMIT 1', [to.trim()]);
  const contactoId = destino.rowCount > 0 ? destino.rows[0].id : null;
  const responsableNombre = await responsableActual(req);

  try {
    await enviarYRegistrarMail({
      to: to.trim(),
      subject: asuntoReenvio,
      html: cuerpoHtml,
      text: cuerpoTexto,
      contactoId,
      responsableNombre,
    });
    res.json({ enviado: true });
  } catch (err) {
    console.error('Error reenviando mail:', err);
    res.status(502).json({ error: 'No se pudo reenviar el mail.' });
  }
});

router.delete('/mails/:id', async (req, res) => {
  const result = await pool.query('DELETE FROM comercial_mails WHERE id = $1', [req.params.id]);
  if (result.rowCount === 0) return res.status(404).json({ error: 'Mail no encontrado.' });
  res.json({ eliminado: true });
});

module.exports = router;
