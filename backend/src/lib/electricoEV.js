// Motor de predimensionado electrico para el cotizador de infraestructura EV
// (troncales edificio -> piso -> troncal -> cochera). Funcion pura, analoga a
// calcularInforme() en routes/comercial.js pero aislada en su propio archivo
// para que sea auditable/testeable independiente del router.
//
// Base normativa (valores publicados, no inventados):
// - IEC 60364-5-52 Tabla B.52.4: capacidad de conduccion (ampacidad) para
//   conductores de cobre con aislacion PVC, metodo de instalacion de
//   referencia C (fijado en superficie / al aire libre, 2 conductores
//   cargados). La norma argentina AEA 90364 adopta estas mismas tablas
//   numericamente.
// - IEC 60364-5-52 Tabla B.52.14: factor de correccion por temperatura
//   ambiente distinta de 30 grados C (aislacion PVC).
// - IEC 60364-5-52 Tabla B.52.17: factor de correccion por agrupamiento de
//   circuitos (varios circuitos en una misma bandeja/canalizacion).
// - Resistividad del cobre en servicio (~operando cerca de su temperatura
//   nominal) tomada en 0.0225 ohm*mm2/m, valor conservador habitual en
//   planillas de calculo de caida de tension en la practica argentina
//   (mas alto que el valor a 20 grados C de 0.0175, para no subestimar
//   la caida real con el conductor caliente).
//
// IMPORTANTE: esto es una herramienta de ESTIMACION COMERCIAL y
// PREDIMENSIONAMIENTO, no reemplaza el proyecto electrico. Ver
// DISCLAIMER_PREDIMENSIONADO, exportado para renderizarse siempre junto a
// cualquier resultado de este motor (marketing/cotizador.md seccion 44).

const DISCLAIMER_PREDIMENSIONADO = 'La seleccion definitiva de conductores, protecciones, caida de tension, '
  + 'capacidad de conduccion, metodo de instalacion y demas parametros electricos debera ser verificada y '
  + 'aprobada por el profesional responsable del proyecto.';

// Tabla B.52.4 (metodo C, cobre, PVC, 2 conductores cargados, 30 grados C ambiente) - amperios.
const AMPACIDAD_COBRE_PVC_METODO_C = {
  1.5: 19.5, 2.5: 27, 4: 36, 6: 46, 10: 63, 16: 85, 25: 112, 35: 138, 50: 168, 70: 213, 95: 258,
};

// Tabla B.52.14 (aislacion PVC, referencia 30 grados C = 1.00).
const FACTOR_TEMPERATURA_PVC = [
  { tempC: 25, factor: 1.03 },
  { tempC: 30, factor: 1.00 },
  { tempC: 35, factor: 0.94 },
  { tempC: 40, factor: 0.87 },
  { tempC: 45, factor: 0.79 },
  { tempC: 50, factor: 0.71 },
  { tempC: 55, factor: 0.61 },
  { tempC: 60, factor: 0.50 },
];

// Tabla B.52.17 (circuitos agrupados, una capa, en contacto).
const FACTOR_AGRUPAMIENTO = [
  { circuitos: 1, factor: 1.00 },
  { circuitos: 2, factor: 0.80 },
  { circuitos: 3, factor: 0.70 },
  { circuitos: 4, factor: 0.65 },
  { circuitos: 5, factor: 0.60 },
  { circuitos: 6, factor: 0.57 },
  { circuitos: 7, factor: 0.54 },
  { circuitos: 8, factor: 0.52 },
  { circuitos: 9, factor: 0.50 },
];

const SECCIONES_NORMALIZADAS_MM2 = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95];
// Serie normalizada IEC 60947-2 de interruptores termomagneticos/MCCB - se
// extiende hasta 400A (habitual en tableros principales/troncales de EV con
// varias cocheras agregadas) en vez de cortar en 125A (solo cubre un circuito
// individual chico) para no devolver null en troncales con corriente alta.
const CALIBRES_TERMICA_A = [6, 10, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400];
const CAIDA_TENSION_MAX_PCT = 3;
const RESISTIVIDAD_COBRE_OHM_MM2_POR_M = 0.0225;

