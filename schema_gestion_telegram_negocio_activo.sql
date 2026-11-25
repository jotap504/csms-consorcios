-- "Negocio activo" por chat de Telegram: se setea con /negocio (menu con
-- botones) o /negocio <nombre>, y queda como default para los mensajes que
-- no digan explicitamente "negocio: ..." - asi no hay que escribir el
-- nombre del negocio en cada mensaje.
ALTER TABLE telegram_vinculos ADD COLUMN IF NOT EXISTS negocio_activo_id INT REFERENCES gestion_negocios(id) ON DELETE SET NULL;
