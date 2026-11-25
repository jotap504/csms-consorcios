// Organizacion interna de Bilon (no es para consorcios/clientes): tareas y
// pendientes separados por "negocio" (Wallbox, Drones, Detector de
// incendio, etc), con adjuntos, log de auditoria, chat interno y comparador
// de presupuestos de proveedores con IA. Ver schema_gestion.sql.

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const { pdfPaginasAImagenes } = require('../lib/pdfImagenes');
const { pool } = require('../db');
const { authenticate, requirePermission } = require('../auth/middleware');
const { telegramConfigurado, enviarMensajeTelegram, descargarArchivoTelegram } = require('../services/telegram');

const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads', 'gestion');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS_DIR,
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).slice(0, 10);
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024, files: 5 },
});

function tipoPorMime(mimetype) {
  if (!mimetype) return 'otro';
  if (mimetype.startsWith('audio/')) return 'audio';
  if (mimetype.startsWith('video/')) return 'video';
  if (mimetype.startsWith('image/')) return 'imagen';
  if (mimetype === 'application/pdf') return 'pdf';
  if (mimetype.startsWith('text/') || mimetype.includes('document') || mimetype.includes('sheet')) return 'documento';
  return 'otro';
}

const router = express.Router();

// Sin autenticacion con Bearer header a proposito: los <img>/<audio> del
// navegador no lo mandan (mismo caso que /comercial/archivos). Nombre de
// archivo es un UUID no listable.
router.get('/archivos/:filename', (req, res) => {
  const filePath = path.join(UPLOADS_DIR, path.basename(req.params.filename));
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Archivo no encontrado.' });
  res.sendFile(filePath);
});

async function usuarioPorId(id) {
  const result = await pool.query('SELECT nombre, email FROM usuarios WHERE id = $1', [id]);
  return { id, nombre: result.rows[0]?.nombre || result.rows[0]?.email || null };
}

async function negocioPorDefecto(negocios) {
  const existente = negocios.find((n) => n.nombre.toLowerCase() === 'general');
  if (existente) return existente;
  const { rows } = await pool.query(
    `INSERT INTO gestion_negocios (nombre, orden) VALUES ('General', COALESCE((SELECT MAX(orden) + 1 FROM gestion_negocios), 0))
       ON CONFLICT (nombre) DO UPDATE SET nombre = EXCLUDED.nombre RETURNING id, nombre`,
  );
  return rows[0];
}

// Descarga el archivo adjunto del mensaje de Telegram (documento, foto o
// nota de voz) y lo guarda como gestion_adjuntos del negocio ya resuelto.
async function descargarYGuardarAdjuntoTelegram(message, negocioId, usuario) {
  let fileId; let nombreOriginal; let mimeType;
  if (message.document) {
    ({ file_id: fileId, file_name: nombreOriginal = 'documento', mime_type: mimeType } = message.document);
  } else if (Array.isArray(message.photo) && message.photo.length > 0) {
    fileId = message.photo[message.photo.length - 1].file_id;
    nombreOriginal = 'foto.jpg';
    mimeType = 'image/jpeg';
  } else if (message.voice || message.audio) {
    const audio = message.voice || message.audio;
    fileId = audio.file_id;
    nombreOriginal = message.voice ? 'nota_de_voz.ogg' : (message.audio.file_name || 'audio.mp3');
    mimeType = message.voice ? 'audio/ogg' : (message.audio.mime_type || 'audio/mpeg');
  } else {
    return null;
  }

  const { buffer, nombre } = await descargarArchivoTelegram(fileId, nombreOriginal);
  const ext = path.extname(nombre) || (mimeType === 'image/jpeg' ? '.jpg' : '');
  const filename = `${crypto.randomUUID()}${ext}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, filename), buffer);
  const { rows } = await pool.query(
    `INSERT INTO gestion_adjuntos
       (negocio_id, tipo, archivo_path, nombre_original, mime_type, tamano_bytes, subido_por_usuario_id, subido_por_nombre)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [negocioId, tipoPorMime(mimeType), filename, nombreOriginal, mimeType, buffer.length, usuario.id, usuario.nombre],
  );
  return rows[0].id;
}

// Cuando el mensaje no dice explicitamente "negocio: ...", le pedimos a la
// IA que decida si es una tarea con fecha (ej. "reunion con cliente 12/12
// 10hs") o una nota suelta, y a que negocio corresponde.
async function clasificarMensajeConIA(mensaje, negocios) {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
  const aiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'anthropic/claude-sonnet-5',
      temperature: 0,
      messages: [{
        role: 'user',
        content: `Hoy es ${hoy} (zona horaria America/Argentina/Buenos_Aires). Llego un mensaje de Telegram sin indicar a que negocio corresponde. Los negocios disponibles son: ${negocios.map((n) => n.nombre).join(', ')}.
Mensaje: "${mensaje}"
Decidi si es una TAREA con fecha/hora concreta (reunion, llamado, vencimiento) o una NOTA sin fecha. Si es tarea, calcula vence_en en ISO 8601 con offset -03:00. Devolve EXCLUSIVAMENTE un JSON valido (sin markdown ni backticks) con la forma:
{"tipo": "tarea" o "nota", "negocio": "<uno de los negocios de la lista o null>", "titulo": "<resumen corto>", "vence_en": "<ISO 8601 o null>", "aviso_previo_minutos": <numero, default 60>}`,
      }],
    }),
  });
  const data = await aiRes.json();
  if (!aiRes.ok) throw new Error('OpenRouter no respondio ok.');
  let texto = (data.choices?.[0]?.message?.content ?? '').trim();
  texto = texto.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/, '');
  return JSON.parse(texto);
}

