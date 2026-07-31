require('dotenv').config();
const WebSocket = require('ws');
const { spawn } = require('child_process');

const CSMS_WS_URL = process.env.CSMS_WS_URL || 'ws://192.168.1.38:8081';
const STATION_ID = process.env.STATION_ID || 'PI4-SIM-01';
const ID_TOKEN = process.env.ID_TOKEN || 'RFID-PI4-SIM-01';
const AMPS = Number(process.env.SIM_AMPS || 16);
const VOLTS = Number(process.env.SIM_VOLTS || 220);
const METER_INTERVAL_MS = Number(process.env.METER_INTERVAL_MS || 10000);

const GPIO_CHIP = process.env.GPIO_CHIP || 'gpiochip0';
const LED_CHARGING_PIN = Number(process.env.LED_CHARGING_PIN || 27);
const LED_AVAILABLE_PIN = Number(process.env.LED_AVAILABLE_PIN || 22);
const LED_FAULT_PIN = Number(process.env.LED_FAULT_PIN || 23);
const BUTTON_PIN = Number(process.env.BUTTON_PIN || 24);

// Cada salida se controla lanzando `gpioset`, que mantiene la linea tomada
// (y en el valor pedido) mientras el proceso vive. Para cambiar el valor,
// matamos el proceso anterior y lanzamos uno nuevo.
function makeOutput(line) {
  let proc = null;
  function apply(value, toggleMs) {
    if (proc) { proc.kill(); proc = null; }
    const args = ['-c', GPIO_CHIP];
    if (toggleMs) args.push('-t', String(toggleMs));
    args.push(`${line}=${value ? 1 : 0}`);
    proc = spawn('gpioset', args, { stdio: 'ignore' });
    proc.on('error', (err) => console.error(`[GPIO] gpioset linea ${line}:`, err.message));
  }
  return {
    on: () => apply(true),
    off: () => apply(false),
    blink: (periodMs) => apply(true, periodMs),
  };
}

const ledChargingLine = makeOutput(LED_CHARGING_PIN);
const ledAvailableLine = makeOutput(LED_AVAILABLE_PIN);
const ledFaultLine = makeOutput(LED_FAULT_PIN);

function setLeds({ available, charging, fault }) {
  available ? ledAvailableLine.on() : ledAvailableLine.off();
  fault ? ledFaultLine.on() : ledFaultLine.off();
  charging ? ledChargingLine.blink(500) : ledChargingLine.off();
}

setLeds({ available: false, charging: false, fault: true });

// Boton fisico via gpiomon: un proceso de fondo que imprime una linea por
// cada flanco de bajada (con debounce de 50ms hecho por el propio gpiomon).
let lastPress = 0;
const buttonMonitor = spawn(
  'gpiomon',
  ['-c', GPIO_CHIP, '-b', 'pull-up', '-e', 'falling', '-p', '50ms', String(BUTTON_PIN)],
  { stdio: ['ignore', 'pipe', 'pipe'] },
);
buttonMonitor.stdout.on('data', () => {
  const now = Date.now();
  if (now - lastPress < 800) return;
  lastPress = now;
  console.log('[BOTON] Tap detectado');
  if (transactionId) {
    stopTransaction('Local');
  } else {
    startTransaction(ID_TOKEN);
  }
});
buttonMonitor.stderr.on('data', (d) => console.error('[GPIO] gpiomon:', d.toString().trim()));
buttonMonitor.on('error', (err) => console.error('[GPIO] gpiomon no se pudo iniciar:', err.message));

let ws;
let seqNo = 0;
let transactionId = null;
let energyWh = 0;
let meterTimer = null;

function call(action, payload) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  ws.send(JSON.stringify([2, id, action, payload]));
  return id;
}

function reply(id, payload) {
  ws.send(JSON.stringify([3, id, payload]));
}

