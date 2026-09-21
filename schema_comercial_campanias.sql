-- Campañas de mail como entidad reusable: se crean una vez (asunto + cuerpo
-- HTML armado con el asistente) y se pueden enviar multiples veces, en
-- distintos momentos, a distintos subconjuntos de contactos. Antes el envio
-- estaba pegado 1 a 1 con la seleccion de contactos - esto lo separa.
CREATE TABLE IF NOT EXISTS comercial_campanias (
  id SERIAL PRIMARY KEY,
  asunto TEXT NOT NULL,
  cuerpo_html TEXT NOT NULL,
  creado_por_usuario_id INTEGER,
  creado_por_nombre TEXT,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  veces_enviada INTEGER NOT NULL DEFAULT 0,
  ultimo_envio_en TIMESTAMPTZ
);
