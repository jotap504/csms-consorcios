require('express-async-errors'); // sin esto, un error dentro de un async
// route handler (ej: violacion de un CHECK de la base) queda como promesa
// rechazada sin catch -> Node lo trata como fatal y tira abajo TODO el
// backend (Express 4 no reenvia errores async al error handler solo).
const express = require('express');
const cors = require('cors');

const app = express();
app.set('trust proxy', 1); // behind nginx - needed so req.ip is the real client, not the proxy
app.use(cors());
app.use(express.json());

app.use('/auth', require('./routes/auth'));
app.use('/superadmin', require('./routes/superadmin'));
app.use('/admin', require('./routes/admin'));
app.use('/contabilidad', require('./routes/contabilidad'));
app.use('/comercial', require('./routes/comercial'));
app.use('/asistente', require('./routes/asistente'));
app.use('/consorcio', require('./routes/consorcio'));
app.use('/residente', require('./routes/residente'));
app.use('/proveedor', require('./routes/proveedor'));
app.use('/medidor', require('./routes/medidor'));
app.use('/public', require('./routes/public'));

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use((err, _req, res, _next) => {
  console.error(err);
  // Errores de validacion de Postgres (check/not-null/foreign-key/unique) son
  // culpa del dato enviado, no una falla del servidor - devolver 400 en vez
  // de 500 para que el cliente sepa que tiene que corregir el request.
  if (['23514', '23502', '23503', '22P02'].includes(err.code)) {
    return res.status(400).json({ error: 'Datos invalidos.' });
  }
  if (err.code === '23505') {
    return res.status(409).json({ error: 'Ya existe un registro con ese valor.' });
  }
  res.status(500).json({ error: 'Error interno del servidor.' });
});

module.exports = app;
