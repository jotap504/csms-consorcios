-- Envios masivos de campanias (via Elastic Email) con rampa de warm-up: cada
-- fila de comercial_campania_envios es una "corrida" de una campania a un
-- subconjunto de contactos, que se manda de a lotes crecientes durante varios
-- dias (ver services/campaniaRamp.js). comercial_campania_envios_destinatarios
-- es la lista congelada de destinatarios de esa corrida puntual.
CREATE TABLE IF NOT EXISTS comercial_campania_envios (
  id SERIAL PRIMARY KEY,
  campania_id INTEGER NOT NULL REFERENCES comercial_campanias(id) ON DELETE RESTRICT,
  estado TEXT NOT NULL DEFAULT 'en_curso' CHECK (estado IN ('en_curso','pausado','completado','cancelado')),
  -- Snapshot del contenido al crear la corrida: si alguien edita la campania
  -- mientras esta corrida esta en curso (puede durar varios dias), no cambia
  -- lo que reciben los destinatarios de los lotes que todavia faltan mandar.
  asunto_snapshot TEXT NOT NULL,
  cuerpo_html_snapshot TEXT NOT NULL,
  total_destinatarios INTEGER NOT NULL,
  enviados INTEGER NOT NULL DEFAULT 0,
  fallidos INTEGER NOT NULL DEFAULT 0,
  rebotados INTEGER NOT NULL DEFAULT 0,
  quejas INTEGER NOT NULL DEFAULT 0,
  dia_actual INTEGER NOT NULL DEFAULT 0,
  ultimo_lote_en DATE,
  pausado_motivo TEXT,
  creado_por_usuario_id INTEGER,
  creado_por_nombre TEXT,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS comercial_campania_envios_destinatarios (
  id SERIAL PRIMARY KEY,
  envio_id INTEGER NOT NULL REFERENCES comercial_campania_envios(id) ON DELETE CASCADE,
  contacto_id INTEGER REFERENCES comercial_contactos(id) ON DELETE SET NULL,
  -- Snapshot del email al crear la corrida, por la misma razon que el
  -- contenido: si el contacto cambia de mail o se marca no_contactar a mitad
  -- de la corrida, esta lista ya decidida no se ve afectada.
  email TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','enviado','fallido','rebotado','queja')),
  elastic_message_id TEXT,
  enviado_en TIMESTAMPTZ,
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_cce_campania ON comercial_campania_envios(campania_id);
CREATE INDEX IF NOT EXISTS idx_cce_en_curso ON comercial_campania_envios(estado) WHERE estado = 'en_curso';
CREATE INDEX IF NOT EXISTS idx_cced_envio_estado ON comercial_campania_envios_destinatarios(envio_id, estado);
CREATE INDEX IF NOT EXISTS idx_cced_message_id ON comercial_campania_envios_destinatarios(elastic_message_id) WHERE elastic_message_id IS NOT NULL;