async function interpretarYGuardarMensajeTelegram({
  chatId, usuario, message, text, negocioActivoId,
}) {
  const { rows: negocios } = await pool.query('SELECT id, nombre FROM gestion_negocios WHERE activo = TRUE ORDER BY orden');

  // Pedido explicito de tarea ("agregar tarea en Wallbox: reclamar muestra" /
  // "tarea en Wallbox: ...") - el usuario ya dijo que es una tarea, no hace
  // falta que la IA lo adivine ni que tenga fecha concreta.
  const matchTareaExplicita = text.match(/^(?:agregar\s+)?tarea\s+en\s+([^:]{2,40}):\s*([\s\S]*)$/i);
  const match = text.match(/^([^:]{2,40}):\s*([\s\S]*)$/);
  let negocioExplicito = null;
  let contenido = text;
  let tareaForzada = false;
  if (matchTareaExplicita) {
    negocioExplicito = negocios.find((n) => n.nombre.toLowerCase() === matchTareaExplicita[1].trim().toLowerCase());
    contenido = matchTareaExplicita[2].trim();
    tareaForzada = true;
  } else if (match) {
    const candidato = negocios.find((n) => n.nombre.toLowerCase() === match[1].trim().toLowerCase());
    if (candidato) { negocioExplicito = candidato; contenido = match[2].trim(); }
  }

  let clasificacion = null;
  if (!negocioExplicito && process.env.OPENROUTER_API_KEY && contenido) {
    clasificacion = await clasificarMensajeConIA(contenido, negocios).catch((err) => {
      console.error('[telegram] Error clasificando con IA:', err.message);
      return null;
    });
  } else if (tareaForzada && process.env.OPENROUTER_API_KEY && contenido) {
    // Negocio ya resuelto por nombre - igual le preguntamos a la IA solo
    // para que intente sacar una fecha/hora si el texto trae una.
    clasificacion = await clasificarMensajeConIA(contenido, negocios).catch(() => null);
  }

  const destino = negocioExplicito
    || (negocioActivoId && negocios.find((n) => n.id === negocioActivoId))
    || negocios.find((n) => n.nombre.toLowerCase() === (clasificacion?.negocio || '').toLowerCase())
    || await negocioPorDefecto(negocios);

  let adjuntoId = null;
  try {
    adjuntoId = await descargarYGuardarAdjuntoTelegram(message, destino.id, usuario);
  } catch (err) {
    console.error('[telegram] Error descargando adjunto de Telegram:', err.message);
  }

  if (tareaForzada || (clasificacion?.tipo === 'tarea' && clasificacion.vence_en)) {
    const avisoMin = clasificacion?.aviso_previo_minutos || 60;
    const venceEn = clasificacion?.vence_en || null;
    const titulo = clasificacion?.titulo || contenido || '(sin titulo)';
    const { rows } = await pool.query(
      `INSERT INTO gestion_tareas
         (negocio_id, titulo, creado_por_usuario_id, creado_por_nombre, asignado_a_usuario_id, asignado_a_nombre, vence_en, aviso_previo_minutos)
         VALUES ($1, $2, $3, $4, $3, $4, $5, $6) RETURNING *`,
      [destino.id, titulo, usuario.id, usuario.nombre, venceEn, avisoMin],
    );
    await registrarLog({
      negocioId: destino.id, entidadTipo: 'tarea', entidadId: rows[0].id, accion: 'creada', detalle: `via Telegram: ${rows[0].titulo}`, usuario,
    });
    if (venceEn) {
      const fecha = new Intl.DateTimeFormat('es-AR', {
        timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
      }).format(new Date(venceEn));
      await enviarMensajeTelegram(chatId, `Agendado en ${destino.nombre}: ${rows[0].titulo} - ${fecha}hs. Te aviso ${avisoMin} min antes.`);
    } else {
      await enviarMensajeTelegram(chatId, `Tarea creada en ${destino.nombre}: ${rows[0].titulo}`);
    }
    return;
  }

  await pool.query(
    `INSERT INTO gestion_chat_mensajes (negocio_id, usuario_id, usuario_nombre, mensaje, adjunto_id) VALUES ($1, $2, $3, $4, $5)`,
    [destino.id, usuario.id, usuario.nombre, contenido || (adjuntoId ? 'Adjunto' : '(vacio)'), adjuntoId],
  );
  await enviarMensajeTelegram(chatId, `Anotado en ${destino.nombre}.`);
}

