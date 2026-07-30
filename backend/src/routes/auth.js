const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const { signToken } = require('../auth/jwt');

const router = express.Router();

router.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) {
    return res.status(400).json({ error: 'email y password son requeridos.' });
  }

  const result = await pool.query(
    'SELECT id, email, password_hash, rol, consorcio_id, uf_id FROM usuarios WHERE email = $1 AND activo = TRUE',
    [email],
  );
  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: 'Credenciales invalidas.' });
  }

  const token = signToken(user);
  res.json({
    token,
    rol: user.rol,
    consorcioId: user.consorcio_id,
    ufId: user.uf_id,
  });
});

module.exports = router;
