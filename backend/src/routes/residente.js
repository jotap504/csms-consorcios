const express = require('express');
const { pool } = require('../db');
const { authenticate, requireRole } = require('../auth/middleware');

const router = express.Router();
router.use(authenticate, requireRole('residente'));

router.get('/consumos', async (req, res) => {
  const { periodo } = req.query;
  const result = await pool.query(
    `SELECT transaction_id_ocpp, cargador_ocpp_id, fecha_inicio, fecha_fin,
            kwh_consumidos, precio_kwh_aplicado, monto_total_expensa, periodo_expensa
     FROM liquidacion_sesiones
     WHERE uf_id = $1 ${periodo ? 'AND periodo_expensa = $2' : ''}
     ORDER BY fecha_inicio DESC`,
    periodo ? [req.user.ufId, periodo] : [req.user.ufId],
  );
  res.json(result.rows);
});

router.get('/tarjetas', async (req, res) => {
  const result = await pool.query(
    'SELECT id, id_tag_ocpp, activa FROM tarjetas_rfid WHERE uf_id = $1 ORDER BY id',
    [req.user.ufId],
  );
  res.json(result.rows);
});

module.exports = router;