async function procesarUpdateTelegram(update) {
  const message = update.message;
  if (!message || !message.chat) return;
  const chatId = message.chat.id;
  const text = (message.text || message.caption || '').trim();

  if (text.startsWith('/vincular')) {
    const codigo = text.split(/\s+/)[1];
    if (!codigo) {
      await enviarMensajeTelegram(chatId, 'Uso: /vincular <codigo> (lo generas desde el panel, en Organizacion > Vincular Telegram).');
      return;
    }
    const { rows } = await pool.query(
      'SELECT usuario_id FROM telegram_codigos WHERE codigo = $1 AND expira_en > NOW()',
      [codigo.toUpperCase()],
    );
    if (!rows[0]) {
      await enviarMensajeTelegram(chatId, 'Codigo invalido o vencido. Genera uno nuevo desde el panel.');
      return;
    }
    await pool.query('DELETE FROM telegram_vinculos WHERE usuario_id = $1 OR chat_id = $2', [rows[0].usuario_id, chatId]);
    await pool.query('INSERT INTO telegram_vinculos (usuario_id, chat_id) VALUES ($1, $2)', [rows[0].usuario_id, chatId]);
    await pool.query('DELETE FROM telegram_codigos WHERE codigo = $1', [codigo.toUpperCase()]);
    const usuario = await usuarioPorId(rows[0].usuario_id);
    await enviarMensajeTelegram(chatId, `Listo, vinculado como ${usuario.nombre}. Mandame /negocio para elegir a que negocio van tus mensajes (o escribi "Wallbox: che tengo un presupuesto nuevo" / "reunion con cliente 12/12 10hs" como antes).`);
    return;
  }

  const vinculo = await pool.query('SELECT usuario_id, negocio_activo_id FROM telegram_vinculos WHERE chat_id = $1', [chatId]);
  if (!vinculo.rows[0]) {
    await enviarMensajeTelegram(chatId, 'No te tengo vinculado. Entra al panel (Organizacion > Vincular Telegram) y mandame el codigo con /vincular <codigo>.');
    return;
  }
  const usuario = await usuarioPorId(vinculo.rows[0].usuario_id);

  // /negocio (sin argumento) manda un menu con botones para elegir; tocar
  // uno (o escribir el nombre tal cual, por las dudas) fija el "negocio
  // activo" del chat, que despues se usa como default en interpretarYGuardarMensajeTelegram.
  if (/^\/negocio(\s|$)/i.test(text)) {
    const { rows: negocios } = await pool.query('SELECT id, nombre FROM gestion_negocios WHERE activo = TRUE ORDER BY orden');
    const argumento = text.replace(/^\/negocio/i, '').trim();
    if (!argumento) {
      await enviarMensajeTelegram(chatId, 'Elegi el negocio para tus proximos mensajes:', {
        keyboard: negocios.map((n) => [{ text: n.nombre }]),
        resize_keyboard: true,
        one_time_keyboard: true,
      });
      return;
    }
    const elegido = negocios.find((n) => n.nombre.toLowerCase() === argumento.toLowerCase());
    if (!elegido) {
      await enviarMensajeTelegram(chatId, `No encontre "${argumento}". Negocios: ${negocios.map((n) => n.nombre).join(', ')}.`);
      return;
    }
    await pool.query('UPDATE telegram_vinculos SET negocio_activo_id = $1 WHERE chat_id = $2', [elegido.id, chatId]);
    await enviarMensajeTelegram(chatId, `Listo, tus mensajes van a ${elegido.nombre} hasta que cambies con /negocio.`, { remove_keyboard: true });
    return;
  }

  const { rows: negociosActivos } = await pool.query('SELECT id, nombre FROM gestion_negocios WHERE activo = TRUE ORDER BY orden');
  const negocioTocado = negociosActivos.find((n) => n.nombre.toLowerCase() === text.toLowerCase());
  if (negocioTocado) {
    await pool.query('UPDATE telegram_vinculos SET negocio_activo_id = $1 WHERE chat_id = $2', [negocioTocado.id, chatId]);
    await enviarMensajeTelegram(chatId, `Listo, tus mensajes van a ${negocioTocado.nombre} hasta que cambies con /negocio.`, { remove_keyboard: true });
    return;
  }

  await interpretarYGuardarMensajeTelegram({
    chatId, usuario, message, text, negocioActivoId: vinculo.rows[0].negocio_activo_id,
  });
}

// Publico (sin Bearer) a proposito - lo llama Telegram, no el navegador.
// Protegido por el secret token que Telegram manda en este header (seteado
// al registrar el webhook, ver deploy). Responde 200 de entrada y procesa
// despues: Telegram no necesita esperar, y asi un reintento por timeout no
// duplica el procesamiento visible para el usuario.
router.post('/telegram/webhook', (req, res) => {
  if (!telegramConfigurado() || req.header('x-telegram-bot-api-secret-token') !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return res.status(401).end();
  }
  res.json({ ok: true });
  procesarUpdateTelegram(req.body).catch((err) => console.error('[telegram] Error procesando update:', err));
});

router.use(authenticate, requirePermission('gestion_interna'));

async function usuarioActual(req) {
  return usuarioPorId(req.user.sub);
}

