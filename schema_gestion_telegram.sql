-- Integracion con Telegram para el modulo de organizacion (ver
-- schema_gestion.sql): cada usuario vincula SU chat de Telegram una vez
-- (codigo de un solo uso generado desde el panel) y a partir de ahi el bot
-- sabe quien le escribe - varias lineas/usuarios distintos pueden hablarle
-- al mismo bot, cada uno resuelto a su propio usuario.

CREATE TABLE IF NOT EXISTS telegram_vinculos (
  usuario_id INT PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
  chat_id BIGINT UNIQUE NOT NULL,
  vinculado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Codigo de un solo uso (TTL corto) para vincular: se genera desde el panel
-- (GET /gestion/telegram/vincular) y se consume con "/vincular <codigo>" en
-- el chat de Telegram.
CREATE TABLE IF NOT EXISTS telegram_codigos (
  codigo VARCHAR(10) PRIMARY KEY,
  usuario_id INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  expira_en TIMESTAMPTZ NOT NULL
);

-- Recordatorio opcional por tarea (ej. "reunion con cliente 12/12 10hs" via
-- Telegram crea una tarea con vence_en + aviso_previo_minutos). avisado_en
-- evita mandar el mismo recordatorio dos veces (ver tickRecordatorios).
ALTER TABLE gestion_tareas ADD COLUMN IF NOT EXISTS aviso_previo_minutos INT;
ALTER TABLE gestion_tareas ADD COLUMN IF NOT EXISTS avisado_en TIMESTAMPTZ;
