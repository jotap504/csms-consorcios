-- Un departamento (unidad funcional) puede tener mas de una cochera, y cada
-- cochera puede tener su propio wallbox. unidades_funcionales sigue siendo
-- la unidad de facturacion/login de residente (no cambia); cocheras es una
-- lista hija que agrupa los espacios fisicos de auto de ese depto.

CREATE TABLE IF NOT EXISTS cocheras (
  id SERIAL PRIMARY KEY,
  uf_id INTEGER NOT NULL REFERENCES unidades_funcionales(id) ON DELETE CASCADE,
  numero_cochera VARCHAR(50) NOT NULL,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cocheras_uf ON cocheras (uf_id);

ALTER TABLE cargadores ADD COLUMN IF NOT EXISTS cochera_id INTEGER REFERENCES cocheras(id) ON DELETE SET NULL;

-- Backfill: hasta ahora cada UF tenia a lo sumo 1 cochera (columna
-- numero_cochera). Migramos ese dato a una fila en cocheras y reconectamos
-- los cargadores existentes de esa UF a la cochera recien creada.
INSERT INTO cocheras (uf_id, numero_cochera)
SELECT id, numero_cochera FROM unidades_funcionales
WHERE numero_cochera IS NOT NULL AND numero_cochera <> '';

UPDATE cargadores c
SET cochera_id = coc.id
FROM cocheras coc
WHERE c.uf_id = coc.uf_id AND c.cochera_id IS NULL;
