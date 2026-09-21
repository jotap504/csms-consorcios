import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Printer } from 'lucide-react';
import { api } from '@/lib/api';

const money = (n, moneda = 'ARS') => `${moneda === 'USD' ? 'US$' : '$'}${Number(n ?? 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const soloFecha = (v) => (v ? String(v).slice(0, 10) : '');

export default function PresupuestoImprimir() {
  const { id } = useParams();
  const [p, setP] = useState(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    api.get(`/comercial/presupuestos/${id}`).then(({ data }) => setP(data));
  }, [id]);

  if (!p) return null;

  const totalGeneral = (p.opciones ?? []).reduce((s, o) => s + Number(o.total ?? 0), 0);

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

      <h1 className="mt-6 text-2xl font-bold">PROPUESTA TECNICO-COMERCIAL</h1>

      <table className="mt-4 w-full text-sm">
        <tbody>
          <tr className="border-b border-slate-100">
            <td className="w-1/3 py-1.5 font-semibold text-slate-500">Para</td>
            <td className="py-1.5">{p.apellido}, {p.nombre}{p.administracion_empresa ? ` - ${p.administracion_empresa}` : ''}</td>
          </tr>
          <tr className="border-b border-slate-100">
            <td className="py-1.5 font-semibold text-slate-500">Fecha de emision</td>
            <td className="py-1.5">{soloFecha(p.fecha)}</td>
          </tr>
          {p.validez_hasta && (
            <tr className="border-b border-slate-100">
              <td className="py-1.5 font-semibold text-slate-500">Validez de la oferta</td>
              <td className="py-1.5">{soloFecha(p.validez_hasta)}</td>
            </tr>
          )}
          <tr className="border-b border-slate-100">
            <td className="py-1.5 font-semibold text-slate-500">Contacto</td>
            <td className="py-1.5">{p.email || '-'} {p.telefono ? `/ ${p.telefono}` : ''}</td>
          </tr>
        </tbody>
      </table>

      {(p.opciones ?? []).map((opcion, idx) => (
        <div key={idx} className="mt-8 break-inside-avoid">
          <h2 className="border-b-2 border-blue-600 pb-1 text-lg font-bold text-blue-700">{opcion.nombre}</h2>

          {opcion.items?.length > 0 && (
            <>
              <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Materiales</p>
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
                  {opcion.items.map((it, i) => (
                    <tr key={i} className="border-b border-slate-100">
                      <td className="py-1.5">{it.nombre}</td>
                      <td className="py-1.5 text-right">{it.cantidad} {it.unidad}</td>
                      <td className="py-1.5 text-right">{money(it.precio_unitario, p.moneda)}</td>
                      <td className="py-1.5 text-right">{money(Number(it.cantidad) * Number(it.precio_unitario), p.moneda)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {opcion.mano_obra?.length > 0 && (
            <>
              <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Mano de obra</p>
              <table className="mt-1 w-full text-sm">
                <tbody>
                  {opcion.mano_obra.map((m, i) => (
                    <tr key={i} className="border-b border-slate-100">
                      <td className="py-1.5">{m.concepto}</td>
                      <td className="py-1.5 text-right">{money(m.monto, p.moneda)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <p className="mt-2 text-right text-base font-bold">Total {opcion.nombre}: {money(opcion.total, p.moneda)}</p>
        </div>
      ))}

      <p className="mt-8 border-t-2 border-slate-900 pt-3 text-right text-xl font-bold">
        Total general: {money(totalGeneral, p.moneda)}
      </p>

      {p.clausulas && (
        <div className="mt-10 break-inside-avoid">
          <h2 className="border-b border-slate-200 pb-1 text-sm font-bold uppercase text-slate-500">Condiciones comerciales</h2>
          <p className="mt-2 whitespace-pre-line text-xs text-slate-600">{p.clausulas}</p>
        </div>
      )}

      <p className="mt-10 text-center text-xs text-slate-400">Smart & Safe / BILON - Gestion inteligente de edificios</p>
    </div>
  );
}
