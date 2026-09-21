-- Stock/inventario de productos (wallbox, medidores, routers, consumibles) -
-- catalogo global (no por edificio), consumido al hacer una instalacion real
-- en un consorcio. Ver schema_facturacion_bilon.sql para como se conecta con
-- cargos_puntuales/facturas_bilon despues.

CREATE TABLE IF NOT EXISTS productos_catalogo (
  id SERIAL PRIMARY KEY,
  categoria VARCHAR(30) NOT NULL CHECK (categoria IN ('wallbox', 'medidor', 'router', 'otro')),
  marca VARCHAR(100),
  modelo VARCHAR(100) NOT NULL,
  descripcion TEXT,
  -- true: wallbox/medidor/router - se ingresan y trazan unidad por unidad
  -- (stock_items). false: consumibles (cables, conectores) - solo cantidad
  -- (stock_movimientos), sin identificador individual.
  serializado BOOLEAN NOT NULL DEFAULT TRUE,
  unidad VARCHAR(20) NOT NULL DEFAULT 'unidad',
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Una fila por unidad fisica individual de un producto serializado.
CREATE TABLE IF NOT EXISTS stock_items (
  id SERIAL PRIMARY KEY,
  producto_id INTEGER NOT NULL REFERENCES productos_catalogo(id) ON DELETE RESTRICT,
  identificador VARCHAR(150) NOT NULL UNIQUE, -- numero de serie / ID del fabricante
  estado VARCHAR(20) NOT NULL DEFAULT 'en_stock' CHECK (estado IN ('en_stock', 'instalado', 'devuelto', 'baja')),
  costo_compra NUMERIC(12,2),
  consorcio_id INTEGER REFERENCES consorcios(id) ON DELETE SET NULL, -- seteado al instalar
  instalacion_id INTEGER, -- FK agregada abajo, luego de crear la tabla instalaciones
  ingresado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ingresos/egresos de cantidad de productos NO serializados (consumibles).
CREATE TABLE IF NOT EXISTS stock_movimientos (
  id SERIAL PRIMARY KEY,
  producto_id INTEGER NOT NULL REFERENCES productos_catalogo(id) ON DELETE RESTRICT,
  tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('ingreso', 'egreso_instalacion', 'ajuste', 'devolucion')),
  cantidad NUMERIC(12,2) NOT NULL, -- siempre positiva, el signo lo da "tipo"
  costo_unitario NUMERIC(12,2),
  instalacion_id INTEGER, -- FK agregada abajo
  creado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  nota TEXT,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Una instalacion real en un edificio: agrupa todo el material que se uso.
CREATE TABLE IF NOT EXISTS instalaciones (
  id SERIAL PRIMARY KEY,
  consorcio_id INTEGER NOT NULL REFERENCES consorcios(id) ON DELETE CASCADE,
  uf_id INTEGER REFERENCES unidades_funcionales(id) ON DELETE SET NULL,
  cargador_id INTEGER REFERENCES cargadores(id) ON DELETE SET NULL, -- el wallbox ya registrado en OCPP, si aplica
  instalador_usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  notas TEXT,
  facturada BOOLEAN NOT NULL DEFAULT FALSE, -- true una vez que se genero el cargo puntual asociado
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE stock_items ADD CONSTRAINT fk_stock_items_instalacion
  FOREIGN KEY (instalacion_id) REFERENCES instalaciones(id) ON DELETE SET NULL;
ALTER TABLE stock_movimientos ADD CONSTRAINT fk_stock_movimientos_instalacion
  FOREIGN KEY (instalacion_id) REFERENCES instalaciones(id) ON DELETE SET NULL;

-- Detalle de que se uso en cada instalacion (snapshot de costo al momento).
CREATE TABLE IF NOT EXISTS instalacion_items (
  id SERIAL PRIMARY KEY,
  instalacion_id INTEGER NOT NULL REFERENCES instalaciones(id) ON DELETE CASCADE,
  producto_id INTEGER NOT NULL REFERENCES productos_catalogo(id) ON DELETE RESTRICT,
  stock_item_id INTEGER REFERENCES stock_items(id) ON DELETE SET NULL, -- si es serializado
  cantidad NUMERIC(12,2) NOT NULL DEFAULT 1, -- si no es serializado
  costo_unitario NUMERIC(12,2),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_items_producto_estado ON stock_items (producto_id, estado);
CREATE INDEX IF NOT EXISTS idx_instalaciones_consorcio ON instalaciones (consorcio_id);
