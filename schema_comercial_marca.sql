-- Recursos de marca (logo, imagenes de referencia de estilo, documentos/PDF
-- con info de la empresa) que el asistente de campañas usa como contexto:
-- el texto de los PDF se suma al prompt del chat, y el logo/imagenes de
-- referencia se mandan como input al modelo de generacion de imagenes para
-- que "copie el estilo".
CREATE TABLE IF NOT EXISTS comercial_recursos_marca (
  id SERIAL PRIMARY KEY,
  tipo TEXT NOT NULL CHECK (tipo IN ('logo', 'imagen_referencia', 'documento')),
  nombre TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  texto_extraido TEXT,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
