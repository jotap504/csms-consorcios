-- Facturacion propia de Bilon (canon, mantenimiento, backup 4g, etc), separada
-- por completo de liquidacion_sesiones (que es electricidad interna del
-- edificio - Bilon nunca la factura, solo genera el reporte para que el
-- administrador la impute en sus propias expensas).

ALTER TABLE consorcios ADD COLUMN IF NOT EXISTS modo_facturacion VARCHAR(20) NOT NULL DEFAULT 'administrador'
  CHECK (modo_facturacion IN ('administrador', 'propietario_directo'));

-- Clasificacion del cliente, no cambia la mecanica de facturacion (ambos usan
-- modo_facturacion='administrador': una sola factura consolidada) - solo
-- distingue el segmento para reportes/filtros, y guia que items sugerir al
-- armar el plan (comercial = abono basico + canon por wallbox, sin los items
-- tipicos de consorcio residencial como mantenimiento de partes comunes).
ALTER TABLE consorcios ADD COLUMN IF NOT EXISTS tipo_cliente VARCHAR(20) NOT NULL DEFAULT 'residencial'
  CHECK (tipo_cliente IN ('residencial', 'comercial'));

-- Conceptos facturables configurados por edificio (precio pactado por
-- contrato, no hay price-list global). "activo=false" en vez de borrar para
-- no perder el historico de que precio regia cuando se genero cada factura
-- pasada (facturas_bilon.detalle guarda su propio snapshot igual).
CREATE TABLE IF NOT EXISTS abono_items (
  id SERIAL PRIMARY KEY,
  consorcio_id INTEGER NOT NULL REFERENCES consorcios(id) ON DELETE CASCADE,
  nombre VARCHAR(150) NOT NULL,
  tipo VARCHAR(30) NOT NULL CHECK (tipo IN ('fijo_por_edificio', 'fijo_por_cochera', 'prorrateado_activos', 'unico')),
  monto NUMERIC(12,2) NOT NULL,
  recurrente BOOLEAN NOT NULL DEFAULT TRUE,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Cargos ad-hoc (visita tecnica, reparacion puntual) - uf_id null significa
-- que el destinatario es el administrador/consorcio en vez de un propietario.
CREATE TABLE IF NOT EXISTS cargos_puntuales (
  id SERIAL PRIMARY KEY,
  consorcio_id INTEGER NOT NULL REFERENCES consorcios(id) ON DELETE CASCADE,
  uf_id INTEGER REFERENCES unidades_funcionales(id) ON DELETE SET NULL,
  descripcion VARCHAR(255) NOT NULL,
  monto NUMERIC(12,2) NOT NULL,
  periodo VARCHAR(7) NOT NULL,
  creado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Una factura por destinatario por periodo. uf_id null = va al
-- administrador/consorcio (modo 'administrador', o items compartidos en modo
-- 'propietario_directo' como el backup 4g no prorrateado). "detalle" es un
-- snapshot JSON de los conceptos/montos al momento de generar, para que una
-- factura ya emitida no cambie si despues se edita el precio de un abono_item.
CREATE TABLE IF NOT EXISTS facturas_bilon (
  id SERIAL PRIMARY KEY,
  consorcio_id INTEGER NOT NULL REFERENCES consorcios(id) ON DELETE CASCADE,
  uf_id INTEGER REFERENCES unidades_funcionales(id) ON DELETE CASCADE,
  periodo VARCHAR(7) NOT NULL,
  detalle JSONB NOT NULL,
  monto_total NUMERIC(12,2) NOT NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'pagada', 'anulada')),
  generada_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  pagada_en TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_facturas_bilon_destinatario_periodo
  ON facturas_bilon (consorcio_id, COALESCE(uf_id, 0), periodo);
