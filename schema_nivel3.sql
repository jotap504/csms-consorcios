-- Nivel 3 del analisis GRASEN (analisis-plataforma-grasen.md seccion 5):
-- Firmware update remoto, Diagnostico remoto (GetLog), Vehiculos por
-- usuario. RBAC (System User + Permission) reusa la tabla usuarios
-- existente, sin schema nuevo. Smart Charging con 4 modos no necesita
-- nada nuevo (los 4 ya quedaron cubiertos por trabajo previo, ver plan).

CREATE TABLE IF NOT EXISTS firmware_updates (
  id SERIAL PRIMARY KEY,
  cargador_ocpp_id VARCHAR(50) NOT NULL,
  filename VARCHAR(255) NOT NULL,
  version_reportada VARCHAR(50),
  status VARCHAR(30) NOT NULL DEFAULT 'Pendiente',
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_firmware_updates_cargador ON firmware_updates (cargador_ocpp_id, creado_en DESC);

CREATE TABLE IF NOT EXISTS diagnosticos (
  id SERIAL PRIMARY KEY,
  cargador_ocpp_id VARCHAR(50) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'Pendiente',
  filename VARCHAR(255),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_diagnosticos_cargador ON diagnosticos (cargador_ocpp_id, creado_en DESC);

CREATE TABLE IF NOT EXISTS vehiculos (
  id SERIAL PRIMARY KEY,
  uf_id INT NOT NULL REFERENCES unidades_funcionales(id) ON DELETE CASCADE,
  patente VARCHAR(20),
  vin VARCHAR(30),
  alias VARCHAR(100),
  marca VARCHAR(50),
  modelo VARCHAR(50),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vehiculos_uf ON vehiculos (uf_id);
