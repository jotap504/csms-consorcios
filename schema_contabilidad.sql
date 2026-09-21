-- Contabilidad interna de Bilon (plata propia del negocio, separada de la
-- facturacion por edificio). Modelo simple base-caja, no partida doble
-- formal: pensado para que el superadmin sepa cuanta plata tiene, que gasto,
-- que le deben (facturas_bilon pendientes) y que debe (gastos pendientes).

CREATE TABLE IF NOT EXISTS cuentas_bancarias (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('efectivo', 'banco')),
  banco VARCHAR(100),
  numero_cuenta VARCHAR(100),
  cbu_alias VARCHAR(100),
  saldo_inicial NUMERIC(14,2) NOT NULL DEFAULT 0,
  fecha_saldo_inicial DATE NOT NULL DEFAULT CURRENT_DATE,
  activa BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS categorias_gasto (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL UNIQUE,
  activa BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO categorias_gasto (nombre) VALUES
  ('Sueldos'), ('Alquiler'), ('Impuestos'), ('Servicios'),
  ('Insumos y materiales'), ('Mantenimiento'), ('Marketing'), ('Otros')
ON CONFLICT (nombre) DO NOTHING;

-- Un gasto es un pasivo (lo que se debe) hasta que se paga - al pagarse
-- genera un movimiento de egreso en la cuenta elegida.
CREATE TABLE IF NOT EXISTS gastos (
  id SERIAL PRIMARY KEY,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  proveedor_nombre VARCHAR(150),
  categoria_id INTEGER REFERENCES categorias_gasto(id) ON DELETE SET NULL,
  monto NUMERIC(14,2) NOT NULL CHECK (monto > 0),
  estado VARCHAR(20) NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'pagado', 'anulado')),
  cuenta_bancaria_id INTEGER REFERENCES cuentas_bancarias(id) ON DELETE SET NULL,
  fecha_pago DATE,
  nota TEXT,
  creado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gastos_estado ON gastos (estado);
CREATE INDEX IF NOT EXISTS idx_gastos_fecha ON gastos (fecha);

-- El libro de caja/banco real: cada peso que entra o sale. gasto_id y
-- factura_bilon_id son el rastro de origen cuando el movimiento vino de
-- pagar un gasto o cobrar una factura (movimientos manuales dejan ambos null).
CREATE TABLE IF NOT EXISTS movimientos_caja (
  id SERIAL PRIMARY KEY,
  cuenta_bancaria_id INTEGER NOT NULL REFERENCES cuentas_bancarias(id) ON DELETE RESTRICT,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('ingreso', 'egreso')),
  monto NUMERIC(14,2) NOT NULL CHECK (monto > 0),
  concepto VARCHAR(200) NOT NULL,
  gasto_id INTEGER REFERENCES gastos(id) ON DELETE SET NULL,
  factura_bilon_id INTEGER REFERENCES facturas_bilon(id) ON DELETE SET NULL,
  creado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_movimientos_caja_cuenta ON movimientos_caja (cuenta_bancaria_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_caja_fecha ON movimientos_caja (fecha);
