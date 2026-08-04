const express = require('express');
const cors = require('cors');

const app = express();
app.set('trust proxy', 1); // behind nginx - needed so req.ip is the real client, not the proxy
app.use(cors());
app.use(express.json());

app.use('/auth', require('./routes/auth'));
app.use('/superadmin', require('./routes/superadmin'));
app.use('/admin', require('./routes/admin'));
app.use('/consorcio', require('./routes/consorcio'));
app.use('/residente', require('./routes/residente'));
app.use('/medidor', require('./routes/medidor'));
app.use('/public', require('./routes/public'));

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

module.exports = app;
