// Prueba automatica de Smart Charging (SetChargingProfile) contra un wallbox
// conectado a nuestro CSMS. Responde con evidencia la pregunta "¿podemos
// cambiarle el amperaje de carga desde el CSMS?" sin depender de lo que
// declare el fabricante:
//
//   1. conexion      - el equipo esta online y con que protocolo negocio
//   2. declarado     - que dice soportar (GetConfiguration / GetVariables)
//   3. set_a         - SetChargingProfile a LIMITE_A, probando varios formatos
//   4. verifica_a    - GetCompositeSchedule refleja LIMITE_A
//   5. set_b         - cambia a LIMITE_B con el mismo formato
//   6. verifica_b    - GetCompositeSchedule refleja LIMITE_B
//   7. medicion      - (solo si hay una carga activa) la corriente real medida
//                      baja al limite
//   8. limpieza      - borra el perfil de prueba (o lo deja en LIMITE_RESTAURAR)
//
// El REST de CitrineOS es fire-and-forget (ver sendAndAwaitConfirmation en
// routes/public.js): la respuesta real del cargador hay que ir a buscarla a
// la tabla OCPPMessages. A diferencia de ese helper, aca tambien se lee el
// CALLERROR (state '4'): un firmware sin smart charging suele contestar
// NotImplemented/NotSupported en vez de un CALLRESULT con Rejected.
//
// pool/fetch/tiempos se inyectan para poder simular el cargador en tests.

const LIMITE_A = 10;
const LIMITE_B = 6; // minimo de IEC 61851: cualquier auto sigue cargando
const LIMITE_RESTAURAR = 32;
const PROFILE_ID = 990001; // fijo: cada SetChargingProfile reemplaza al anterior y se puede borrar por id
const VOLTS = 230;

const DEFAULTS = {
  citrineUrl: process.env.CITRINEOS_REST_URL || 'http://citrineos-core:8080',
  confirmTimeoutMs: 6000,
  confirmPollMs: 400,
  medicionTimeoutMs: 90000,
  medicionPollMs: 3000,
};

// Formatos a probar, en orden. El primero de cada version es EXACTAMENTE el
// que manda hoy el balanceador (listener/index.js:pushChargingProfile): si el
// equipo lo rechaza pero acepta otro, el smart charging funciona pero hay que
// adaptar el balanceador para ese modelo.
const VARIANTES_16 = [
  { id: 'cpmax_c0', nombre: 'ChargePointMaxProfile, connectorId 0, en A', purpose: 'ChargePointMaxProfile', connectorId: 0, unit: 'A', produccion: true },
  { id: 'cpmax_c1', nombre: 'ChargePointMaxProfile, connectorId 1, en A', purpose: 'ChargePointMaxProfile', connectorId: 1, unit: 'A' },
  { id: 'txdef_c1', nombre: 'TxDefaultProfile, connectorId 1, en A', purpose: 'TxDefaultProfile', connectorId: 1, unit: 'A' },
  { id: 'txdef_c0', nombre: 'TxDefaultProfile, connectorId 0, en A', purpose: 'TxDefaultProfile', connectorId: 0, unit: 'A' },
  { id: 'cpmax_c0_w', nombre: 'ChargePointMaxProfile, connectorId 0, en W', purpose: 'ChargePointMaxProfile', connectorId: 0, unit: 'W' },
];
const VARIANTES_201 = [
  { id: 'csmax_e0', nombre: 'ChargingStationMaxProfile, evseId 0, en A', purpose: 'ChargingStationMaxProfile', connectorId: 0, unit: 'A', produccion: true },
  { id: 'txdef_e1', nombre: 'TxDefaultProfile, evseId 1, en A', purpose: 'TxDefaultProfile', connectorId: 1, unit: 'A' },
  { id: 'txdef_e0', nombre: 'TxDefaultProfile, evseId 0, en A', purpose: 'TxDefaultProfile', connectorId: 0, unit: 'A' },
  { id: 'csmax_e0_w', nombre: 'ChargingStationMaxProfile, evseId 0, en W', purpose: 'ChargingStationMaxProfile', connectorId: 0, unit: 'W' },
];

