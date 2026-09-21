import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Printer } from 'lucide-react';
import { api } from '@/lib/api';

export default function InformeImprimir() {
  const { id } = useParams();
  const [inf, setInf] = useState(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    api.get(`/comercial/informes/${id}`).then(({ data }) => setInf(data));
  }, [id]);

  if (!inf) return null;
  const { calculos } = inf.contenido;

  return (
    <div className="mx-auto max-w-3xl bg-white px-8 py-10 text-slate-900 print:px-0 print:py-0">
      <button
        type="button"
        onClick={() => window.print()}
        className="mb-6 flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white print:hidden"
      >
        <Printer className="h-4 w-4" />Imprimir / Guardar como PDF
      </button>

      <div className="flex items-center justify-between border-b border-slate-200 pb-4">
        <img src="/logo.png" alt="BILON" className="h-8 w-auto" />
        <p className="text-xs text-slate-400">Gestion inteligente de edificios</p>
      </div>

      <h1 className="mt-6 text-2xl font-bold">INFORME TECNICO DE INGENIERIA</h1>
      <p className="mt-1 text-sm text-slate-500">Analisis de Infraestructura Electrica para Movilidad Electrica (VE)</p>
      <p className="mt-3 text-sm">
        <strong>Ubicacion:</strong> {inf.edificio_nombre || '-'}{inf.direccion ? `, ${inf.direccion}` : ''}<br />
        <strong>Cliente:</strong> {inf.apellido}, {inf.nombre}<br />
        <strong>Version:</strong> {inf.version}
      </p>

      <h2 className="mt-8 border-b-2 border-blue-600 pb-1 text-lg font-bold text-blue-700">1. Relevamiento de infraestructura</h2>
      <table className="mt-2 w-full text-sm">
        <tbody>
          <tr className="border-b border-slate-100"><td className="w-1/2 py-1.5 text-slate-500">Unidades funcionales</td><td className="py-1.5">{inf.uf_count ?? '-'}</td></tr>
          <tr className="border-b border-slate-100"><td className="py-1.5 text-slate-500">Plazas de estacionamiento</td><td className="py-1.5">{inf.cocheras_count ?? '-'}</td></tr>
        </tbody>
      </table>

      <h2 className="mt-8 border-b-2 border-blue-600 pb-1 text-lg font-bold text-blue-700">2. Capacidad de suministro</h2>
      <table className="mt-2 w-full text-sm">
        <tbody>
          <tr className="border-b border-slate-100"><td className="w-1/2 py-1.5 text-slate-500">Potencia contratada</td><td className="py-1.5">{calculos.suministro.potencia_contratada} kW</td></tr>
          <tr className="border-b border-slate-100"><td className="py-1.5 text-slate-500">Demanda maxima registrada</td><td className="py-1.5">{calculos.suministro.demanda_maxima} kW</td></tr>
          <tr className="border-b border-slate-100"><td className="py-1.5 text-slate-500">Margen disponible</td><td className="py-1.5">{calculos.suministro.margen_kw} kW</td></tr>
          <tr className="border-b border-slate-100"><td className="py-1.5 text-slate-500">Estado</td><td className="py-1.5 font-semibold">{calculos.suministro.estado}</td></tr>
        </tbody>
      </table>

      {calculos.cargadores.length > 0 && (
        <>
          <h2 className="mt-8 border-b-2 border-blue-600 pb-1 text-lg font-bold text-blue-700">3. Analisis de riesgo de cargadores existentes</h2>
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
                <th className="py-1.5">Equipo</th><th className="py-1.5">Fases</th><th className="py-1.5 text-right">Potencia</th><th className="py-1.5 text-right">Corriente</th>
              </tr>
            </thead>
            <tbody>
              {calculos.cargadores.map((c, i) => (
                <tr key={i} className="border-b border-slate-100 align-top">
                  <td className="py-1.5">{c.marca_modelo || '-'}</td>
                  <td className="py-1.5">{c.fases}</td>
                  <td className="py-1.5 text-right">{c.potencia_kw} kW</td>
                  <td className="py-1.5 text-right">{c.corriente_a} A</td>
                </tr>
              ))}
            </tbody>
          </table>
          {calculos.cargadores.map((c, i) => (
            <p key={i} className="mt-2 text-xs text-slate-600">
              <strong>{c.marca_modelo || `Equipo ${i + 1}`}:</strong> {c.nota}
            </p>
          ))}
        </>
      )}

      <h2 className="mt-8 border-b-2 border-blue-600 pb-1 text-lg font-bold text-blue-700">4. Planificacion de infraestructura</h2>
      <p className="mt-2 text-sm"><strong>Opcion A - Maximizar Tarifa T2 (49,9 kW):</strong> {calculos.tarifa_comparativa.opcion_a_nota} Remanente estimado {calculos.tarifa_comparativa.opcion_a_remanente_kw} kW.</p>
      <p className="mt-2 text-sm"><strong>Opcion B - Tarifa T3 (+50 kW):</strong> {calculos.tarifa_comparativa.opcion_b_nota}</p>

      {calculos.generador && (
        <>
          <h2 className="mt-8 border-b-2 border-blue-600 pb-1 text-lg font-bold text-blue-700">5. Sistema de respaldo (grupo electrogeno)</h2>
          <table className="mt-2 w-full text-sm">
            <tbody>
              <tr className="border-b border-slate-100"><td className="w-1/2 py-1.5 text-slate-500">Potencia nominal</td><td className="py-1.5">{calculos.generador.potencia_kva} kVA</td></tr>
              <tr className="border-b border-slate-100"><td className="py-1.5 text-slate-500">Corriente nominal / ajuste de disparo</td><td className="py-1.5">{calculos.generador.corriente_nominal} A / {calculos.generador.ajuste_disparo_pct}%</td></tr>
              <tr className="border-b border-slate-100"><td className="py-1.5 text-slate-500">Corriente real disponible</td><td className="py-1.5">{calculos.generador.corriente_real_a} A</td></tr>
              <tr className="border-b border-slate-100"><td className="py-1.5 text-slate-500 font-semibold">Potencia activa maxima disponible</td><td className="py-1.5 font-semibold">{calculos.generador.potencia_max_kw} kW</td></tr>
            </tbody>
          </table>
        </>
      )}

      <h2 className="mt-8 border-b-2 border-blue-600 pb-1 text-lg font-bold text-blue-700">6. Conclusion</h2>
      <p className="mt-2 text-sm text-slate-700">
        El presente relevamiento establece la infraestructura de recarga de vehiculos electricos (IRVE) segun lo detallado en las
        secciones anteriores, en conformidad con la reglamentacion AEA 90364-7-722 (Instalaciones Electricas en Inmuebles -
        Suministro para Vehiculos Electricos). Se recomienda una arquitectura centralizada con gestion dinamica de carga (DLM)
        bajo protocolo OCPP para garantizar que la sumatoria de potencia de los cargadores nunca supere el limite fisico de la
        acometida principal.
      </p>

      <div className="mt-16 flex flex-col items-center break-inside-avoid">
        {inf.estado === 'firmado' ? (
          <>
            {inf.firma_datos && <img src={inf.firma_datos} alt="Firma" className="h-20 w-auto" />}
            <p className="mt-1 border-t border-slate-400 px-8 pt-1 text-center text-sm font-semibold">{inf.firmado_por}</p>
            <p className="text-xs text-slate-500">Matricula {inf.firmado_matricula}</p>
            <p className="text-xs text-slate-400">Firmado el {new Date(inf.fecha_firma).toLocaleDateString('es-AR')}</p>
          </>
        ) : (
          <p className="text-sm italic text-slate-400">Pendiente de firma</p>
        )}
      </div>

      <p className="mt-10 text-center text-xs text-slate-400">BILON Smart Buildings - Gestion inteligente de edificios</p>
    </div>
  );
}