// Codigo de un solo uso para vincular el chat de Telegram del usuario
// logueado - cada usuario (cada "linea") vincula el suyo, y a partir de ahi
// el bot sabe quien le escribe.
router.get('/telegram/vincular', async (req, res) => {
  const usuario = await usuarioActual(req);
  const codigo = crypto.randomBytes(4).toString('hex').toUpperCase();
  await pool.query('DELETE FROM telegram_codigos WHERE usuario_id = $1', [usuario.id]);
  await pool.query(
    `INSERT INTO telegram_codigos (codigo, usuario_id, expira_en) VALUES ($1, $2, NOW() + INTERVAL '15 minutes')`,
    [codigo, usuario.id],
  );
  const vinculo = await pool.query('SELECT 1 FROM telegram_vinculos WHERE usuario_id = $1', [usuario.id]);
  res.json({
    codigo,
    expira_en_minutos: 15,
    bot_username: process.env.TELEGRAM_BOT_USERNAME || null,
    ya_vinculado: vinculo.rows.length > 0,
  });
});

async function registrarLog({
  negocioId, entidadTipo, entidadId, accion, detalle, usuario,
}) {
  await pool.query(
    `INSERT INTO gestion_log (negocio_id, entidad_tipo, entidad_id, accion, detalle, usuario_id, usuario_nombre)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [negocioId, entidadTipo, entidadId ?? null, accion, detalle ?? null, usuario.id, usuario.nombre],
  );
}

// --- Negocios ---

router.get('/negocios', async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT n.*,
            (SELECT COUNT(*) FROM gestion_tareas WHERE negocio_id = n.id AND estado != 'hecho') AS pendientes
       FROM gestion_negocios n WHERE n.activo = TRUE ORDER BY n.orden, n.nombre`,
  );
  res.json(rows);
});

router.post('/negocios', async (req, res) => {
  const nombre = (req.body?.nombre ?? '').trim();
  if (!nombre) return res.status(400).json({ error: 'nombre es requerido.' });
  const usuario = await usuarioActual(req);
  try {
    const { rows } = await pool.query(
      `INSERT INTO gestion_negocios (nombre, orden) VALUES ($1, COALESCE((SELECT MAX(orden) + 1 FROM gestion_negocios), 0)) RETURNING *`,
      [nombre],
    );
    await registrarLog({
      negocioId: rows[0].id, entidadTipo: 'negocio', entidadId: rows[0].id, accion: 'creado', detalle: nombre, usuario,
    });
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ya existe un negocio con ese nombre.' });
    throw err;
  }
});

router.patch('/negocios/:id', async (req, res) => {
  const { nombre, orden, activo } = req.body ?? {};
  const usuario = await usuarioActual(req);
  const { rows } = await pool.query(
    `UPDATE gestion_negocios SET
       nombre = COALESCE($2, nombre), orden = COALESCE($3, orden), activo = COALESCE($4, activo)
       WHERE id = $1 RETURNING *`,
    [req.params.id, nombre ?? null, orden ?? null, activo ?? null],
  );
  if (!rows[0]) return res.status(404).json({ error: 'Negocio no encontrado.' });
  await registrarLog({
    negocioId: rows[0].id, entidadTipo: 'negocio', entidadId: rows[0].id, accion: 'editado', detalle: JSON.stringify(req.body), usuario,
  });
  res.json(rows[0]);
});

// --- Tareas ---

router.get('/negocios/:id/tareas', async (req, res) => {
  const { estado } = req.query;
  const params = [req.params.id];
  let whereEstado = '';
  if (estado) { params.push(estado); whereEstado = `AND estado = $${params.length}`; }
  const { rows } = await pool.query(
    `SELECT * FROM gestion_tareas WHERE negocio_id = $1 ${whereEstado} ORDER BY
       CASE estado WHEN 'en_curso' THEN 0 WHEN 'pendiente' THEN 1 ELSE 2 END,
       vence_en IS NULL, vence_en, creado_en DESC`,
    params,
  );
  res.json(rows);
});

