const express = require('express');
const { pool } = require('../db');

const router = express.Router();

// Ingesta de lecturas de medidores de corriente por sector. Sin JWT: quien
// llama aca es un gateway/ESP32/bridge MQTT-a-HTTP no interactivo, no un
// usuario logueado - se autentica con la api key propia de cada sector.
router.post('/sectores/:id/lectura', async (req, res) => {
  const apiKey = req.header('X-Meter-Key');
  if (!apiKey) {
    return res.status(401).json({ error: 'Falta el header X-Meter-Key.' });
  }

  const sector = await pool.query(
    'SELECT id FROM sectores WHERE id = $1 AND medidor_api_key = $2',
    [req.params.id, apiKey],
  );
  if (sector.rowCount === 0) {
    return res.status(403).json({ error: 'Clave invalida para este sector.' });
  }

  const { amps_l1, amps_l2, amps_l3, potencia_kw } = req.body ?? {};
  if (amps_l1 == null && amps_l2 == null && amps_l3 == null && potencia_kw == null) {
    return res.status(400).json({ error: 'Mandá al menos amps_l1/l2/l3 o potencia_kw.' });
  }

  await pool.query(
    `INSERT INTO lecturas_sector (sector_id, amps_l1, amps_l2, amps_l3, potencia_kw)
     VALUES ($1, $2, $3, $4, $5)`,
    [req.params.id, amps_l1 ?? null, amps_l2 ?? null, amps_l3 ?? null, potencia_kw ?? null],
  );

  res.status(201).json({ ok: true });
});

module.exports = router;
