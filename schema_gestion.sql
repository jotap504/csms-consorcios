-- Modulo de organizacion interna de Bilon (no es para consorcios/clientes):
-- tareas y pendientes separados por "negocio" (Wallbox, Drones, Detector de
-- incendio, etc), con adjuntos (audio/imagen/pdf), un log de auditoria y un
-- chat interno por negocio que la IA puede usar como contexto para
-- responder preguntas o armar comparativas de presupuestos de proveedores.

INSERT INTO permisos (clave, descripcion) VALUES
  ('gestion_interna', 'Organizacion interna de Bilon: negocios, tareas, pendientes, chat y comparador de presupuestos')
ON CONFLICT (clave) DO NOTHING;

INSERT INTO rol_permisos (rol, permiso_id)
SELECT 'superadmin', id FROM permisos WHERE clave = 'gestion_interna'
UNION ALL SELECT 'instalador', id FROM permisos WHERE clave = 'gestion_interna'
ON CONFLICT (rol, permiso_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS gestion_negocios (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(120) NOT NULL UNIQUE,
  orden INT NOT NULL DEFAULT 0,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO gestion_negocios (nombre, orden) VALUES
  ('Wallbox', 1), ('Drones', 2), ('Detector de incendio', 3)
ON CONFLICT (nombre) DO NOTHING;

CREATE TABLE IF NOT EXISTS gestion_tareas (
  id SERIAL PRIMARY KEY,
  negocio_id INT NOT NULL REFERENCES gestion_negocios(id) ON DELETE CASCADE,
  titulo VARCHAR(200) NOT NULL,
  descripcion TEXT,
  estado VARCHAR(20) NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'en_curso', 'hecho')),
  asignado_a_usuario_id INT REFERENCES usuarios(id) ON DELETE SET NULL,
  asignado_a_nombre VARCHAR(120),
  vence_en TIMESTAMPTZ,
  creado_por_usuario_id INT REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_por_nombre VARCHAR(120),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gestion_tareas_negocio ON gestion_tareas(negocio_id, estado);

-- tipo deriva del mimetype al subir (ver routes/gestion.js) - sirve para
-- filtrar en la UI y para que el comparador de presupuestos sepa cuales
-- adjuntos tiene sentido mandarle a la IA (imagen/pdf/documento, no audio).
CREATE TABLE IF NOT EXISTS gestion_adjuntos (
  id SERIAL PRIMARY KEY,
  negocio_id INT NOT NULL REFERENCES gestion_negocios(id) ON DELETE CASCADE,
  tarea_id INT REFERENCES gestion_tareas(id) ON DELETE SET NULL,
  tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('audio', 'imagen', 'pdf', 'documento', 'otro')),
  archivo_path VARCHAR(255) NOT NULL,
  nombre_original VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100),
  tamano_bytes INT,
  subido_por_usuario_id INT REFERENCES usuarios(id) ON DELETE SET NULL,
  subido_por_nombre VARCHAR(120),
  subido_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gestion_adjuntos_negocio ON gestion_adjuntos(negocio_id);

-- Auditoria generica del modulo: una fila por cada alta/edicion/baja de
-- tarea, negocio o comparativa. entidad_tipo/entidad_id identifican que se
-- tocó, detalle es un texto libre (ej. "estado: pendiente -> hecho").
CREATE TABLE IF NOT EXISTS gestion_log (
  id SERIAL PRIMARY KEY,
  negocio_id INT REFERENCES gestion_negocios(id) ON DELETE CASCADE,
  entidad_tipo VARCHAR(30) NOT NULL,
  entidad_id INT,
  accion VARCHAR(30) NOT NULL,
  detalle TEXT,
  usuario_id INT REFERENCES usuarios(id) ON DELETE SET NULL,
  usuario_nombre VARCHAR(120),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gestion_log_negocio ON gestion_log(negocio_id, creado_en DESC);

-- Chat interno por negocio - queda todo registrado para que la IA (ver
-- POST /negocios/:id/chat/preguntar) pueda usarlo como contexto y contestar
-- preguntas tipo "que se habia dicho sobre el proveedor X".
CREATE TABLE IF NOT EXISTS gestion_chat_mensajes (
  id SERIAL PRIMARY KEY,
  negocio_id INT NOT NULL REFERENCES gestion_negocios(id) ON DELETE CASCADE,
  usuario_id INT REFERENCES usuarios(id) ON DELETE SET NULL,
  usuario_nombre VARCHAR(120),
  mensaje TEXT NOT NULL,
  adjunto_id INT REFERENCES gestion_adjuntos(id) ON DELETE SET NULL,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gestion_chat_negocio ON gestion_chat_mensajes(negocio_id, creado_en);

-- Resultado de comparar 2-3 presupuestos de proveedores distintos con IA.
-- proveedores: [{nombre, adjunto_id}], resultado: tabla estructurada que
-- devuelve la IA (items, precios, condiciones, observaciones).
CREATE TABLE IF NOT EXISTS gestion_comparativas (
  id SERIAL PRIMARY KEY,
  negocio_id INT NOT NULL REFERENCES gestion_negocios(id) ON DELETE CASCADE,
  titulo VARCHAR(200) NOT NULL,
  proveedores JSONB NOT NULL,
  resultado JSONB NOT NULL,
  creado_por_usuario_id INT REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_por_nombre VARCHAR(120),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gestion_comparativas_negocio ON gestion_comparativas(negocio_id);
