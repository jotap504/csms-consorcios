// Polling de medidores fisicos (medidores_modbus) via Modbus-TCP, contra un
// gateway RS485<->TCP en el tablero electrico (ver ocpp/acrel300.pdf para el
// mapa de registros). Cada fila define su propio intervalo; este modulo
// corre un tick corto y solo consulta los medidores que ya vencieron.
const ModbusRTU = require('modbus-serial');

const TICK_MS = 5000;
const READ_TIMEOUT_MS = 4000;

// Direcciones decimales, tabla 6.2 del manual ADW300 y tabla 8/9.1 del manual
// ADL400 (funcion 03H, ambos). Los dos meters son RS485/Modbus-RTU nativo -
// el ADL400 no tiene variante wireless, por eso es mas barato con un router
// RS485->TCP generico en vez del gateway propio de Acrel.
const REGISTER_MAPS = {
  ADW300: {
    ampsStart: 26, // 001AH: Current A/B/C, uint16, 2 decimales
    ampsCount: 3,
    ampsScale: 100,
    powerStart: 36, // 0024H: Total active power, int32 (2 registros), 3 decimales
    powerScale: 1000,
  },
  ADL400: {
    ampsStart: 100, // 0064H: Current of A/B/C, uint16, 0.01A (secondary side)
    ampsCount: 3,
    ampsScale: 100,
    powerStart: 362, // 016AH: Total active power, int32 complemento a 2, 0.001kW
    powerScale: 1000,
  },
};

function toSigned32(hi, lo) {
  const raw = ((hi << 16) | lo) >>> 0;
  return raw > 0x7fffffff ? raw - 0x100000000 : raw;
}

async function leerMedidor(medidor) {
  const map = REGISTER_MAPS[medidor.modelo];
  if (!map) throw new Error(`Modelo de medidor sin mapa de registros: ${medidor.modelo}`);

  const client = new ModbusRTU();
  client.setTimeout(READ_TIMEOUT_MS);
  try {
    await client.connectTCP(medidor.host, { port: medidor.puerto });
    client.setID(medidor.unit_id);

    const ampsRes = await client.readHoldingRegisters(map.ampsStart, map.ampsCount);
    const powerRes = await client.readHoldingRegisters(map.powerStart, 2);

    const [ampsL1, ampsL2, ampsL3] = ampsRes.data.map((v) => v / map.ampsScale);
    const potenciaKw = toSigned32(powerRes.data[0], powerRes.data[1]) / map.powerScale;

    return { amps_l1: ampsL1, amps_l2: ampsL2, amps_l3: ampsL3, potencia_kw: potenciaKw };
  } finally {
    client.close(() => {});
  }
}

function startModbusPolling(pool) {
  const busy = new Set();
  const nextPollAt = new Map();

  setInterval(async () => {
    let medidores;
    try {
      medidores = (await pool.query(
        'SELECT * FROM medidores_modbus WHERE activo = TRUE',
      )).rows;
    } catch (err) {
      console.error('[Modbus] Error leyendo configuracion de medidores:', err.message);
      return;
    }

    const now = Date.now();
    for (const medidor of medidores) {
      if (busy.has(medidor.id)) continue;
      const due = nextPollAt.get(medidor.id) ?? 0;
      if (now < due) continue;

      busy.add(medidor.id);
      nextPollAt.set(medidor.id, now + medidor.intervalo_seg * 1000);

      leerMedidor(medidor)
        .then(async (lectura) => {
          const tabla = medidor.sector_id != null ? 'lecturas_sector' : 'lecturas_consorcio';
          const columnaGrupo = medidor.sector_id != null ? 'sector_id' : 'consorcio_id';
          const idGrupo = medidor.sector_id != null ? medidor.sector_id : medidor.consorcio_id;
          await pool.query(
            `INSERT INTO ${tabla} (${columnaGrupo}, amps_l1, amps_l2, amps_l3, potencia_kw)
             VALUES ($1,$2,$3,$4,$5)`,
            [idGrupo, lectura.amps_l1, lectura.amps_l2, lectura.amps_l3, lectura.potencia_kw],
          );
          await pool.query(
            'UPDATE medidores_modbus SET ultima_lectura_en = NOW(), ultimo_error = NULL WHERE id = $1',
            [medidor.id],
          );
        })
        .catch(async (err) => {
          console.error(`[Modbus] medidor id=${medidor.id} (${medidor.nombre}) error:`, err.message);
          try {
            await pool.query('UPDATE medidores_modbus SET ultimo_error = $1 WHERE id = $2', [err.message, medidor.id]);
          } catch {
            // si ni esto anda, ya se logueo arriba, no hay mas que hacer
          }
        })
        .finally(() => busy.delete(medidor.id));
    }
  }, TICK_MS);

  console.log('[Modbus] Poller de medidores fisicos iniciado.');
}

module.exports = { startModbusPolling };