// Redondeo conservador: si la temperatura no esta en la tabla, se usa el
// factor del escalon disponible MAS PROXIMO POR ARRIBA (mas exigente/menor
// factor) en vez de interpolar de forma optimista. Fuera de rango de tabla
// se usa el extremo correspondiente y se agrega una advertencia.
function factorTemperatura(tempC, advertencias) {
  const t = Number(tempC);
  if (!Number.isFinite(t)) return 1.00;
  if (t <= FACTOR_TEMPERATURA_PVC[0].tempC) return FACTOR_TEMPERATURA_PVC[0].factor;
  const ultimo = FACTOR_TEMPERATURA_PVC[FACTOR_TEMPERATURA_PVC.length - 1];
  if (t > ultimo.tempC) {
    advertencias.push(`Temperatura ambiente (${t} C) fuera del rango tabulado (hasta ${ultimo.tempC} C) - usar criterio profesional.`);
    return ultimo.factor;
  }
  const fila = FACTOR_TEMPERATURA_PVC.find((f) => t <= f.tempC);
  return fila.factor;
}

function factorAgrupamiento(circuitos, advertencias) {
  const n = Math.max(1, Number(circuitos) || 1);
  const ultimo = FACTOR_AGRUPAMIENTO[FACTOR_AGRUPAMIENTO.length - 1];
  if (n > ultimo.circuitos) {
    advertencias.push(`Agrupamiento de ${n} circuitos supera la tabla base (hasta ${ultimo.circuitos}) - usar tabla completa/criterio profesional.`);
    return ultimo.factor;
  }
  const fila = FACTOR_AGRUPAMIENTO.find((f) => n <= f.circuitos);
  return fila.factor;
}

// Corriente de diseno del troncal: corriente nominal de un cargador segun
// mono/trifasico (mismas formulas ya usadas en calcularInforme), multiplicada
// por la cantidad de cocheras servidas por el troncal y el factor de
// simultaneidad/diversidad (DLB cloud limita la demanda real, pero el
// dimensionamiento del conductor se hace por la demanda de diseno).
function calcularCorrienteDiseno({
  potenciaNominalKw, tipoAlimentacion, cantidadCocheras, factorSimultaneidad,
}) {
  const p = Number(potenciaNominalKw) || 0;
  const cocheras = Math.max(0, Number(cantidadCocheras) || 0);
  const factor = factorSimultaneidad === undefined || factorSimultaneidad === null || factorSimultaneidad === ''
    ? 1
    : Math.min(1, Math.max(0, Number(factorSimultaneidad)));
  const corrientePorCargador = tipoAlimentacion === 'tri'
    ? (p * 1000) / (Math.sqrt(3) * 380)
    : (p * 1000) / 220;
  return corrientePorCargador * cocheras * factor;
}

function calcularCaidaTensionPct({
  seccionMm2, corrienteA, longitudM, tipoAlimentacion,
}) {
  const l = Number(longitudM) || 0;
  const tensionV = tipoAlimentacion === 'tri' ? 380 : 220;
  const factorRecorrido = tipoAlimentacion === 'tri' ? Math.sqrt(3) : 2; // mono: ida y vuelta
  const caidaV = (factorRecorrido * l * corrienteA * RESISTIVIDAD_COBRE_OHM_MM2_POR_M) / seccionMm2;
  return (caidaV / tensionV) * 100;
}

