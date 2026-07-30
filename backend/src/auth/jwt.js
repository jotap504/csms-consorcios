const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET;

function signToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      rol: user.rol,
      consorcioId: user.consorcio_id,
      ufId: user.uf_id,
    },
    SECRET,
    { expiresIn: '8h' },
  );
}

function verifyToken(token) {
  return jwt.verify(token, SECRET);
}

module.exports = { signToken, verifyToken };
