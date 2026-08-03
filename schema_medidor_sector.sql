ALTER TABLE sectores ADD COLUMN IF NOT EXISTS medidor_api_key VARCHAR(64);
ALTER TABLE sectores ADD COLUMN IF NOT EXISTS usar_medidor_dinamico BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS lecturas_sector (
  id SERIAL PRIMARY KEY,
  sector_id INTEGER NOT NULL REFERENCES sectores(id) ON DELETE CASCADE,
  "timestamp" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  amps_l1 NUMERIC,
  amps_l2 NUMERIC,
  amps_l3 NUMERIC,
  potencia_kw NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lecturas_sector_sector_ts ON lecturas_sector (sector_id, "timestamp" DESC);
