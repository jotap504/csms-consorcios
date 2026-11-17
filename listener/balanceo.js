// Logica pura de reparto del balanceador (sin DB ni OCPP), separada de
// index.js para poder probarla.

const MIN_AMPS = 6; // IEC 61851 minimum safe charging current

// Cuantos "cupos" de MIN_AMPS ocupa un cargador:
//   - modo 'equipo' (estandar OCPP): 1, el equipo reparte internamente entre
//     sus conectores el limite que recibe.
//   - modo 'por_conector': uno por cada auto cargando, porque el equipo aplica
//     el limite recibido a CADA conector (2 autos x 10 A = 20 A reales).
function pesoCargador(modoLimite, sesionesActivas) {
  return modoLimite === 'por_conector' ? Math.max(1, Number(sesionesActivas) || 1) : 1;
}

// Reparte "limite" amperios entre "items" ([{ ocppId, peso }], ya en orden
// FIFO). Cada cupo (peso 1) recibe la misma corriente, con piso de MIN_AMPS.
// FIFO estricto: el primero que no entra pasa a la cola junto con todos los
// que vienen detras. Un cargador por_conector entra completo o no entra: no
// se puede dejar un conector cargando y el otro en 0, porque el equipo aplica
// el mismo valor a los dos.
// Devuelve { perAmps, conCupo: [ocppId], enCola: [ocppId], cuposUsados }.
// perAmps es lo que se le manda a cada equipo con cupo (por conector si es
// por_conector, total si es equipo).
function planificarCupos(items, limite) {
  const conCupo = [];
  const enCola = [];
  let cuposUsados = 0;
  let lleno = false;
  for (const item of items) {
    const peso = Math.max(1, item.peso ?? 1);
    if (!lleno && (cuposUsados + peso) * MIN_AMPS <= limite) {
      conCupo.push(item.ocppId);
      cuposUsados += peso;
    } else {
      lleno = true;
      enCola.push(item.ocppId);
    }
  }
  const perAmps = cuposUsados > 0 ? Math.floor(limite / cuposUsados) : 0;
  return { perAmps, conCupo, enCola, cuposUsados };
}

module.exports = { MIN_AMPS, pesoCargador, planificarCupos };
