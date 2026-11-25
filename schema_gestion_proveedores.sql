-- Ficha persistente por proveedor de presupuesto, separada de la
-- comparacion puntual (gestion_comparativas): el proveedor se carga una vez
-- y queda ahi (nombre, contacto, resumen, presupuesto, descripcion tecnica,
-- foto, video), para despues elegir 2-3 y compararlos con IA cuando se
-- quiera. Presupuesto y descripcion tecnica pueden ser texto escrito a mano
-- o un adjunto subido (pdf/imagen/doc) - nunca ambos a la vez.
CREATE TABLE IF NOT EXISTS gestion_proveedores_presupuesto (
  id SERIAL PRIMARY KEY,
  negocio_id INT NOT NULL REFERENCES gestion_negocios(id) ON DELETE CASCADE,
  nombre VARCHAR(200) NOT NULL,
  contacto VARCHAR(200),
  resumen TEXT,
  presupuesto_texto TEXT,
  presupuesto_adjunto_id INT REFERENCES gestion_adjuntos(id) ON DELETE SET NULL,
  descripcion_texto TEXT,
  descripcion_adjunto_id INT REFERENCES gestion_adjuntos(id) ON DELETE SET NULL,
  foto_adjunto_id INT REFERENCES gestion_adjuntos(id) ON DELETE SET NULL,
  video_adjunto_id INT REFERENCES gestion_adjuntos(id) ON DELETE SET NULL,
  creado_por_usuario_id INT REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_por_nombre VARCHAR(120),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gestion_proveedores_presupuesto_negocio ON gestion_proveedores_presupuesto(negocio_id);
