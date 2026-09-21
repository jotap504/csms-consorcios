const express = require('express');
const bcrypt = require('bcryptjs');
const { OAuth2Client } = require('google-auth-library');
const { pool } = require('../db');
const { signToken } = require('../auth/jwt');
const { generateToken } = require('../lib/tokens');
const { sendMail } = require('../lib/mailer');
const { authenticate } = require('../auth/middleware');

const router = express.Router();
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://192.168.1.38';
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1h

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

router.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) {
    return res.status(400).json({ error: 'email y password son requeridos.' });
  }

  const result = await pool.query(
    'SELECT id, email, password_hash, rol, consorcio_id, uf_id, proveedor_id FROM usuarios WHERE email = $1 AND activo = TRUE',
    [email],
  );
  const user = result.rows[0];
  if (!user || !user.password_hash || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: 'Credenciales invalidas.' });
  }

  const token = signToken(user);
  res.json({
    token,
    rol: user.rol,
    consorcioId: user.consorcio_id,
    ufId: user.uf_id,
    proveedorId: user.proveedor_id,
  });
});

router.post('/google', async (req, res) => {
  if (!googleClient) {
    return res.status(503).json({ error: 'Login con Google no esta configurado en el servidor.' });
  }
  const { credential } = req.body ?? {};
  if (!credential) {
    return res.status(400).json({ error: 'credential es requerido.' });
  }

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
    payload = ticket.getPayload();
  } catch {
    return res.status(401).json({ error: 'Token de Google invalido.' });
  }
  if (!payload?.email || !payload.email_verified) {
    return res.status(401).json({ error: 'Email de Google no verificado.' });
  }

  const result = await pool.query(
    'SELECT id, email, rol, consorcio_id, uf_id, proveedor_id FROM usuarios WHERE email = $1 AND activo = TRUE',
    [payload.email],
  );
  const user = result.rows[0];
  if (!user) {
    return res.status(401).json({ error: 'No existe una cuenta con este email. Contacta a tu administrador.' });
  }

  const token = signToken(user);
  res.json({
    token,
    rol: user.rol,
    consorcioId: user.consorcio_id,
    ufId: user.uf_id,
    proveedorId: user.proveedor_id,
  });
});

router.post('/forgot-password', async (req, res) => {
  const { email } = req.body ?? {};
  if (!email) {
    return res.status(400).json({ error: 'email es requerido.' });
  }

  const result = await pool.query(
    'SELECT id FROM usuarios WHERE email = $1 AND activo = TRUE',
    [email],
  );
  const user = result.rows[0];

  // Always respond the same way whether or not the email exists, to avoid
  // leaking which addresses have an account.
  if (user) {
    const token = generateToken();
    const expires = new Date(Date.now() + RESET_TOKEN_TTL_MS);
    await pool.query(
      'UPDATE usuarios SET reset_token = $1, reset_token_expires = $2 WHERE id = $3',
      [token, expires, user.id],
    );
    await sendMail({
      to: email,
      subject: 'Recupera tu contrasena - CSMS Consorcios',
      html: `<p>Para elegir una nueva contrasena, entra a este link (valido 1 hora):</p>
             <p><a href="${FRONTEND_URL}/reset-password?token=${token}">${FRONTEND_URL}/reset-password?token=${token}</a></p>`,
    });
  }

  res.json({ ok: true, message: 'Si el email existe, se envio un link de recuperacion.' });
});

router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body ?? {};
  if (!token || !password) {
    return res.status(400).json({ error: 'token y password son requeridos.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'La contrasena debe tener al menos 8 caracteres.' });
  }

  const result = await pool.query(
    'SELECT id FROM usuarios WHERE reset_token = $1 AND reset_token_expires > NOW() AND activo = TRUE',
    [token],
  );
  const user = result.rows[0];
  if (!user) {
    return res.status(400).json({ error: 'Link invalido o vencido. Pedi uno nuevo.' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await pool.query(
    'UPDATE usuarios SET password_hash = $1, reset_token = NULL, reset_token_expires = NULL WHERE id = $2',
    [passwordHash, user.id],
  );

  res.json({ ok: true, message: 'Contrasena actualizada. Ya podes iniciar sesion.' });
});

// Cambio de contrasena autogestionado (cualquier rol logueado, via menu del
// header/sidebar) - distinto del flujo forgot/reset-password por token: aca
// el usuario ya esta autenticado y confirma su clave actual.
router.post('/change-password', authenticate, async (req, res) => {
  const { currentPassword, newPassword } = req.body ?? {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'currentPassword y newPassword son requeridos.' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'La nueva contrasena debe tener al menos 8 caracteres.' });
  }

  const result = await pool.query(
    'SELECT id, password_hash FROM usuarios WHERE id = $1 AND activo = TRUE',
    [req.user.sub],
  );
  const user = result.rows[0];
  if (!user || !user.password_hash || !(await bcrypt.compare(currentPassword, user.password_hash))) {
    return res.status(401).json({ error: 'La contrasena actual es incorrecta.' });
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await pool.query('UPDATE usuarios SET password_hash = $1 WHERE id = $2', [passwordHash, user.id]);

  res.json({ ok: true, message: 'Contrasena actualizada.' });
});

module.exports = router;
