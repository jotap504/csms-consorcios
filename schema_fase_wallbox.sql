-- Balanceo de carga por fase (ver plan "Balanceo de carga por fase"). Un
-- wallbox monofasico esta cableado a UNA sola fase del tablero trifasico -
-- sin este dato el balanceador no puede distinguir cargadores en fases
-- distintas y usa un techo conservador compartido por todos (ver
-- listener/index.js rebalanceGroup).
--
-- Nullable a proposito: NULL = trifasico (no aplica) O monofasico sin
-- clasificar todavia - ambos casos deben caer en el bucket conservador,
-- nunca asumir una fase que no fue asignada explicitamente por el instalador.
ALTER TABLE cargadores ADD COLUMN IF NOT EXISTS fase VARCHAR(2) CHECK (fase IN ('L1','L2','L3'));