router.post('/negocios/:id/tareas', async (req, res) => {
  const {
    titulo, descripcion, asignado_a_usuario_id: asignadoId, asignado_a_nombre: asignadoNombre, vence_en: venceEn,
  } = req.body ?? {};
  if (!titulo?.trim()) return res.status(400).json({ error: 'titulo es requerido.' });
  const usuario = await usuarioActual(req);
  const { rows } = await pool.query(
    `INSERT INTO gestion_tareas
       (negocio_id, titulo, descripcion, asignado_a_usuario_id, asignado_a_nombre, vence_en, creado_por_usuario_id, creado_por_nombre)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [req.params.id, titulo.trim(), descripcion ?? null, asignadoId ?? null, asignadoNombre ?? null, venceEn ?? null, usuario.id, usuario.nombre],
  );
  await registrarLog({
    negocioId: req.params.id, entidadTipo: 'tarea', entidadId: rows[0].id, accion: 'creada', detalle: titulo.trim(), usuario,
  });
  res.status(201).json(rows[0]);
});

router.patch('/tareas/:id', async (req, res) => {
  const {
    titulo, descripcion, estado, asignado_a_usuario_id: asignadoId, asignado_a_nombre: asignadoNombre, vence_en: venceEn,
  } = req.body ?? {};
  if (estado && !['pendiente', 'en_curso', 'hecho'].includes(estado)) {
    return res.status(400).json({ error: 'estado invalido.' });
  }
  const usuario = await usuarioActual(req);
  const anterior = await pool.query('SELECT * FROM gestion_tareas WHERE id = $1', [req.params.id]);
  if (!anterior.rows[0]) return res.status(404).json({ error: 'Tarea no encontrada.' });

  const { rows } = await pool.query(
    `UPDATE gestion_tareas SET
       titulo = COALESCE($2, titulo), descripcion = COALESCE($3, descripcion), estado = COALESCE($4, estado),
       asignado_a_usuario_id = COALESCE($5, asignado_a_usuario_id), asignado_a_nombre = COALESCE($6, asignado_a_nombre),
       vence_en = COALESCE($7, vence_en), actualizado_en = NOW()
       WHERE id = $1 RETURNING *`,
    [req.params.id, titulo ?? null, descripcion ?? null, estado ?? null, asignadoId ?? null, asignadoNombre ?? null, venceEn ?? null],
  );
  const detalle = estado && estado !== anterior.rows[0].estado ? `estado: ${anterior.rows[0].estado} -> ${estado}` : 'edicion';
  await registrarLog({
    negocioId: rows[0].negocio_id, entidadTipo: 'tarea', entidadId: rows[0].id, accion: 'editada', detalle, usuario,
  });
  res.json(rows[0]);
});

router.delete('/tareas/:id', async (req, res) => {
  const usuario = await usuarioActual(req);
  const { rows } = await pool.query('DELETE FROM gestion_tareas WHERE id = $1 RETURNING *', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Tarea no encontrada.' });
  await registrarLog({
    negocioId: rows[0].negocio_id, entidadTipo: 'tarea', entidadId: rows[0].id, accion: 'eliminada', detalle: rows[0].titulo, usuario,
  });
  res.status(204).end();
});

// --- Adjuntos ---

router.get('/negocios/:id/adjuntos', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM gestion_adjuntos WHERE negocio_id = $1 ORDER BY subido_en DESC`,
    [req.params.id],
  );
  res.json(rows);
});