const PASOS = [
  { id: 'conexion', titulo: 'Equipo conectado / Device online' },
  { id: 'declarado', titulo: 'Smart Charging declarado por el firmware / Declared by firmware' },
  { id: 'set_a', titulo: `SetChargingProfile a ${LIMITE_A} A` },
  { id: 'verifica_a', titulo: `GetCompositeSchedule refleja ${LIMITE_A} A / reflects ${LIMITE_A} A` },
  { id: 'set_b', titulo: `Cambio de limite a ${LIMITE_B} A / Change limit to ${LIMITE_B} A` },
  { id: 'verifica_b', titulo: `GetCompositeSchedule refleja ${LIMITE_B} A / reflects ${LIMITE_B} A` },
  { id: 'medicion', titulo: 'Corriente real medida baja al limite / Measured current follows limit' },
  { id: 'limpieza', titulo: 'Borrar perfil de prueba / Clear test profile' },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function limiteEnUnidad(variante, amps) {
  return variante.unit === 'W' ? amps * VOLTS : amps;
}

function buildSetProfile(is16, variante, amps) {
  const period = { startPeriod: 0, limit: limiteEnUnidad(variante, amps) };
  if (variante.unit === 'W') period.numberPhases = 1;
  const schedule = { chargingRateUnit: variante.unit, startSchedule: new Date().toISOString(), chargingSchedulePeriod: [period] };
  if (is16) {
    return {
      connectorId: variante.connectorId,
      csChargingProfiles: {
        chargingProfileId: PROFILE_ID,
        stackLevel: 0,
        chargingProfilePurpose: variante.purpose,
        chargingProfileKind: 'Absolute',
        chargingSchedule: schedule,
      },
    };
  }
  return {
    evseId: variante.connectorId,
    chargingProfile: {
      id: PROFILE_ID,
      stackLevel: 0,
      chargingProfilePurpose: variante.purpose,
      chargingProfileKind: 'Absolute',
      chargingSchedule: [{ id: PROFILE_ID, ...schedule }],
    },
  };
}

// Devuelve los limites (en A) del composite schedule, o null si no hay.
function limitesDeComposite(is16, payload) {
  const schedule = is16 ? payload?.chargingSchedule : payload?.schedule;
  const periods = schedule?.chargingSchedulePeriod;
  if (!Array.isArray(periods) || periods.length === 0) return null;
  const unit = schedule.chargingRateUnit;
  return periods.map((p) => {
    const limit = Number(p.limit);
    if (unit !== 'W') return limit;
    return limit / (VOLTS * (p.numberPhases || 3));
  });
}

// Corriente (A) de la muestra mas reciente de un meterValue[]: Current.Offered
// es lo que el equipo le ofrece al auto (lo mas directo); Current.Import es
// lo que el auto toma de verdad (maximo entre fases).
function corrienteDeMeterValues(meterValue) {
  const samples = (meterValue ?? []).flatMap((mv) => mv.sampledValue ?? []);
  const valores = (measurand) => samples
    .filter((s) => s.measurand === measurand)
    .map((s) => Number(s.value))
    .filter((v) => Number.isFinite(v));
  const offered = valores('Current.Offered');
  const imported = valores('Current.Import');
  if (offered.length === 0 && imported.length === 0) return null;
  return {
    offered: offered.length ? Math.max(...offered) : null,
    imported: imported.length ? Math.max(...imported) : null,
  };
}

function crearEstado(ocppId) {
  return {
    ocpp_id: ocppId,
    estado: 'corriendo',
    iniciado_en: new Date().toISOString(),
    terminado_en: null,
    version: null,
    variante: null,
    variantes_probadas: [],
    pasos: PASOS.map((p) => ({ ...p, estado: 'pendiente', detalle: null })),
    veredicto: null,
    resumen: null,
  };
}

async function runSmartChargingTest(ocppId, deps, estado = crearEstado(ocppId)) {
  const cfg = { ...DEFAULTS, ...deps };
  const { pool } = cfg;
  const doFetch = cfg.fetch ?? fetch;
  const paso = (id) => estado.pasos.find((p) => p.id === id);
  const marcar = (id, est, detalle) => { const p = paso(id); p.estado = est; p.detalle = detalle ?? null; };

  // Manda un CALL via CitrineOS y espera la respuesta real del cargador.
  //   { tipo: 'no_enviado', detalle }      - CitrineOS no pudo despachar
  //   { tipo: 'sin_respuesta' }            - el cargador no contesto a tiempo
  //   { tipo: 'resultado', payload }       - CALLRESULT
  //   { tipo: 'error', codigo, descripcion } - CALLERROR
  async function enviar(action, restPath, body) {
    const url = `${cfg.citrineUrl}${restPath}?identifier=${encodeURIComponent(ocppId)}&tenantId=1`;
    const sentAt = new Date();
    try {
      const res = await doFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => null);
      const dispatch = Array.isArray(data) ? data[0] : data;
      if (!res.ok || !dispatch?.success) {
        return { tipo: 'no_enviado', detalle: `HTTP ${res.status} ${JSON.stringify(dispatch?.payload ?? dispatch?.message ?? dispatch ?? '').slice(0, 200)}` };
      }
    } catch (err) {
      return { tipo: 'no_enviado', detalle: err.message };
    }
    const deadline = Date.now() + cfg.confirmTimeoutMs;
    while (Date.now() < deadline) {
      await sleep(cfg.confirmPollMs);
      const row = await pool.query(
        `SELECT state, message FROM "OCPPMessages"
         WHERE "stationId" = $1 AND action = $2 AND state IN ('2', '4') AND "timestamp" > $3
         ORDER BY "timestamp" ASC LIMIT 1`,
        [ocppId, action, sentAt],
      );
      if (row.rowCount > 0) {
        const { state, message } = row.rows[0];
        if (String(state) === '4') return { tipo: 'error', codigo: message?.[2] ?? 'CALLERROR', descripcion: message?.[3] ?? '' };
        return { tipo: 'resultado', payload: message?.[2] ?? null };
      }
    }
    return { tipo: 'sin_respuesta' };
  }

  function describir(r) {
    if (r.tipo === 'resultado') return `status=${r.payload?.status ?? JSON.stringify(r.payload)}`;
    if (r.tipo === 'error') return `CALLERROR ${r.codigo}${r.descripcion ? ` (${r.descripcion})` : ''}`;
    if (r.tipo === 'sin_respuesta') return 'el equipo no respondio / no response';
    return `CitrineOS no pudo enviar el mensaje: ${r.detalle}`;
  }

  let is16 = false;
  let variante = null; // formato aceptado por el equipo
  let perfilInstalado = false;
  const prefijo = () => (is16 ? '/ocpp/1.6' : '/ocpp/2.0.1');
  const setProfile = (v, amps) => enviar('SetChargingProfile', `${prefijo()}/smartcharging/setChargingProfile`, buildSetProfile(is16, v, amps));

  async function verificarComposite(pasoId, amps) {
    const body = is16
      ? { connectorId: variante.connectorId, duration: 3600, chargingRateUnit: 'A' }
      : { evseId: variante.connectorId, duration: 3600, chargingRateUnit: 'A' };
    const r = await enviar('GetCompositeSchedule', `${prefijo()}/smartcharging/getCompositeSchedule`, body);
    if (r.tipo !== 'resultado') {
      marcar(pasoId, 'omitido', `No se pudo verificar: ${describir(r)}`);
      return null;
    }
    if (r.payload?.status !== 'Accepted') {
      marcar(pasoId, 'omitido', `GetCompositeSchedule no disponible en el equipo (status=${r.payload?.status}).`);
      return null;
    }
    const limites = limitesDeComposite(is16, r.payload);
    if (!limites) {
      marcar(pasoId, 'advertencia', 'El equipo respondio Accepted pero sin schedule.');
      return null;
    }
    const coincide = limites.some((l) => Math.abs(l - amps) <= 0.5);
    marcar(pasoId, coincide ? 'ok' : 'fallo', `El equipo informa limite(s): ${limites.map((l) => `${Number(l.toFixed(1))} A`).join(', ')}${coincide ? '' : ` - se esperaba ${amps} A`}`);
    return coincide;
  }

  let compA = null;
  let compB = null;
  let medicion = null; // true = bajo al limite, false = no bajo, null = no se pudo medir

  try {
    // 1. conexion
    paso('conexion').estado = 'corriendo';
    const cs = await pool.query(
      'SELECT "isOnline", protocol, "chargePointVendor", "chargePointModel", "firmwareVersion" FROM "ChargingStations" WHERE id = $1',
      [ocppId],
    );
    const station = cs.rows[0];
    if (!station?.isOnline) {
      marcar('conexion', 'fallo', station ? 'El equipo se conecto alguna vez pero ahora esta offline.' : 'Este ID nunca se conecto a nuestro CSMS.');
      for (const p of estado.pasos) if (p.estado === 'pendiente') p.estado = 'omitido';
      estado.veredicto = 'INCONCLUSO';
      estado.resumen = 'El equipo no esta conectado: conectarlo y volver a correr la prueba. / Device is offline: connect it and run again.';
      return estado;
    }
    is16 = (station.protocol ?? '').includes('1.6');
    estado.version = is16 ? '1.6' : '2.0.1';
    marcar('conexion', 'ok', `Online, OCPP ${estado.version}. ${[station.chargePointVendor, station.chargePointModel, station.firmwareVersion].filter(Boolean).join(' / ')}`);

    // 2. declarado
    paso('declarado').estado = 'corriendo';
    if (is16) {
      const r = await enviar('GetConfiguration', '/ocpp/1.6/configuration/getConfiguration', {});
      if (r.tipo !== 'resultado') {
        marcar('declarado', 'omitido', describir(r));
      } else {
        const keys = Object.fromEntries((r.payload?.configurationKey ?? []).map((k) => [k.key, k.value]));
        const perfiles = keys.SupportedFeatureProfiles ?? null;
        const declara = (perfiles ?? '').toLowerCase().replace(/\s/g, '').split(',').includes('smartcharging');
        const extras = ['ChargeProfileMaxStackLevel', 'ChargingScheduleAllowedChargingRateUnit', 'ChargingScheduleMaxPeriods', 'MaxChargingProfilesInstalled']
          .filter((k) => keys[k] != null).map((k) => `${k}=${keys[k]}`).join(', ');
        marcar('declarado', declara ? 'ok' : 'advertencia',
          `SupportedFeatureProfiles=${perfiles ?? '(no informado)'}${extras ? `. ${extras}` : ''}${declara ? '' : '. No declara SmartCharging (igual se prueba).'}`);
      }
    } else {
      const r = await enviar('GetVariables', '/ocpp/2.0.1/monitoring/getVariables', {
        getVariableData: [
          { component: { name: 'SmartChargingCtrlr' }, variable: { name: 'Enabled' } },
          { component: { name: 'SmartChargingCtrlr' }, variable: { name: 'Available' } },
        ],
      });
      if (r.tipo !== 'resultado') {
        marcar('declarado', 'omitido', describir(r));
      } else {
        const results = r.payload?.getVariableResult ?? [];
        const txt = results.map((x) => `${x.variable?.name}: ${x.attributeStatus}${x.attributeValue != null ? `=${x.attributeValue}` : ''}`).join(', ');
        const declara = results.some((x) => x.attributeStatus === 'Accepted' && String(x.attributeValue).toLowerCase() !== 'false');
        marcar('declarado', declara ? 'ok' : 'advertencia', `SmartChargingCtrlr -> ${txt || '(sin datos)'}${declara ? '' : '. No lo declara habilitado (igual se prueba).'}`);
      }
    }

    // 3. set_a - probar formatos hasta que uno sea aceptado
    paso('set_a').estado = 'corriendo';
    let huboRespuesta = false;
    for (const v of (is16 ? VARIANTES_16 : VARIANTES_201)) {
      const r = await setProfile(v, LIMITE_A);
      if (r.tipo === 'resultado' || r.tipo === 'error') huboRespuesta = true;
      const aceptado = r.tipo === 'resultado' && r.payload?.status === 'Accepted';
      estado.variantes_probadas.push({ formato: v.nombre, produccion: !!v.produccion, aceptado, respuesta: describir(r) });
      if (aceptado) { variante = v; perfilInstalado = true; break; }
      if (r.tipo === 'no_enviado') break; // problema nuestro, no del equipo: no tiene sentido seguir
    }
    if (!variante) {
      const detalle = estado.variantes_probadas.map((x) => `${x.formato}: ${x.respuesta}`).join(' | ');
      marcar('set_a', 'fallo', detalle);
      for (const id of ['verifica_a', 'set_b', 'verifica_b', 'medicion', 'limpieza']) marcar(id, 'omitido', null);
      if (huboRespuesta) {
        estado.veredicto = 'NO_SOPORTADO';
        estado.resumen = 'El equipo rechazo SetChargingProfile en todos los formatos: no se le puede cambiar el amperaje desde el CSMS con este firmware. / Device rejected SetChargingProfile in every format.';
      } else {
        estado.veredicto = 'INCONCLUSO';
        estado.resumen = 'No se obtuvo ninguna respuesta del equipo a SetChargingProfile (ni aceptacion ni rechazo). Revisar conexion y repetir. / No response to SetChargingProfile.';
      }
      return estado;
    }
    estado.variante = { formato: variante.nombre, produccion: !!variante.produccion };
    marcar('set_a', variante.produccion ? 'ok' : 'advertencia',
      variante.produccion
        ? `Accepted con el formato que usa nuestro balanceador (${variante.nombre}).`
        : `Accepted, pero solo con "${variante.nombre}". Rechazo el formato actual del balanceador: ${estado.variantes_probadas.filter((x) => !x.aceptado).map((x) => `${x.formato} -> ${x.respuesta}`).join(' | ')}`);

    // 4. verifica_a
    paso('verifica_a').estado = 'corriendo';
    compA = await verificarComposite('verifica_a', LIMITE_A);

    // 5. set_b
    paso('set_b').estado = 'corriendo';
    const sentB = new Date();
    const rB = await setProfile(variante, LIMITE_B);
    const okB = rB.tipo === 'resultado' && rB.payload?.status === 'Accepted';
    marcar('set_b', okB ? 'ok' : 'fallo', describir(rB));

    // 6. verifica_b
    if (okB) {
      paso('verifica_b').estado = 'corriendo';
      compB = await verificarComposite('verifica_b', LIMITE_B);
    } else {
      marcar('verifica_b', 'omitido', null);
    }

    // 7. medicion - solo si hay una carga activa
    const tx = await pool.query('SELECT transaction_id_ocpp FROM cargador_estado_actual WHERE cargador_ocpp_id = $1', [ocppId]);
    if (!okB) {
      marcar('medicion', 'omitido', null);
    } else if (!tx.rows[0]?.transaction_id_ocpp) {
      marcar('medicion', 'omitido', 'No hay una carga activa. Para la prueba definitiva: enchufar un auto, iniciar la carga y volver a correr. / No active charging session: plug in a vehicle, start charging and run again.');
    } else {
      paso('medicion').estado = 'corriendo';
      paso('medicion').detalle = `Esperando MeterValues (hasta ${Math.round(cfg.medicionTimeoutMs / 1000)} s)...`;
      const action = is16 ? 'MeterValues' : 'TransactionEvent';
      const deadline = Date.now() + cfg.medicionTimeoutMs;
      let ultima = null;
      let huboMuestras = false;
      while (Date.now() < deadline && medicion !== true) {
        await sleep(cfg.medicionPollMs);
        const rows = await pool.query(
          `SELECT message FROM "OCPPMessages"
           WHERE "stationId" = $1 AND action = $2 AND state = '1' AND "timestamp" > $3
           ORDER BY "timestamp" DESC LIMIT 1`,
          [ocppId, action, sentB],
        );
        if (rows.rowCount === 0) continue;
        huboMuestras = true;
        const corriente = corrienteDeMeterValues(rows.rows[0].message?.[3]?.meterValue);
        if (!corriente) continue;
        ultima = corriente;
        const ref = corriente.imported ?? corriente.offered;
        // tolerancia de 1 A por resolucion/ruido del medidor del equipo
        medicion = ref <= LIMITE_B + 1;
      }
      const txt = ultima ? `Current.Offered=${ultima.offered ?? '-'} A, Current.Import=${ultima.imported ?? '-'} A` : null;
      if (medicion === true) marcar('medicion', 'ok', `${txt} con limite ${LIMITE_B} A.`);
      else if (medicion === false) marcar('medicion', 'fallo', `${txt}: la corriente NO bajo a ${LIMITE_B} A en ${Math.round(cfg.medicionTimeoutMs / 1000)} s.`);
      else marcar('medicion', 'omitido', huboMuestras
        ? 'El equipo manda MeterValues pero sin Current.Import/Current.Offered: no se puede medir la corriente real.'
        : 'El equipo no mando MeterValues durante la espera.');
    }
  } catch (err) {
    estado.error = err.message;
    for (const p of estado.pasos) if (p.estado === 'corriendo') { p.estado = 'fallo'; p.detalle = `Error interno: ${err.message}`; }
    estado.veredicto = estado.veredicto ?? 'INCONCLUSO';
    estado.resumen = estado.resumen ?? `La prueba se interrumpio por un error nuestro: ${err.message}`;
  } finally {
    // 8. limpieza - nunca dejar al equipo de un tercero limitado a 6 A
    if (perfilInstalado) {
      try {
        paso('limpieza').estado = 'corriendo';
        const r = await enviar('ClearChargingProfile', `${prefijo()}/smartcharging/clearChargingProfile`, is16 ? { id: PROFILE_ID } : { chargingProfileId: PROFILE_ID });
        if (r.tipo === 'resultado' && r.payload?.status === 'Accepted') {
          marcar('limpieza', 'ok', 'Perfil de prueba borrado (ClearChargingProfile Accepted).');
        } else {
          const r2 = await setProfile(variante, LIMITE_RESTAURAR);
          const ok2 = r2.tipo === 'resultado' && r2.payload?.status === 'Accepted';
          marcar('limpieza', 'advertencia', ok2
            ? `ClearChargingProfile: ${describir(r)}. Se dejo el perfil de prueba en ${LIMITE_RESTAURAR} A para no limitar al equipo.`
            : `ATENCION: no se pudo borrar ni subir el perfil de prueba (${describir(r)}; ${describir(r2)}). El equipo puede haber quedado limitado a ${LIMITE_B} A: reiniciarlo o borrar sus perfiles de carga.`);
        }
      } catch (err) {
        marcar('limpieza', 'advertencia', `ATENCION: fallo la limpieza (${err.message}). El equipo puede haber quedado limitado a ${LIMITE_B} A.`);
      }
    }
    for (const p of estado.pasos) if (p.estado === 'pendiente') p.estado = 'omitido';
    if (!estado.veredicto) {
      const formato = variante?.produccion ? '' : ` Requiere adaptar el balanceador al formato "${variante?.nombre}".`;
      const okB = paso('set_b').estado === 'ok';
      if (medicion === false) {
        estado.veredicto = 'NO_APLICA';
        estado.resumen = 'El equipo ACEPTA SetChargingProfile pero la corriente real no bajo: lo acepta sin aplicarlo. No sirve para balanceo de carga. / Accepts the profile but does not apply it.';
      } else if (!okB) {
        estado.veredicto = 'DUDOSO';
        estado.resumen = `Acepto el primer perfil pero no el cambio de limite.${formato}`;
      } else if (medicion === true) {
        estado.veredicto = 'SOPORTADO';
        estado.resumen = `Confirmado con medicion real: el equipo baja la corriente cuando el CSMS se lo pide.${formato} / Confirmed with real measurement.`;
      } else if (compA === false || compB === false) {
        estado.veredicto = 'DUDOSO';
        estado.resumen = `El equipo ACEPTA SetChargingProfile pero su GetCompositeSchedule no refleja el limite enviado: posible "acepta pero no aplica". Repetir con un auto cargando para confirmarlo con medicion real.${formato}`;
      } else if (compA === true && compB === true) {
        estado.veredicto = 'SOPORTADO_SIN_MEDICION';
        estado.resumen = `El equipo acepta SetChargingProfile, cambia el limite y lo refleja en GetCompositeSchedule. Falta la confirmacion final con un auto cargando (corriente real medida).${formato} / Accepted and reflected in composite schedule; real-current check still pending.`;
      } else {
        estado.veredicto = 'ACEPTA_SIN_VERIFICAR';
        estado.resumen = `El equipo responde Accepted a SetChargingProfile, pero no se pudo verificar que lo aplique (sin GetCompositeSchedule ni carga activa). Repetir con un auto cargando.${formato} / Accepted, but could not verify it is applied.`;
      }
    }
    estado.estado = 'terminado';
    estado.terminado_en = new Date().toISOString();
  }
  return estado;
}

module.exports = { runSmartChargingTest, crearEstado, LIMITE_A, LIMITE_B, PROFILE_ID };
