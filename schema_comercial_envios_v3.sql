-- Ventana horaria por corrida (hora Argentina) - fuera de esta ventana el
-- tick no manda nada; dentro, se manda proporcional al tiempo transcurrido
-- para esparcir el lote del dia en vez de mandarlo todo de una.
ALTER TABLE comercial_campania_envios ADD COLUMN IF NOT EXISTS hora_inicio TEXT NOT NULL DEFAULT '09:00';
ALTER TABLE comercial_campania_envios ADD COLUMN IF NOT EXISTS hora_fin TEXT NOT NULL DEFAULT '19:00';
