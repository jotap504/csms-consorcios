-- Nivel 2 del analisis GRASEN (analisis-plataforma-grasen.md seccion 5):
-- Reservations, RFID con saldo prepago, alarmas historicas. Timed Charging
-- no necesita schema propio (usa el mecanismo nativo de ChargingSchedule
-- con 2 periodos, sin tabla nueva - ver listener/index.js).

-- Reservations (ReserveNow/CancelReservation) - solo cargadores OCPP 2.0.1,
-- CitrineOS no expone reserveNow/cancelReservation por REST para 1.6
-- (confirmado via /docs/json, el bridge 1.6 solo tiene remoteStart/Stop/
-- unlockConnector/clearCache).
CREATE TABLE IF NOT EXISTS reservas (
  id SERIAL PRIMARY KEY,
  cargador_ocpp_id VARCHAR(50) NOT NULL,
  consorcio_id INT NOT NULL REFERENCES consorcios(id) ON DELETE CASCADE,
  uf_id INT REFERENCES unidades_funcionales(id) ON DELETE CASCADE,
  id_tag_ocpp VARCHAR(50) NOT NULL,
  expira_en TIMESTAMPTZ NOT NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa', 'cancelada', 'consumida', 'rechazada')),
  creado_por VARCHAR(20) NOT NULL CHECK (creado_por IN ('admin', 'residente')),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reservas_cargador_activa ON reservas (cargador_ocpp_id, estado);

-- RFID con saldo prepago - opt-in por consorcio, no afecta consorcios
-- existentes que ya facturan por expensas via costo_kwh_electricidad.
ALTER TABLE consorcios ADD COLUMN IF NOT EXISTS usar_saldo_prepago BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE tarjetas_rfid ADD COLUMN IF NOT EXISTS saldo NUMERIC(10,2) NOT NULL DEFAULT 0;

-- Que tarjeta puntual se uso en cada sesion (una UF puede tener mas de una
-- tarjeta) - necesario para saber a que saldo descontarle al cerrar sesion.
ALTER TABLE liquidacion_sesiones ADD COLUMN IF NOT EXISTS tarjeta_id INT REFERENCES tarjetas_rfid(id);

CREATE TABLE IF NOT EXISTS tarjeta_movimientos (
  id SERIAL PRIMARY KEY,
  tarjeta_id INT NOT NULL REFERENCES tarjetas_rfid(id) ON DELETE CASCADE,
  tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('recarga', 'consumo', 'ajuste')),
  monto NUMERIC(10,2) NOT NULL,
  liquidacion_sesion_id INT REFERENCES liquidacion_sesiones(id),
  comprobante_ref VARCHAR(100),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tarjeta_movimientos_tarjeta ON tarjeta_movimientos (tarjeta_id, creado_en DESC);

-- Alarmas historicas - solo status='Faulted' (alarma real), no cada
-- transicion Available/Occupied/Charging (eso ya lo cubre en vivo
-- cargador_estado_actual, guardar todo aca seria puro ruido).
CREATE TABLE IF NOT EXISTS cargador_alarmas (
  id SERIAL PRIMARY KEY,
  cargador_ocpp_id VARCHAR(50) NOT NULL,
  status_ocpp VARCHAR(50) NOT NULL,
  error_code VARCHAR(50),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cargador_alarmas_cargador ON cargador_alarmas (cargador_ocpp_id, creado_en DESC);
