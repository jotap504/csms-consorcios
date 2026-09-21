-- Caracteristicas tecnicas del producto wallbox (potencia, fases, conector,
-- montaje) y vinculo cargador <-> stock_item, para forzar que un cargador
-- solo pueda darse de alta a partir de una unidad ya cargada en stock.

ALTER TABLE productos_catalogo ADD COLUMN IF NOT EXISTS potencia_kw NUMERIC(6,2);
ALTER TABLE productos_catalogo ADD COLUMN IF NOT EXISTS fases VARCHAR(20) CHECK (fases IN ('monofasico', 'trifasico'));
ALTER TABLE productos_catalogo ADD COLUMN IF NOT EXISTS conector VARCHAR(20) CHECK (conector IN ('type2', 'nacs'));
ALTER TABLE productos_catalogo ADD COLUMN IF NOT EXISTS montaje VARCHAR(20) CHECK (montaje IN ('pared', 'pie'));

ALTER TABLE cargadores ADD COLUMN IF NOT EXISTS stock_item_id INTEGER REFERENCES stock_items(id) ON DELETE SET NULL;