router.post('/negocios/:id/adjuntos', upload.array('archivos', 5), async (req, res) => {
  const files = req.files ?? [];
  if (files.length === 0) return res.status(400).json({ error: 'No se recibio ningun archivo.' });
  const usuario = await usuarioActual(req);
  const tareaId = req.body?.tarea_id || null;

  const creados = [];
  for (const file of files) {
    const tipo = tipoPorMime(file.mimetype);
    // eslint-disable-next-line no-await-in-loop
    const { rows } = await pool.query(
      `INSERT INTO gestion_adjuntos
         (negocio_id, tarea_id, tipo, archivo_path, nombre_original, mime_type, tamano_bytes, subido_por_usuario_id, subido_por_nombre)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [req.params.id, tareaId, tipo, file.filename, file.originalname, file.mimetype, file.size, usuario.id, usuario.nombre],
    );
    creados.push(rows[0]);
  }
  await registrarLog({
    negocioId: req.params.id, entidadTipo: 'adjunto', entidadId: creados[0]?.id, accion: 'subido', detalle: `${creados.length} archivo(s)`, usuario,
  });
  res.status(201).json(creados);
});

router.delete('/adjuntos/:id', async (req, res) => {
  const usuario = await usuarioActual(req);
  const { rows } = await pool.query('DELETE FROM gestion_adjuntos WHERE id = $1 RETURNING *', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Adjunto no encontrado.' });
  fs.unlink(path.join(UPLOADS_DIR, rows[0].archivo_path), () => {});
  await registrarLog({
    negocioId: rows[0].negocio_id, entidadTipo: 'adjunto', entidadId: rows[0].id, accion: 'eliminado', detalle: rows[0].nombre_original, usuario,
  });
  res.status(204).end();
});

// --- Proveedores de presupuesto (ficha persistente, separada de la
// comparacion puntual) ---

const PROVEEDOR_ADJUNTO_JOINS = `
  LEFT JOIN gestion_adjuntos pa ON pa.id = p.presupuesto_adjunto_id
  LEFT JOIN gestion_adjuntos da ON da.id = p.descripcion_adjunto_id
  LEFT JOIN gestion_adjuntos fa ON fa.id = p.foto_adjunto_id
  LEFT JOIN gestion_adjuntos va ON va.id = p.video_adjunto_id
`;
const PROVEEDOR_ADJUNTO_COLUMNAS = `
  pa.nombre_original AS presupuesto_adjunto_nombre, pa.archivo_path AS presupuesto_adjunto_path, pa.tipo AS presupuesto_adjunto_tipo, pa.mime_type AS presupuesto_adjunto_mime,
  da.nombre_original AS descripcion_adjunto_nombre, da.archivo_path AS descripcion_adjunto_path, da.tipo AS descripcion_adjunto_tipo, da.mime_type AS descripcion_adjunto_mime,
  fa.nombre_original AS foto_adjunto_nombre, fa.archivo_path AS foto_adjunto_path, fa.tipo AS foto_adjunto_tipo,
  va.nombre_original AS video_adjunto_nombre, va.archivo_path AS video_adjunto_path, va.tipo AS video_adjunto_tipo
`;

router.get('/negocios/:id/proveedores', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT p.*, ${PROVEEDOR_ADJUNTO_COLUMNAS}
       FROM gestion_proveedores_presupuesto p ${PROVEEDOR_ADJUNTO_JOINS}
       WHERE p.negocio_id = $1 ORDER BY p.id`,
    [req.params.id],
  );
  res.json(rows);
});

router.post('/negocios/:id/proveedores', async (req, res) => {
  const nombre = (req.body?.nombre ?? '').trim();
  if (!nombre) return res.status(400).json({ error: 'nombre es requerido.' });
  const contacto = (req.body?.contacto ?? '').trim() || null;
  const usuario = await usuarioActual(req);
  const { rows } = await pool.query(
    `INSERT INTO gestion_proveedores_presupuesto (negocio_id, nombre, contacto, creado_por_usuario_id, creado_por_nombre)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [req.params.id, nombre, contacto, usuario.id, usuario.nombre],
  );
  await registrarLog({
    negocioId: req.params.id, entidadTipo: 'proveedor', entidadId: rows[0].id, accion: 'creado', detalle: nombre, usuario,
  });
  res.status(201).json({ ...rows[0] });
});

const PROVEEDOR_CAMPOS_EDITABLES = [
  'nombre', 'contacto', 'resumen',
  'presupuesto_texto', 'presupuesto_adjunto_id',
  'descripcion_texto', 'descripcion_adjunto_id',
  'foto_adjunto_id', 'video_adjunto_id',
];

router.patch('/proveedores/:id', async (req, res) => {
  const campos = Object.keys(req.body ?? {}).filter((k) => PROVEEDOR_CAMPOS_EDITABLES.includes(k));
  if (campos.length === 0) return res.status(400).json({ error: 'No se envio ningun campo editable.' });
  const usuario = await usuarioActual(req);
  const sets = campos.map((campo, i) => `${campo} = $${i + 2}`).join(', ');
  const valores = campos.map((campo) => req.body[campo]);
  const { rows } = await pool.query(
    `UPDATE gestion_proveedores_presupuesto SET ${sets}, actualizado_en = NOW() WHERE id = $1 RETURNING *`,
    [req.params.id, ...valores],
  );
  if (!rows[0]) return res.status(404).json({ error: 'Proveedor no encontrado.' });
  await registrarLog({
    negocioId: rows[0].negocio_id, entidadTipo: 'proveedor', entidadId: rows[0].id, accion: 'actualizado', detalle: campos.join(', '), usuario,
  });
  const { rows: completo } = await pool.query(
    `SELECT p.*, ${PROVEEDOR_ADJUNTO_COLUMNAS}
       FROM gestion_proveedores_presupuesto p ${PROVEEDOR_ADJUNTO_JOINS}
       WHERE p.id = $1`,
    [req.params.id],
  );
  res.json(completo[0]);
});

router.delete('/proveedores/:id', async (req, res) => {
  const usuario = await usuarioActual(req);
  const { rows } = await pool.query('DELETE FROM gestion_proveedores_presupuesto WHERE id = $1 RETURNING *', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Proveedor no encontrado.' });
  await registrarLog({
    negocioId: rows[0].negocio_id, entidadTipo: 'proveedor', entidadId: rows[0].id, accion: 'eliminado', detalle: rows[0].nombre, usuario,
  });
  res.status(204).end();
});

// --- Log de auditoria ---

router.get('/negocios/:id/log', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 300);
  const { rows } = await pool.query(
    `SELECT * FROM gestion_log WHERE negocio_id = $1 ORDER BY creado_en DESC LIMIT $2`,
    [req.params.id, limit],
  );
  res.json(rows);
});

// --- Chat interno ---

router.get('/negocios/:id/chat', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 300);
  const { rows } = await pool.query(
    `SELECT m.*, a.nombre_original AS adjunto_nombre, a.tipo AS adjunto_tipo, a.archivo_path AS adjunto_path
       FROM gestion_chat_mensajes m LEFT JOIN gestion_adjuntos a ON a.id = m.adjunto_id
       WHERE m.negocio_id = $1 ORDER BY m.creado_en DESC LIMIT $2`,
    [req.params.id, limit],
  );
  res.json(rows.reverse());
});

router.post('/negocios/:id/chat', async (req, res) => {
  const { mensaje, adjunto_id: adjuntoId } = req.body ?? {};
  if (!mensaje?.trim() && !adjuntoId) return res.status(400).json({ error: 'mensaje o adjunto_id es requerido.' });
  const usuario = await usuarioActual(req);
  const { rows } = await pool.query(
    `INSERT INTO gestion_chat_mensajes (negocio_id, usuario_id, usuario_nombre, mensaje, adjunto_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [req.params.id, usuario.id, usuario.nombre, (mensaje ?? '').trim(), adjuntoId ?? null],
  );
  res.status(201).json(rows[0]);
});

// Pregunta a la IA usando TODO el historial del chat del negocio (mas sus
// tareas) como contexto - asi se puede encontrar informacion vieja sin
// scrollear ("que se habia dicho del proveedor X").
router.post('/negocios/:id/chat/preguntar', async (req, res) => {
  const { pregunta } = req.body ?? {};
  if (!pregunta?.trim()) return res.status(400).json({ error: 'pregunta es requerida.' });
  if (!process.env.OPENROUTER_API_KEY) return res.status(503).json({ error: 'IA no configurada (falta OPENROUTER_API_KEY).' });

  const negocioRes = await pool.query('SELECT nombre FROM gestion_negocios WHERE id = $1', [req.params.id]);
  if (!negocioRes.rows[0]) return res.status(404).json({ error: 'Negocio no encontrado.' });

  const mensajes = await pool.query(
    `SELECT usuario_nombre, mensaje, creado_en FROM gestion_chat_mensajes WHERE negocio_id = $1 ORDER BY creado_en LIMIT 500`,
    [req.params.id],
  );
  const tareas = await pool.query(
    `SELECT titulo, estado, descripcion FROM gestion_tareas WHERE negocio_id = $1 ORDER BY creado_en DESC LIMIT 100`,
    [req.params.id],
  );

  const contexto = [
    `Tareas del negocio "${negocioRes.rows[0].nombre}":`,
    ...tareas.rows.map((t) => `- [${t.estado}] ${t.titulo}${t.descripcion ? `: ${t.descripcion}` : ''}`),
    '',
    'Historial del chat interno:',
    ...mensajes.rows.map((m) => `${m.creado_en.toISOString()} ${m.usuario_nombre}: ${m.mensaje}`),
  ].join('\n').slice(-40000);

  try {
    const aiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'anthropic/claude-sonnet-5',
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content: 'Respondes preguntas sobre el chat interno y las tareas de un negocio, usando SOLO la informacion de contexto dada. Si no esta en el contexto, decilo. Respondes en español, breve y directo, sin markdown.',
          },
          { role: 'user', content: `Contexto:\n${contexto}\n\nPregunta: ${pregunta.trim()}` },
        ],
      }),
    });
    const data = await aiRes.json();
    if (!aiRes.ok) return res.status(502).json({ error: 'El servicio de IA no pudo procesar la pregunta.' });
    res.json({ respuesta: (data.choices?.[0]?.message?.content ?? '').trim() });
  } catch (err) {
    console.error('Error llamando a OpenRouter (chat/preguntar):', err);
    res.status(502).json({ error: 'No se pudo comunicar con el servicio de IA.' });
  }
});

