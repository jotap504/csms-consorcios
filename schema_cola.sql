CREATE TABLE IF NOT EXISTS cargador_estado_actual (
  cargador_ocpp_id VARCHAR(255) PRIMARY KEY,
  amps_asignados INTEGER,
  en_cola BOOLEAN NOT NULL DEFAULT FALSE,
  conectado BOOLEAN,
  status_ocpp VARCHAR(50),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
