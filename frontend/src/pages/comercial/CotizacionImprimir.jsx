import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Printer } from 'lucide-react';
import { api } from '@/lib/api';

const money = (n, moneda = 'ARS') => `${moneda === 'USD' ? 'US$' : '$'}${Number(n ?? 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const soloFecha = (v) => (v ? String(v).slice(0, 10) : '');

// Vista cliente: nunca muestra costo interno, item de catalogo/codigo, ni el
// porcentaje de margen por separado - el margen ya viene aplicado en el
// precio unitario mostrado por linea (marketing/cotizador.md seccion 42).
export default function CotizacionImprimir() {
  const { id } = useParams();
  const [q, setQ] = useState(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    api.get(`/comercial/cotizaciones/${id}`).then(({ data }) => setQ(data));
  }, [id]);

  if (!q) return null;

  const itemsPendientes = (q.bom || []).filter((l) => l.pendiente_precio).length;
  if (itemsPendientes > 0) {
    return (
      <div className="mx-auto max-w-lg px-8 py-16 text-center text-slate-900">
        <p className="text-lg font-semibold text-rose-700">No se puede mostrar esta cotizacion todavia</p>
        <p className="mt-2 text-sm text-slate-600">
          Hay {itemsPendientes} item(s) del presupuesto sin precio cargado. Volve al cotizador y completalos antes de generar la vista de impresion.
        </p>
      </div>
    );
  }

  const margenFactor = 1 + (Number(q.margen_pct) || 0) / 100;
  const ivaFactor = (Number(q.iva_pct) || 0) / 100;

  const categorias = [];
  for (const linea of q.bom || []) {
    const precioFinal = (Number(linea.precio_unitario) || 0) * margenFactor;
    const subtotal = (Number(linea.cantidad) || 0) * precioFinal;
    let cat = categorias.find((c) => c.nombre === linea.categoria);
    if (!cat) { cat = { nombre: linea.categoria, lineas: [], subtotal: 0 }; categorias.push(cat); }
    cat.lineas.push({ descripcion: linea.descripcion, unidad: linea.unidad, cantidad: linea.cantidad, precioFinal, subtotal });
    cat.subtotal += subtotal;
  }
  const subtotalGeneral = categorias.reduce((s, c) => s + c.subtotal, 0);
  const ivaMonto = subtotalGeneral * ivaFactor;
  const totalGeneral = subtotalGeneral + ivaMonto;

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

      <h1 className="mt-6 text-2xl font-bold">COTIZACION DE INFRAESTRUCTURA EV</h1>
      {q.codigo && <p className="text-sm text-slate-500">{q.codigo}</p>}

      <table className="mt-4 w-full text-sm">
        <tbody>
          <tr className="border-b border-slate-100">
            <td className="w-1/3 py-1.5 font-semibold text-slate-500">Para</td>
            <td className="py-1.5">{q.apellido}, {q.nombre}{q.administracion_empresa ? ` - ${q.administracion_empresa}` : ''}</td>
          </tr>
          <tr className="border-b border-slate-100">
            <td className="py-1.5 font-semibold text-slate-500">Edificio</td>
            <td className="py-1.5">{q.edificio?.nombre || '-'} {q.edificio?.direccion ? `- ${q.edificio.direccion}` : ''}</td>
          </tr>
          <tr className="border-b border-slate-100">
            <td className="py-1.5 font-semibold text-slate-500">Fecha de emision</td>
            <td className="py-1.5">{soloFecha(q.fecha)}</td>
          </tr>
          {q.validez_hasta && (
            <tr className="border-b border-slate-100">
              <td className="py-1.5 font-semibold text-slate-500">Validez de la oferta</td>
              <td className="py-1.5">{soloFecha(q.validez_hasta)}</td>
            </tr>
          )}
          <tr className="border-b border-slate-100">
            <td className="py-1.5 font-semibold text-slate-500">Contacto</td>
            <td className="py-1.5">{q.email || '-'} {q.telefono ? `/ ${q.telefono}` : ''}</td>
          </tr>
        </tbody>
      </table>

      {categorias.length === 0 && <p className="mt-8 text-sm text-slate-500">Presupuesto sin items todavia.</p>}

      {categorias.map((cat) => (
        <div key={cat.nombre} className="mt-8 break-inside-avoid">
          <h2 className="border-b-2 border-blue-600 pb-1 text-lg font-bold text-blue-700">{cat.nombre}</h2>
          <table className="mt-1 w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
                <th className="py-1.5">Concepto</th>
                <th className="py-1.5 text-right">Cantidad</th>
                <th className="py-1.5 text-right">Precio unitario</th>
                <th className="py-1.5 text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {cat.lineas.map((l, i) => (
                <tr key={i} className="border-b border-slate-100">
                  <td className="py-1.5">{l.descripcion}</td>
                  <td className="py-1.5 text-right">{l.cantidad} {l.unidad}</td>
                  <td className="py-1.5 text-right">{money(l.precioFinal, q.moneda)}</td>
                  <td className="py-1.5 text-right">{money(l.subtotal, q.moneda)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-right text-base font-bold">Subtotal {cat.nombre}: {money(cat.subtotal, q.moneda)}</p>
        </div>
      ))}

      <div className="mt-8 border-t-2 border-slate-900 pt-3 text-right">
        <p className="text-sm text-slate-600">Subtotal: {money(subtotalGeneral, q.moneda)}</p>
        <p className="text-sm text-slate-600">IVA ({Number(q.iva_pct) || 0}%): {money(ivaMonto, q.moneda)}</p>
        <p className="text-xl font-bold">Total general: {money(totalGeneral, q.moneda)}</p>
      </div>

      <div className="mt-10 break-inside-avoid rounded-lg bg-amber-50 p-4">
        <p className="text-xs text-amber-800">{q.disclaimer_predimensionado}</p>
      </div>

      {q.clausulas && (
        <div className="mt-6 break-inside-avoid">
          <h2 className="border-b border-slate-200 pb-1 text-sm font-bold uppercase text-slate-500">Condiciones comerciales</h2>
          <p className="mt-2 whitespace-pre-line text-xs text-slate-600">{q.clausulas}</p>
        </div>
      )}

      <p className="mt-10 text-center text-xs text-slate-400">Smart & Safe / BILON - Gestion inteligente de edificios</p>
    </div>
  );
}
