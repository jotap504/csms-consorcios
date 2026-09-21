-- Suma protocolo OCPP soportado y tipo de corriente (AC/DC) a las
-- caracteristicas del producto wallbox (ver schema_wallbox_caracteristicas.sql).

ALTER TABLE productos_catalogo ADD COLUMN IF NOT EXISTS ocpp_protocolo VARCHAR(10) CHECK (ocpp_protocolo IN ('1.6', '2.0.1', 'ambos'));
ALTER TABLE productos_catalogo ADD COLUMN IF NOT EXISTS tipo_corriente VARCHAR(5) CHECK (tipo_corriente IN ('AC', 'DC'));