// --- Comparador de presupuestos ---

// Convierte un adjunto ya subido (pdf/imagen/documento) en contenido legible
// por la IA - mismo patron que /comercial/catalogo-items/importar-preview.
async function adjuntoAContenidoIA(adjunto) {
  const filePath = path.join(UPLOADS_DIR, adjunto.archivo_path);
  const buffer = fs.readFileSync(filePath);
  if (adjunto.tipo === 'imagen') {
    return { type: 'image', mimeType: adjunto.mime_type, base64: buffer.toString('base64') };
  }
  if (adjunto.tipo === 'pdf') {
    const parsed = await pdfParse(buffer).catch(() => null);
    if (parsed?.text?.trim()) return { type: 'text', text: parsed.text.slice(0, 40000) };
    const paginas = pdfPaginasAImagenes(buffer);
    if (paginas.length > 0) return { type: 'images', images: paginas };
    return { type: 'text', text: '(PDF sin texto legible)' };
  }
  if (adjunto.tipo === 'video' || adjunto.tipo === 'audio') {
    return { type: 'text', text: `(Archivo ${adjunto.tipo} "${adjunto.nombre_original}" - no se puede leer como texto para la comparacion)` };
  }
  return { type: 'text', text: buffer.toString('utf8').slice(0, 40000) };
}

// Snapshot liviano del adjunto de un campo (presupuesto/descripcion/foto/
// video) tal como viene de la query con join, para guardar en el historial
// de comparativas sin depender de que el proveedor siga existiendo despues.
function snapshotAdjuntoCampo(row, prefijo) {
  const path_ = row[`${prefijo}_adjunto_path`];
  if (!path_) return null;
  return { nombre_original: row[`${prefijo}_adjunto_nombre`], archivo_path: path_, tipo: row[`${prefijo}_adjunto_tipo`] };
}

