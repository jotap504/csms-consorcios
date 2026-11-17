-- Como interpreta el wallbox el limite que le manda el balanceador
-- (ChargePointMaxProfile en connectorId 0):
--   'equipo'       - estandar OCPP: el limite es para el equipo entero; si
--                    tiene varios conectores, el propio equipo lo reparte.
--   'por_conector' - el equipo aplica el MISMO limite a cada conector (visto
--                    en YC-44KW, firmware WiFi_FC4X: con 10 A y dos autos
--                    consume 20 A). El balanceador cuenta cada auto activo
--                    como un cupo y le manda el monto por conector.
ALTER TABLE cargadores ADD COLUMN IF NOT EXISTS modo_limite VARCHAR(12) NOT NULL DEFAULT 'equipo'
  CHECK (modo_limite IN ('equipo', 'por_conector'));
