-- RBAC real: permisos editables sobre los 6 roles fijos (ver plan
-- "RBAC real: permisos editables sobre los 6 roles fijos"). Los roles NO
-- cambian (siguen siendo el CHECK constraint de usuarios.rol) - lo que se
-- vuelve editable es que puede hacer cada rol, via la pantalla Permission.
--
-- El seed de rol_permisos calca EXACTAMENTE el comportamiento hardcodeado
-- actual de requireRole(...) en cada router - esto es una migracion sin
-- cambio de conducta el dia 1. Comportamiento solo diverge cuando un
-- superadmin edite algo desde la UI. superadmin no necesita filas (tiene
-- bypass estructural en requirePermission, nunca consulta esta tabla) pero
-- se insertan igual para que la pantalla Permission lo muestre marcado.

CREATE TABLE IF NOT EXISTS permisos (
  id SERIAL PRIMARY KEY,
  clave VARCHAR(50) UNIQUE NOT NULL,
  descripcion VARCHAR(200) NOT NULL
);

CREATE TABLE IF NOT EXISTS rol_permisos (
  rol VARCHAR(20) NOT NULL CHECK (rol IN ('superadmin','instalador','comercial','consorcio_admin','proveedor','residente')),
  permiso_id INT NOT NULL REFERENCES permisos(id) ON DELETE CASCADE,
  PRIMARY KEY (rol, permiso_id)
);

INSERT INTO permisos (clave, descripcion) VALUES
  ('admin_operaciones', 'Gestion diaria de consorcios: cargadores, unidades, tarjetas, sectores, medidores, vehiculos, facturas'),
  ('admin_cargadores_avanzado', 'Configuration OCPP, OCPP Log, alarmas y reservas por cargador'),
  ('admin_sistema_usuarios', 'Alta, edicion y roles de usuarios del sistema (superadmin/instalador/comercial)'),
  ('admin_firmware_ota', 'Firmware update y diagnostico remoto de cargadores'),
  ('admin_facturacion_catalogo', 'Catalogo de abonos y ajustes masivos de facturacion'),
  ('admin_catalogo_productos_stock', 'Alta y edicion de productos de catalogo y stock'),
  ('admin_proveedores_fabricas', 'Alta y edicion de proveedores/fabricas'),
  ('superadmin_panel', 'Panel superadmin: consorcios, planes, resumen en vivo, alarmas globales, ubicaciones'),
  ('admin_contabilidad', 'Modulo de contabilidad: caja, gastos, cuentas, resultado'),
  ('comercial', 'CRM comercial: contactos, campanias, presupuestos, informes'),
  ('consorcio_admin_panel', 'Panel propio del administrador de consorcio'),
  ('proveedor_panel', 'Panel propio de fabrica/proveedor'),
  ('residente_panel', 'Panel propio del residente: su cargador, reservas, tarjeta')
ON CONFLICT (clave) DO NOTHING;

INSERT INTO rol_permisos (rol, permiso_id)
SELECT 'instalador', id FROM permisos WHERE clave = 'admin_operaciones'
UNION ALL SELECT 'comercial', id FROM permisos WHERE clave = 'comercial'
UNION ALL SELECT 'consorcio_admin', id FROM permisos WHERE clave = 'consorcio_admin_panel'
UNION ALL SELECT 'proveedor', id FROM permisos WHERE clave = 'proveedor_panel'
UNION ALL SELECT 'residente', id FROM permisos WHERE clave = 'residente_panel'
UNION ALL SELECT 'superadmin', id FROM permisos
ON CONFLICT (rol, permiso_id) DO NOTHING;