router.post('/negocios/:id/comparar-presupuestos', async (req, res) => {
  const { titulo, proveedor_ids: proveedorIds } = req.body ?? {};
  if (!titulo?.trim()) return res.status(400).json({ error: 'titulo es requerido.' });
  if (!Array.isArray(proveedorIds) || proveedorIds.length < 2 || proveedorIds.length > 3) {
    return res.status(400).json({ error: 'proveedor_ids debe tener entre 2 y 3 ids.' });
  }
  if (!process.env.OPENROUTER_API_KEY) return res.status(503).json({ error: 'IA no configurada (falta OPENROUTER_API_KEY).' });

  const { rows: proveedores } = await pool.query(
    `SELECT p.*, ${PROVEEDOR_ADJUNTO_COLUMNAS}
       FROM gestion_proveedores_presupuesto p ${PROVEEDOR_ADJUNTO_JOINS}
       WHERE p.id = ANY($1::int[]) AND p.negocio_id = $2`,
    [proveedorIds.map(Number), req.params.id],
  );
  if (proveedores.length !== proveedorIds.length) return res.status(400).json({ error: 'Algun proveedor no existe en este negocio.' });
  if (proveedores.some((p) => !p.presupuesto_texto && !p.presupuesto_adjunto_path)) {
    return res.status(400).json({ error: 'Todos los proveedores elegidos necesitan un presupuesto (texto o adjunto).' });
  }

  const usuario = await usuarioActual(req);
  const content = [{
    type: 'text',
    text: `Compara estos ${proveedores.length} presupuestos de proveedores distintos para "${titulo.trim()}". Para cada proveedor identifica items/materiales, cantidades, precios unitarios y totales, condiciones de pago/entrega y cualquier observacion relevante. Devolve EXCLUSIVAMENTE un JSON valido (sin markdown ni backticks) con la forma:\n{"items_comparados": [{"item": "...", "por_proveedor": {"NombreProveedor": {"precio": "...", "detalle": "..."}}}], "resumen": "texto breve con la recomendacion y por que"}\n\nProveedores en orden: ${proveedores.map((p) => p.nombre).join(', ')}.`,
  }];

  const snapshot = [];
  for (const prov of proveedores) {
    content.push({
      type: 'text',
      text: `--- Proveedor: ${prov.nombre}${prov.contacto ? ` (contacto: ${prov.contacto})` : ''} ---\n${prov.resumen ? `Resumen: ${prov.resumen}\n` : ''}`,
    });

    content.push({ type: 'text', text: 'Presupuesto:' });
    if (prov.presupuesto_texto) {
      content.push({ type: 'text', text: prov.presupuesto_texto });
    } else {
      const adjunto = { tipo: prov.presupuesto_adjunto_tipo, mime_type: prov.presupuesto_adjunto_mime, archivo_path: prov.presupuesto_adjunto_path, nombre_original: prov.presupuesto_adjunto_nombre };
      // eslint-disable-next-line no-await-in-loop
      const datos = await adjuntoAContenidoIA(adjunto);
      if (datos.type === 'text') content.push({ type: 'text', text: datos.text });
      else if (datos.type === 'image') content.push({ type: 'image_url', image_url: { url: `data:${datos.mimeType};base64,${datos.base64}` } });
      else if (datos.type === 'images') {
        for (const img of datos.images) content.push({ type: 'image_url', image_url: { url: `data:${img.mimeType};base64,${img.base64}` } });
      }
    }

    if (prov.descripcion_texto || prov.descripcion_adjunto_path) {
      content.push({ type: 'text', text: 'Descripcion tecnica:' });
      if (prov.descripcion_texto) {
        content.push({ type: 'text', text: prov.descripcion_texto });
      } else {
        const adjunto = { tipo: prov.descripcion_adjunto_tipo, mime_type: prov.descripcion_adjunto_mime, archivo_path: prov.descripcion_adjunto_path, nombre_original: prov.descripcion_adjunto_nombre };
        // eslint-disable-next-line no-await-in-loop
        const datos = await adjuntoAContenidoIA(adjunto);
        if (datos.type === 'text') content.push({ type: 'text', text: datos.text });
        else if (datos.type === 'image') content.push({ type: 'image_url', image_url: { url: `data:${datos.mimeType};base64,${datos.base64}` } });
      }
    }

    snapshot.push({
      proveedor_id: prov.id,
      nombre: prov.nombre,
      contacto: prov.contacto,
      resumen: prov.resumen,
      presupuesto_texto: prov.presupuesto_texto,
      presupuesto_adjunto: snapshotAdjuntoCampo(prov, 'presupuesto'),
      descripcion_texto: prov.descripcion_texto,
      descripcion_adjunto: snapshotAdjuntoCampo(prov, 'descripcion'),
      foto_adjunto: snapshotAdjuntoCampo(prov, 'foto'),
      video_adjunto: snapshotAdjuntoCampo(prov, 'video'),
    });
  }

  try {
    const aiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'anthropic/claude-sonnet-5', temperature: 0, messages: [{ role: 'user', content }] }),
    });
    const data = await aiRes.json();
    if (!aiRes.ok) {
      console.error('Error de OpenRouter (comparar-presupuestos):', data);
      return res.status(502).json({ error: 'El servicio de IA no pudo procesar los presupuestos.' });
    }
    let text = (data.choices?.[0]?.message?.content ?? '').trim();
    text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/, '');
    let resultado;
    try {
      resultado = JSON.parse(text);
    } catch {
      console.error('IA devolvio JSON invalido (comparar-presupuestos):', text);
      return res.status(502).json({ error: 'La IA no devolvio un formato valido. Proba con presupuestos mas claros.' });
    }

    const { rows } = await pool.query(
      `INSERT INTO gestion_comparativas (negocio_id, titulo, proveedores, resultado, creado_por_usuario_id, creado_por_nombre)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.params.id, titulo.trim(), JSON.stringify(snapshot), JSON.stringify(resultado), usuario.id, usuario.nombre],
    );
    await registrarLog({
      negocioId: req.params.id, entidadTipo: 'comparativa', entidadId: rows[0].id, accion: 'creada', detalle: titulo.trim(), usuario,
    });
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Error llamando a OpenRouter (comparar-presupuestos):', err);
    res.status(502).json({ error: 'No se pudo comunicar con el servicio de IA.' });
  }
});

router.get('/negocios/:id/comparativas', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM gestion_comparativas WHERE negocio_id = $1 ORDER BY creado_en DESC`,
    [req.params.id],
  );
  res.json(rows);
});

module.exports = router;
