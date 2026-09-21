-- Modulo Comercial / CRM de ventas. Ver marketing/preguntas_modulo_ventas.md
-- para el analisis y las decisiones de producto detras de este modelo.

ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_rol_check
  CHECK (rol IN ('superadmin', 'consorcio_admin', 'residente', 'instalador', 'proveedor', 'comercial'));

CREATE TABLE IF NOT EXISTS comercial_contactos (
  id SERIAL PRIMARY KEY,
  codigo VARCHAR(20) UNIQUE,
  apellido VARCHAR(120) NOT NULL,
  nombre VARCHAR(120) NOT NULL,
  tipo_contacto VARCHAR(40) NOT NULL DEFAULT 'Otros'
    CHECK (tipo_contacto IN ('Socio/a', 'Egresado', 'Administrador', 'Consorcista', 'Proveedor', 'Otros')),
  email VARCHAR(200),
  administracion_empresa VARCHAR(200),
  cuit VARCHAR(20),
  telefono VARCHAR(40),
  zona VARCHAR(80),
  origen VARCHAR(80),
  interes_principal VARCHAR(200),
  estado_comercial VARCHAR(30) NOT NULL DEFAULT 'Nuevo'
    CHECK (estado_comercial IN (
      'Nuevo', 'Contactado', 'Interesado', 'Reunion agendada', 'Relevamiento tecnico',
      'Presupuesto enviado', 'Negociacion', 'Ganado', 'Perdido', 'Pausado'
    )),
  prioridad VARCHAR(10) NOT NULL DEFAULT 'Media' CHECK (prioridad IN ('Alta', 'Media', 'Baja')),
  responsable_usuario_id INT REFERENCES usuarios(id) ON DELETE SET NULL,
  responsable_nombre VARCHAR(120),
  fecha_alta DATE NOT NULL DEFAULT CURRENT_DATE,
  ultimo_contacto DATE,
  proxima_accion TEXT,
  fecha_proxima_accion DATE,
  consentimiento_comercial VARCHAR(10) NOT NULL DEFAULT 'Pendiente'
    CHECK (consentimiento_comercial IN ('Pendiente', 'Si', 'No')),
  no_contactar BOOLEAN NOT NULL DEFAULT FALSE,
  observaciones TEXT,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_comercial_contactos_estado ON comercial_contactos(estado_comercial);
CREATE INDEX IF NOT EXISTS idx_comercial_contactos_fecha_proxima ON comercial_contactos(fecha_proxima_accion);

CREATE TABLE IF NOT EXISTS comercial_seguimientos (
  id SERIAL PRIMARY KEY,
  contacto_id INT NOT NULL REFERENCES comercial_contactos(id) ON DELETE CASCADE,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  canal VARCHAR(30) NOT NULL DEFAULT 'Otro'
    CHECK (canal IN ('Email', 'WhatsApp', 'Llamada', 'Reunion', 'Otro')),
  tipo_actividad VARCHAR(120),
  resultado_resumen TEXT,
  mail_completo TEXT,
  estado_comercial_despues VARCHAR(30),
  proxima_accion TEXT,
  fecha_proxima_accion DATE,
  responsable_usuario_id INT REFERENCES usuarios(id) ON DELETE SET NULL,
  responsable_nombre VARCHAR(120),
  notas TEXT,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_comercial_seguimientos_contacto ON comercial_seguimientos(contacto_id, fecha DESC);

CREATE TABLE IF NOT EXISTS comercial_visitas (
  id SERIAL PRIMARY KEY,
  contacto_id INT NOT NULL REFERENCES comercial_contactos(id) ON DELETE CASCADE,
  fecha_hora TIMESTAMPTZ NOT NULL,
  direccion TEXT,
  responsable_usuario_id INT REFERENCES usuarios(id) ON DELETE SET NULL,
  responsable_nombre VARCHAR(120),
  estado VARCHAR(20) NOT NULL DEFAULT 'agendada' CHECK (estado IN ('agendada', 'realizada', 'cancelada')),
  google_event_id VARCHAR(200),
  notas TEXT,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_comercial_visitas_fecha ON comercial_visitas(fecha_hora);

CREATE TABLE IF NOT EXISTS comercial_catalogo_items (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(200) NOT NULL,
  unidad VARCHAR(30) NOT NULL DEFAULT 'unidad',
  precio_unitario NUMERIC(12, 2) NOT NULL DEFAULT 0,
  categoria VARCHAR(80),
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS comercial_presupuestos (
  id SERIAL PRIMARY KEY,
  contacto_id INT NOT NULL REFERENCES comercial_contactos(id) ON DELETE CASCADE,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  validez_hasta DATE,
  estado VARCHAR(20) NOT NULL DEFAULT 'borrador'
    CHECK (estado IN ('borrador', 'enviado', 'aprobado', 'rechazado', 'vencido')),
  moneda VARCHAR(10) NOT NULL DEFAULT 'ARS',
  opciones JSONB NOT NULL DEFAULT '[]',
  clausulas TEXT,
  responsable_usuario_id INT REFERENCES usuarios(id) ON DELETE SET NULL,
  responsable_nombre VARCHAR(120),
  pdf_url TEXT,
  enviado_en TIMESTAMPTZ,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_comercial_presupuestos_contacto ON comercial_presupuestos(contacto_id);

CREATE TABLE IF NOT EXISTS comercial_relevamientos (
  id SERIAL PRIMARY KEY,
  contacto_id INT NOT NULL REFERENCES comercial_contactos(id) ON DELETE CASCADE,
  visita_id INT REFERENCES comercial_visitas(id) ON DELETE SET NULL,
  edificio_nombre TEXT,
  direccion TEXT,
  uf_count INT,
  cocheras_count INT,
  tableros JSONB NOT NULL DEFAULT '[]',
  tarifa_categoria VARCHAR(10),
  potencia_contratada NUMERIC(10, 2),
  demanda_maxima NUMERIC(10, 2),
  fecha_demanda_maxima DATE,
  generador JSONB,
  cargadores_existentes JSONB NOT NULL DEFAULT '[]',
  fotos JSONB NOT NULL DEFAULT '[]',
  documentos JSONB NOT NULL DEFAULT '[]',
  realizado_por VARCHAR(120),
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  estado VARCHAR(20) NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador', 'revisado')),
  notas TEXT,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS comercial_informes (
  id SERIAL PRIMARY KEY,
  relevamiento_id INT NOT NULL REFERENCES comercial_relevamientos(id) ON DELETE CASCADE,
  version INT NOT NULL DEFAULT 1,
  contenido JSONB NOT NULL DEFAULT '{}',
  pdf_url TEXT,
  estado VARCHAR(20) NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador', 'firmado')),
  firmado_por VARCHAR(120),
  firmado_matricula VARCHAR(60),
  firma_datos TEXT,
  fecha_firma TIMESTAMPTZ,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
