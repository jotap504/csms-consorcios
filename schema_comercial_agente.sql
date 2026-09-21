-- Agente de tareas de Comercial: registro de informes/archivos que el
-- agente genera cuando se le encarga una tarea (ver backend/src/routes/comercial.js).

CREATE TABLE IF NOT EXISTS comercial_agente_informes (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(200) NOT NULL,
  filename VARCHAR(120) NOT NULL,
  tipo VARCHAR(30) NOT NULL DEFAULT 'texto',
  creado_por_usuario_id INT REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_por_nombre VARCHAR(120),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
