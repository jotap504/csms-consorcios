-- Cotizador de infraestructura EV: reemplaza el flujo de "Presupuestos" simple
-- para cotizar contactos. Estructura jerarquica edificio -> pisos -> troncales
-- -> cocheras (cada piso puede tener distinta cantidad de troncales, cada
-- troncal distinta cantidad de cocheras - nunca uniforme). Sigue el mismo
-- patron que el resto del modulo comercial: una fila con columnas JSONB
-- separadas por paso del wizard, cargada completa y guardada con PUT parcial
-- (ver comercial_relevamientos: tableros/generador/cargadores_existentes).
-- Ver marketing/cotizador.md para la especificacion completa.

CREATE TABLE IF NOT EXISTS comercial_cotizaciones (
  id SERIAL PRIMARY KEY,
  contacto_id INT NOT NULL REFERENCES comercial_contactos(id) ON DELETE CASCADE,
  codigo VARCHAR(20) UNIQUE,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  validez_hasta DATE,
  estado VARCHAR(20) NOT NULL DEFAULT 'borrador'
    CHECK (estado IN ('borrador', 'enviado', 'aprobado', 'rechazado', 'vencido')),
  moneda VARCHAR(10) NOT NULL DEFAULT 'ARS',

  -- Paso 1: { nombre, direccion, cantidad_ufs, cantidad_cocheras_total, tipo_uso, observaciones }
  edificio JSONB NOT NULL DEFAULT '{}',

  -- Pasos 2-6: [{ id, nombre, orden, troncales: [{
  --   id, nombre,
  --   cocheras: [{ id, numero, wallbox_inicial, distancia_individual_m }],
  --   distancia_tablero_a_inicio_m, longitud_troncal_m, longitud_ramal_promedio_m,
  --   potencia_nominal_wallbox_kw, tipo_alimentacion ('mono'|'tri'),
  --   factor_simultaneidad, metodo_instalacion, temperatura_ambiente_c,
  --   material_conductor, tension_v, agrupamiento_circuitos,
  --   calculo: { corriente_diseno_a, seccion_mm2, calibre_termica_a, caida_tension_pct,
  --              caida_tension_ok, capacidad_conduccion_a, factor_correccion_total,
  --              tabla_ref, advertencias: [], calculado_en } | null
  -- }] }]
  pisos JSONB NOT NULL DEFAULT '[]',

  -- Paso 7: { tablero_principal, medidor, gateway_modbus, router,
  --           switches: [{ id, ubicacion, piso_id, puertos, circuito_220v }] }
  infraestructura JSONB NOT NULL DEFAULT '{}',

  -- Etapa 2 (paso 8): [{ id, cochera_id, piso_id, troncal_id, modelo, potencia_kw,
  --   longitud_cable_m, caja_termica, termica, diferencial, ocpp_config,
  --   csms_registrado, items_generados: [...] }]
  wallboxes JSONB NOT NULL DEFAULT '[]',

  -- Pasos 9-10: [{ categoria, catalogo_item_id, descripcion, unidad, cantidad,
  --   precio_unitario, costo, subtotal, pendiente_precio }]
  -- categorias: Infraestructura electrica / Tableros y protecciones / Cableado y
  -- canalizaciones / Red Ethernet / Comunicaciones / Medicion / Ingenieria /
  -- Mano de obra / Puesta en marcha / Wallboxes iniciales / Margen BilOn / IVA / Total
  bom JSONB NOT NULL DEFAULT '[]',

  margen_pct NUMERIC(5, 2),
  iva_pct NUMERIC(5, 2) NOT NULL DEFAULT 21,

  clausulas TEXT,
  responsable_usuario_id INT REFERENCES usuarios(id) ON DELETE SET NULL,
  responsable_nombre VARCHAR(120),
  enviado_en TIMESTAMPTZ,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comercial_cotizaciones_contacto ON comercial_cotizaciones(contacto_id);

-- Gancho minimo para margenes futuros (sin importador/proveedores todavia -
-- eso queda diferido, ver marketing/cotizador.md seccion 28 y siguientes).
ALTER TABLE comercial_catalogo_items ADD COLUMN IF NOT EXISTS costo NUMERIC(12, 2);
ALTER TABLE comercial_catalogo_items ADD COLUMN IF NOT EXISTS proveedor VARCHAR(120);
