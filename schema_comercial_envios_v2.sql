-- Rampa programable por corrida: NULL = usa el default global (compatibilidad
-- con corridas creadas antes de este cambio).
ALTER TABLE comercial_campania_envios ADD COLUMN IF NOT EXISTS ramp_schedule INTEGER[];

-- Baja automatica por rebote/queja/desuscripcion: en vez de borrar la fila de
-- comercial_contactos (que se llevaria en cascada su historial de CRM -
-- seguimientos, visitas, presupuestos, cotizaciones), se marca no_contactar
-- con un motivo visible, y se deja un registro de auditoria aparte.
ALTER TABLE comercial_contactos ADD COLUMN IF NOT EXISTS motivo_baja TEXT;

CREATE TABLE IF NOT EXISTS comercial_contactos_bajas_automaticas (
  id SERIAL PRIMARY KEY,
  contacto_id INTEGER REFERENCES comercial_contactos(id) ON DELETE SET NULL,
  envio_id INTEGER REFERENCES comercial_campania_envios(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  motivo TEXT NOT NULL,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
