-- Tracking de clicks en links del cuerpo del mail (ademas de la apertura via
-- pixel de schema_comercial_envios_v4.sql). Ver campaniaEnvioHelpers.js y
-- lib/tokenBaja.js (tokenClick).
ALTER TABLE comercial_campania_envios_destinatarios ADD COLUMN IF NOT EXISTS clickeado_en TIMESTAMPTZ;
ALTER TABLE comercial_campania_envios ADD COLUMN IF NOT EXISTS clicks INTEGER NOT NULL DEFAULT 0;
