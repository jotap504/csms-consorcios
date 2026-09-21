-- Catalogo de plantillas de abono que gestiona el superadmin (valores
-- predeterminados). Al configurar un edificio se clona lo que corresponda a
-- abono_items de ese consorcio, donde queda editable a mano sin afectar el
-- catalogo ni otros edificios.
CREATE TABLE IF NOT EXISTS abono_items_catalogo (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(150) NOT NULL,
  tipo VARCHAR(30) NOT NULL CHECK (tipo IN ('fijo_por_edificio', 'fijo_por_cochera', 'prorrateado_activos', 'unico')),
  monto_sugerido NUMERIC(12,2) NOT NULL,
  -- NULL = aplica a ambos tipos de cliente (se ofrece siempre al clonar)
  tipo_cliente VARCHAR(20) CHECK (tipo_cliente IN ('residencial', 'comercial')),
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- De que plantilla salio cada abono_item de un edificio (NULL = se creo a
-- mano, sin plantilla). Solo trazabilidad, no se usa para validar nada.
ALTER TABLE abono_items ADD COLUMN IF NOT EXISTS catalogo_id INTEGER REFERENCES abono_items_catalogo(id) ON DELETE SET NULL;
