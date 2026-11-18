-- Tracking de apertura (pixel invisible de 1x1 en el html del mail). Ver
-- campaniaEnvioHelpers.js y lib/tokenBaja.js (tokenPixel).
ALTER TABLE comercial_campania_envios_destinatarios ADD COLUMN IF NOT EXISTS abierto_en TIMESTAMPTZ;
ALTER TABLE comercial_campania_envios ADD COLUMN IF NOT EXISTS abiertos INTEGER NOT NULL DEFAULT 0;
