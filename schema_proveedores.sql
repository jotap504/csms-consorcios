-- Login/panel para proveedores de wallbox: prueban su equipo (emparejar,
-- setear amps min/max, iniciar/detener carga, generar QR) sin tocar nunca
-- el DLM ni la facturacion real de un consorcio - por eso proveedor_cargadores
-- es una tabla separada de cargadores, no una variante con consorcio_id NULL.

CREATE TABLE IF NOT EXISTS proveedores (
  id SERIAL PRIMARY KEY,
  nombre_empresa VARCHAR(150) NOT NULL,
  email_contacto VARCHAR(150),
  activo BOOLEAN DEFAULT TRUE,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS proveedor_cargadores (
  id SERIAL PRIMARY KEY,
  proveedor_id INT NOT NULL REFERENCES proveedores(id) ON DELETE CASCADE,
  ocpp_id VARCHAR(50) NOT NULL UNIQUE,
  ocpp_version VARCHAR(10) NOT NULL DEFAULT '2.0.1',
  etiqueta VARCHAR(100),
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS proveedor_tests (
  id SERIAL PRIMARY KEY,
  proveedor_id INT NOT NULL REFERENCES proveedores(id) ON DELETE CASCADE,
  cargador_ocpp_id VARCHAR(50) NOT NULL,
  usuario_id INT REFERENCES usuarios(id) ON DELETE SET NULL,
  accion VARCHAR(20) NOT NULL CHECK (accion IN ('emparejar', 'set_amps', 'iniciar', 'detener', 'generar_qr')),
  resultado VARCHAR(10) NOT NULL CHECK (resultado IN ('OK', 'ERROR')),
  detalle TEXT,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_proveedor_tests_proveedor ON proveedor_tests (proveedor_id, creado_en DESC);

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS proveedor_id INT REFERENCES proveedores(id) ON DELETE CASCADE;
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_rol_check
  CHECK (rol IN ('superadmin', 'consorcio_admin', 'residente', 'instalador', 'proveedor'));

-- Para poder "detener" un test sin depender de liquidacion_sesiones (esa
-- tabla es solo para cargas facturables reales de un consorcio).
ALTER TABLE cargador_estado_actual ADD COLUMN IF NOT EXISTS transaction_id_ocpp VARCHAR(100);
