-- Medidor general de edificio: el consorcio en si mismo puede tener su
-- propio medidor dinamico (ademas del que ya existe por sector).
ALTER TABLE consorcios ADD COLUMN IF NOT EXISTS usar_medidor_dinamico BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS lecturas_consorcio (
  id SERIAL PRIMARY KEY,
  consorcio_id INTEGER NOT NULL REFERENCES consorcios(id) ON DELETE CASCADE,
  "timestamp" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  amps_l1 NUMERIC,
  amps_l2 NUMERIC,
  amps_l3 NUMERIC,
  potencia_kw NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lecturas_consorcio_ts ON lecturas_consorcio (consorcio_id, "timestamp" DESC);

-- Configuracion de medidores fisicos leidos por Modbus-TCP (gateway RS485->TCP
-- en el tablero electrico). sector_id NULL = medidor general del edificio;
-- sector_id seteado = medidor de ese piso/subsuelo puntual. Uno de cada por
-- edificio/sector (no tiene sentido tener dos medidores generales).
CREATE TABLE IF NOT EXISTS medidores_modbus (
  id SERIAL PRIMARY KEY,
  consorcio_id INTEGER NOT NULL REFERENCES consorcios(id) ON DELETE CASCADE,
  sector_id INTEGER REFERENCES sectores(id) ON DELETE CASCADE,
  nombre VARCHAR(100) NOT NULL,
  modelo VARCHAR(30) NOT NULL DEFAULT 'ADW300',
  host VARCHAR(255) NOT NULL,
  puerto INTEGER NOT NULL DEFAULT 502,
  unit_id INTEGER NOT NULL DEFAULT 1,
  intervalo_seg INTEGER NOT NULL DEFAULT 15,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  ultima_lectura_en TIMESTAMPTZ,
  ultimo_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_medidores_modbus_general
  ON medidores_modbus (consorcio_id) WHERE sector_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_medidores_modbus_sector
  ON medidores_modbus (sector_id) WHERE sector_id IS NOT NULL;