// Funcion principal: recibe los datos de entrada de UN troncal y devuelve su
// bloque de calculo. Pura (sin I/O, sin acceso a DB) para poder testearse
// aislada y reutilizarse igual para cualquier cantidad de troncales.
function calcularTroncal(troncal) {
  const advertencias = [];
  const corrienteDisenoA = calcularCorrienteDiseno({
    potenciaNominalKw: troncal.potencia_nominal_wallbox_kw,
    tipoAlimentacion: troncal.tipo_alimentacion,
    cantidadCocheras: Array.isArray(troncal.cocheras) ? troncal.cocheras.length : (troncal.cantidad_cocheras || 0),
    factorSimultaneidad: troncal.factor_simultaneidad,
  });

  const factorTemp = factorTemperatura(troncal.temperatura_ambiente_c, advertencias);
  const factorAgrup = factorAgrupamiento(troncal.agrupamiento_circuitos, advertencias);
  const factorCorreccionTotal = Number((factorTemp * factorAgrup).toFixed(3));

  const longitudM = (Number(troncal.distancia_tablero_a_inicio_m) || 0) + (Number(troncal.longitud_troncal_m) || 0);

  let elegida = null;
  for (const seccion of SECCIONES_NORMALIZADAS_MM2) {
    const capacidadCorregida = AMPACIDAD_COBRE_PVC_METODO_C[seccion] * factorCorreccionTotal;
    if (capacidadCorregida < corrienteDisenoA) continue;
    const caidaPct = calcularCaidaTensionPct({
      seccionMm2: seccion, corrienteA: corrienteDisenoA, longitudM, tipoAlimentacion: troncal.tipo_alimentacion,
    });
    if (caidaPct > CAIDA_TENSION_MAX_PCT) continue;
    elegida = { seccion, capacidadCorregida, caidaPct };
    break;
  }

  if (!elegida) {
    // Ni la mayor seccion normalizada cumple ampacidad+caida de tension para
    // esta corriente/longitud - se informa con la mayor seccion disponible y
    // se marca como no conforme, en vez de devolver un resultado falso.
    const seccionMax = SECCIONES_NORMALIZADAS_MM2[SECCIONES_NORMALIZADAS_MM2.length - 1];
    const capacidadCorregida = AMPACIDAD_COBRE_PVC_METODO_C[seccionMax] * factorCorreccionTotal;
    const caidaPct = calcularCaidaTensionPct({
      seccionMm2: seccionMax, corrienteA: corrienteDisenoA, longitudM, tipoAlimentacion: troncal.tipo_alimentacion,
    });
    advertencias.push('Ninguna seccion normalizada (hasta 95 mm2) cumple ampacidad y caida de tension para esta corriente/distancia - '
      + 'requiere division del troncal, aumento de tension de alimentacion, o revision del proyecto por el profesional responsable.');
    elegida = { seccion: seccionMax, capacidadCorregida, caidaPct };
  }

  let calibreTermica = CALIBRES_TERMICA_A.find(
    (In) => In >= corrienteDisenoA && In <= elegida.capacidadCorregida,
  );
  if (!calibreTermica) {
    calibreTermica = CALIBRES_TERMICA_A.find((In) => In >= corrienteDisenoA);
    if (calibreTermica) {
      advertencias.push('No hay calibre de termica normalizado que coordine limpio (In <= Iz) para esta seccion - revisar con el profesional responsable.');
    } else {
      const maxCalibre = CALIBRES_TERMICA_A[CALIBRES_TERMICA_A.length - 1];
      advertencias.push(`Corriente de diseno (${corrienteDisenoA.toFixed(1)} A) supera el mayor calibre de termica normalizado disponible (${maxCalibre} A) - `
        + 'dividir el troncal en mas circuitos, revisar factor de simultaneidad, o pasar a alimentacion trifasica antes de cotizar.');
    }
  }

  return {
    corriente_diseno_a: Number(corrienteDisenoA.toFixed(2)),
    seccion_mm2: elegida.seccion,
    calibre_termica_a: calibreTermica ?? null,
    caida_tension_pct: Number(elegida.caidaPct.toFixed(2)),
    caida_tension_ok: elegida.caidaPct <= CAIDA_TENSION_MAX_PCT,
    capacidad_conduccion_a: Number(elegida.capacidadCorregida.toFixed(2)),
    factor_correccion_total: factorCorreccionTotal,
    tabla_ref: 'IEC 60364-5-52 Tabla B.52.4 (metodo C) / B.52.14 (temperatura) / B.52.17 (agrupamiento)',
    advertencias,
    calculado_en: new Date().toISOString(),
  };
}

module.exports = {
  calcularTroncal,
  calcularCorrienteDiseno,
  calcularCaidaTensionPct,
  DISCLAIMER_PREDIMENSIONADO,
  SECCIONES_NORMALIZADAS_MM2,
  CALIBRES_TERMICA_A,
  CAIDA_TENSION_MAX_PCT,
};
