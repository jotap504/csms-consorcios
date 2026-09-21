import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Printer } from 'lucide-react';
import { api } from '@/lib/api';

const money = (n, moneda = 'ARS') => `${moneda === 'USD' ? 'US$' : '$'}${Number(n ?? 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Vista interna: a diferencia de CotizacionImprimir.jsx, aca SI se muestra
// costo, precio base (sin margen) y margen resultante por linea/categoria -
// solo alcanzable desde el wizard, nunca para el cliente.
export default function CotizacionBOMInterno() {
  const { id } = useParams();
  const [q, setQ] = useState(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    api.get(`/comercial/cotizaciones/${id}`).then(({ data }) => setQ(data));
  }, [id]);

  if (!q) return null;

  const margenFactor = 1 + (Number(q.margen_pct) || 0) / 100;

  const categorias = [];
  for (const linea of q.bom || []) {
    const costo = linea.costo != null ? Number(linea.costo) : null;
    const precioBase = Number(linea.precio_unitario) || 0;
    const precioFinal = precioBase * margenFactor;
    const cantidad = Number(linea.cantidad) || 0;
    const subtotalCosto = costo != null ? costo * cantidad : null;
    const subtotalFinal = cantidad * precioFinal;
    let cat = categorias.find((c) => c.nombre === linea.categoria);
    if (!cat) { cat = { nombre: linea.categoria, lineas: [], subtotalCosto: 0, subtotalFinal: 0, sinCosto: false }; categorias.push(cat); }
    cat.lineas.push({ ...linea, costo, precioBase, precioFinal, cantidad, subtotalCosto, subtotalFinal });
    if (costo != null) cat.subtotalCosto += subtotalCosto; else cat.sinCosto = true;
    cat.subtotalFinal += subtotalFinal;
  }
  const totalCosto = categorias.reduce((s, c) => s + c.subtotalCosto, 0);
  const totalFinal = categorias.reduce((s, c) => s + c.subtotalFinal, 0);
  const gananciaTotal = totalFinal - totalCosto;

  return (
    <div className="mx-auto max-w-4xl bg-white px-4 py-6 text-slate-900 sm:px-8 sm:py-10 print:px-0 print:py-0">
      <button
        type="button"
        onClick={() => window.print()}
        className="mb-6 flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white print:hidden"
      >
        <Printer className="h-4 w-4" />Imprimir / Guardar como PDF
      </button>

      <h1 className="text-2xl font-bold">Detalle interno de items - {q.codigo || `Cotizacion #${q.id}`}</h1>
      <p className="text-sm text-slate-500">{q.apellido}, {q.nombre} - {q.edificio?.nombre || 'sin edificio'} - Margen aplicado: {Number(q.margen_pct) || 0}%</p>
      <p className="mt-1 text-xs font-semibold uppercase text-rose-600">Uso interno - nunca compartir con el cliente</p>

      {(q.bom || []).length === 0 && <p className="mt-8 text-sm text-slate-500">Sin items todavia. Genera el presupuesto primero.</p>}

      {categorias.map((cat) => (
        <div key={cat.nombre} className="mt-8 break-inside-avoid">
          <h2 className="border-b-2 border-blue-600 pb-1 text-lg font-bold text-blue-700">{cat.nombre}</h2>
          <div className="mt-1 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
                  <th className="py-1.5">Concepto</th>
                  <th className="py-1.5 text-right">Cant.</th>
                  <th className="py-1.5 text-right">Costo unit.</th>
                  <th className="py-1.5 text-right">Precio base</th>
                  <th className="py-1.5 text-right">Precio final</th>
                  <th className="py-1.5 text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {cat.lineas.map((l, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="py-1.5">
                      {l.descripcion}
                      {l.pendiente_precio && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">pendiente precio</span>}
                      {l.estimado && <span className="ml-2 rounded bg-rose-100 px-1.5 py-0.5 text-xs text-rose-700">* buscado por IA - revisar</span>}
                      {l.fuente_ia && (
                        <a href={l.fuente_ia} target="_blank" rel="noreferrer" className="ml-2 text-xs text-blue-600 underline">
                          ver fuente
                        </a>
                      )}
                    </td>
                    <td className="py-1.5 text-right">{l.cantidad} {l.unidad}</td>
                    <td className="py-1.5 text-right">{l.costo != null ? money(l.costo, q.moneda) : '-'}</td>
                    <td className="py-1.5 text-right">{money(l.precioBase, q.moneda)}</td>
                    <td className="py-1.5 text-right">{money(l.precioFinal, q.moneda)}</td>
                    <td className="py-1.5 text-right font-semibold">{money(l.subtotalFinal, q.moneda)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-right text-sm">
            Costo: {cat.sinCosto ? '(incompleto)' : money(cat.subtotalCosto, q.moneda)} &nbsp;|&nbsp;
            <span className="font-bold"> Subtotal final: {money(cat.subtotalFinal, q.moneda)}</span>
          </p>
        </div>
      ))}

      <div className="mt-8 break-inside-avoid rounded-lg bg-slate-50 p-4 text-right">
        <p className="text-sm text-slate-600">Costo total (BilOn): {money(totalCosto, q.moneda)}</p>
        <p className="text-sm text-slate-600">Total facturado (sin IVA): {money(totalFinal, q.moneda)}</p>
        <p className="text-lg font-bold text-emerald-700">Ganancia estimada: {money(gananciaTotal, q.moneda)}</p>
      </div>
    </div>
  );
}
