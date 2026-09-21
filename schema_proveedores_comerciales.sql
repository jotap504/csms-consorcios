-- Proveedores REALES (empresas a las que Bilon les compra material) - no
-- confundir con la tabla "proveedores" de schema_proveedores.sql, que son
-- fabricantes de wallbox probando su equipo (ahora "Fabricas" en la UI).

CREATE TABLE IF NOT EXISTS proveedores_comerciales (
  id SERIAL PRIMARY KEY,
  nombre_empresa VARCHAR(150) NOT NULL,
  cuit VARCHAR(20),
  contacto_nombre VARCHAR(100),
  contacto_email VARCHAR(150),
  contacto_telefono VARCHAR(50),
  direccion VARCHAR(200),
  nota TEXT,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- El historial de compras de un proveedor se lee directo de stock_items /
-- stock_movimientos (cada ingreso de stock ES una compra) - no se duplica
-- en una tabla aparte.
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS proveedor_id INTEGER REFERENCES proveedores_comerciales(id) ON DELETE SET NULL;
ALTER TABLE stock_movimientos ADD COLUMN IF NOT EXISTS proveedor_id INTEGER REFERENCES proveedores_comerciales(id) ON DELETE SET NULL;