function connect() {
  ws = new WebSocket(`${CSMS_WS_URL}/${STATION_ID}`, ['ocpp2.0.1']);

  ws.on('open', () => {
    console.log(`[OCPP] Conectado como ${STATION_ID}`);
    setLeds({ available: true, charging: false, fault: false });
    call('BootNotification', {
      reason: 'PowerUp',
      chargingStation: { model: 'Pi4-Sim', vendorName: 'CSMS-Consorcios-DIY' },
    });
  });

  ws.on('message', (data) => handleMessage(data));

  ws.on('close', () => {
    console.log('[OCPP] Desconectado, reintentando en 5s...');
    setLeds({ available: false, charging: false, fault: true });
    setTimeout(connect, 5000);
  });

  ws.on('error', (err) => console.error('[OCPP] Error WS:', err.message));
}

function handleMessage(data) {
  const msg = JSON.parse(data.toString());
  if (msg[0] === 2) {
    const [, id, action, payload] = msg;
    console.log(`[OCPP] CALL recibido: ${action}`, JSON.stringify(payload));
    handleIncomingCall(id, action, payload);
  } else if (msg[0] === 4) {
    console.error('[OCPP] CALLERROR:', JSON.stringify(msg));
  }
}

function handleIncomingCall(id, action, payload) {
  switch (action) {
    case 'SetChargingProfile':
      reply(id, { status: 'Accepted' });
      break;
    case 'RequestStartTransaction':
      reply(id, { status: 'Accepted' });
      startTransaction(payload.idToken?.idToken || ID_TOKEN);
      break;
    case 'RequestStopTransaction':
      reply(id, { status: 'Accepted' });
      stopTransaction('Remote');
      break;
    default:
      reply(id, {});
  }
}

function meterValuePayload() {
  return {
    timestamp: new Date().toISOString(),
    sampledValue: [
      { value: energyWh, measurand: 'Energy.Active.Import.Register', unitOfMeasure: { unit: 'Wh' } },
      { value: Number(((AMPS * VOLTS) / 1000).toFixed(2)), measurand: 'Power.Active.Import', unitOfMeasure: { unit: 'kW' } },
    ],
  };
}

function startTransaction(idToken) {
  if (transactionId) return;
  transactionId = `pi4-sim-${STATION_ID}-${Date.now()}`;
  energyWh = 0;
  seqNo = 0;
  setLeds({ available: false, charging: true, fault: false });

  call('TransactionEvent', {
    eventType: 'Started',
    timestamp: new Date().toISOString(),
    triggerReason: 'Authorized',
    seqNo: seqNo++,
    transactionInfo: { transactionId, chargingState: 'Charging' },
    idToken: { idToken, type: 'ISO14443' },
    meterValue: [meterValuePayload()],
  });

  console.log(`[SIM] Carga iniciada. tx=${transactionId}`);
  meterTimer = setInterval(sendMeterUpdate, METER_INTERVAL_MS);
}

function sendMeterUpdate() {
  if (!transactionId) return;
  const wh = Math.round(AMPS * VOLTS * (METER_INTERVAL_MS / 3600000));
  energyWh += wh;
  call('TransactionEvent', {
    eventType: 'Updated',
    timestamp: new Date().toISOString(),
    triggerReason: 'MeterValuePeriodic',
    seqNo: seqNo++,
    transactionInfo: { transactionId, chargingState: 'Charging' },
    meterValue: [meterValuePayload()],
  });
}

function stopTransaction(reason) {
  if (!transactionId) return;
  clearInterval(meterTimer);
  setLeds({ available: true, charging: false, fault: false });

  call('TransactionEvent', {
    eventType: 'Ended',
    timestamp: new Date().toISOString(),
    triggerReason: reason === 'Remote' ? 'RemoteStop' : 'EVDeparted',
    seqNo: seqNo++,
    transactionInfo: {
      transactionId,
      chargingState: 'Idle',
      stoppedReason: reason === 'Remote' ? 'Remote' : 'Local',
    },
    idToken: { idToken: ID_TOKEN, type: 'ISO14443' },
    meterValue: [meterValuePayload()],
  });

  console.log(`[SIM] Carga detenida. tx=${transactionId}, total=${energyWh}Wh`);
  transactionId = null;
}

connect();

process.on('SIGINT', () => {
  setLeds({ available: false, charging: false, fault: false });
  buttonMonitor.kill();
  setTimeout(() => process.exit(0), 200);
});
