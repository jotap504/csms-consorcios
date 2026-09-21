require('dotenv').config();
const ModbusRTU = require('modbus-serial');

// Suplanta un medidor Acrel (ADL400/ADW300) + gateway RS485->TCP: expone un
// servidor Modbus-TCP en esta Pi con el MISMO mapa de registros que ya lee
// listener/modbus-poller.js contra el hardware real. Asi se puede probar el
// pipeline completo (poller -> lecturas_sector/lecturas_consorcio ->
// dashboards) antes de tener el ADL400 fisico. El medidor real NO usa MQTT -
// es Modbus-RTU nativo detras de un conversor RS485->TCP generico (ver
// comentario en modbus-poller.js), por eso este simulador habla el mismo
// protocolo en vez de MQTT.
//
// Si se toca el mapa de registros aca, tocar tambien
// listener/modbus-poller.js (son dos copias independientes, sin modulo
// compartido entre el server y esta Pi).
const REGISTER_MAPS = {
  ADW300: {
    ampsStart: 26, ampsCount: 3, ampsScale: 100, powerStart: 36, powerScale: 1000,
  },
  ADL400: {
    ampsStart: 100, ampsCount: 3, ampsScale: 100, powerStart: 362, powerScale: 1000,
  },
};

const HOST = process.env.MODBUS_SIM_HOST || '0.0.0.0';
const PORT = Number(process.env.MODBUS_SIM_PORT || 5020);
const UNIT_ID = Number(process.env.MODBUS_SIM_UNIT_ID || 1);
const MODEL = (process.env.MODBUS_SIM_MODEL || 'ADL400').toUpperCase();
const AMPS_MIN = Number(process.env.MODBUS_SIM_AMPS_MIN || 8);
const AMPS_MAX = Number(process.env.MODBUS_SIM_AMPS_MAX || 45);
const WALK_STEP = Number(process.env.MODBUS_SIM_AMPS_STEP || 1.5);
const WALK_INTERVAL_MS = Number(process.env.MODBUS_SIM_WALK_INTERVAL_MS || 2000);
// Mismo criterio simplificado que ya usa el resto del proyecto (backend
// asume 220V monofasico por fase para estimar kW cuando no hay tension real
// medida - ver comentarios en admin.js/residente.js).
const ASSUMED_VOLTS = 220;

const map = REGISTER_MAPS[MODEL];
if (!map) {
  throw new Error(`MODBUS_SIM_MODEL invalido: ${MODEL}. Usar ADL400 o ADW300.`);
}

let ampsL = [20, 18, 22]; // arranca en un rango creible, no en cero

function randomWalk(value, min, max, maxStep) {
  const next = value + (Math.random() * 2 - 1) * maxStep;
  return Math.min(max, Math.max(min, next));
}

setInterval(() => {
  ampsL = ampsL.map((a) => randomWalk(a, AMPS_MIN, AMPS_MAX, WALK_STEP));
}, WALK_INTERVAL_MS);

function currentRegisters() {
  return ampsL.map((a) => Math.max(0, Math.round(a * map.ampsScale)));
}

function powerRegistersSigned32() {
  const totalKw = ((ampsL[0] + ampsL[1] + ampsL[2]) * ASSUMED_VOLTS) / 1000;
  const raw = Math.round(totalKw * map.powerScale);
  const unsigned = raw < 0 ? raw + 0x100000000 : raw;
  return [(unsigned >>> 16) & 0xffff, unsigned & 0xffff];
}

const vector = {
  getHoldingRegister: (addr, unitID, callback) => {
    if (unitID !== UNIT_ID) {
      callback(new Error(`Unit ID no soportado (esperado ${UNIT_ID}, pedido ${unitID})`));
      return;
    }
    if (addr >= map.ampsStart && addr < map.ampsStart + map.ampsCount) {
      callback(null, currentRegisters()[addr - map.ampsStart]);
      return;
    }
    if (addr >= map.powerStart && addr < map.powerStart + 2) {
      callback(null, powerRegistersSigned32()[addr - map.powerStart]);
      return;
    }
    // Cualquier otro registro que el poller no consulta hoy: 0 en vez de
    // error, para no romper si mas adelante se agregan mas campos al mapa.
    callback(null, 0);
  },
};

// eslint-disable-next-line no-new
new ModbusRTU.ServerTCP(vector, {
  host: HOST,
  port: PORT,
  unitID: UNIT_ID,
  debug: process.env.MODBUS_SIM_DEBUG === 'true',
});

console.log(`[Modbus-sim] ${MODEL} simulado escuchando en ${HOST}:${PORT} (unit ${UNIT_ID}).`);
console.log(`[Modbus-sim] Registrar en medidores_modbus con host=<ip de esta Pi>, puerto=${PORT}, unit_id=${UNIT_ID}, modelo=${MODEL}.`);
console.log(`[Modbus-sim] Corrientes iniciales: ${ampsL.map((a) => a.toFixed(1)).join('/')} A (rango ${AMPS_MIN}-${AMPS_MAX} A, paso ${WALK_STEP} A cada ${WALK_INTERVAL_MS}ms).`);

setInterval(() => {
  console.log(`[Modbus-sim] amps=${ampsL.map((a) => a.toFixed(1)).join('/')} kw=${(((ampsL[0] + ampsL[1] + ampsL[2]) * ASSUMED_VOLTS) / 1000).toFixed(2)}`);
}, 30000);
