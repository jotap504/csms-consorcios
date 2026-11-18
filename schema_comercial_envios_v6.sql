-- Inicio programado: un envio puede crearse en estado 'programado' con una
-- fecha/hora futura (inicia_en) y campaniaRamp.js lo pasa a 'en_curso' solo
-- cuando llega esa fecha. Ver routes/comercial.js (POST /campanias/:id/envios)
-- y services/campaniaRamp.js (tickRamp).
ALTER TABLE comercial_campania_envios ADD COLUMN IF NOT EXISTS inicia_en TIMESTAMPTZ;

ALTER TABLE comercial_campania_envios DROP CONSTRAINT IF EXISTS comercial_campania_envios_estado_check;
ALTER TABLE comercial_campania_envios ADD CONSTRAINT comercial_campania_envios_estado_check
  CHECK (estado IN ('programado','en_curso','pausado','completado','cancelado'));
