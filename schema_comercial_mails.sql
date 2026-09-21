-- Bandeja de entrada tipo Gmail para el modulo Comercial: guarda cada mail
-- entrante/saliente (matcheado a un contacto o no) para poder listarlos,
-- leerlos y responder desde la web, ademas de los seguimientos que ya se
-- crean en comercial_seguimientos para contactos conocidos.

CREATE TABLE IF NOT EXISTS comercial_mails (
  id SERIAL PRIMARY KEY,
  direccion TEXT NOT NULL CHECK (direccion IN ('entrante', 'saliente')),
  contacto_id INTEGER REFERENCES comercial_contactos(id) ON DELETE SET NULL,
  de_email TEXT,
  de_nombre TEXT,
  para_email TEXT,
  asunto TEXT,
  cuerpo_texto TEXT,
  cuerpo_html TEXT,
  message_id TEXT,
  in_reply_to TEXT,
  leido BOOLEAN NOT NULL DEFAULT FALSE,
  fecha TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responsable_nombre TEXT,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comercial_mails_fecha ON comercial_mails(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_comercial_mails_contacto ON comercial_mails(contacto_id);
CREATE INDEX IF NOT EXISTS idx_comercial_mails_leido ON comercial_mails(leido) WHERE leido = FALSE;
