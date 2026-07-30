ALTER TABLE cargadores ADD COLUMN IF NOT EXISTS uf_id INT REFERENCES unidades_funcionales(id) ON DELETE SET NULL;
ALTER TABLE tarjetas_rfid ADD COLUMN IF NOT EXISTS cargador_id INT REFERENCES cargadores(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS lecturas_medidor (
    id SERIAL PRIMARY KEY,
    cargador_ocpp_id VARCHAR(50) NOT NULL,
    transaction_id_ocpp VARCHAR(100) NOT NULL,
    consorcio_id INT REFERENCES consorcios(id) ON DELETE CASCADE,
    "timestamp" TIMESTAMPTZ NOT NULL,
    kwh_acumulado NUMERIC(10,3) NOT NULL,
    potencia_kw NUMERIC(10,3)
);

CREATE INDEX IF NOT EXISTS idx_lecturas_medidor_cargador_ts
  ON lecturas_medidor (cargador_ocpp_id, "timestamp" DESC);
