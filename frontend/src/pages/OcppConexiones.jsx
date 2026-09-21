import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

function timeAgo(iso) {
  if (!iso) return '-';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'ahora / just now';
  if (mins < 60) return `hace ${mins}min / ${mins}min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours}h / ${hours}h ago`;
  return `hace ${Math.floor(hours / 24)}d / ${Math.floor(hours / 24)}d ago`;
}

export default function OcppConexiones() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    api.get('/public/ocpp-test/conexiones')
      .then(({ data }) => setRows(data))
      .catch((err) => setError(err.response?.data?.error ?? 'No se pudo cargar el listado / Could not load the list.'));
  }, []);

  return (
    <div className="flex min-h-dvh flex-col items-center bg-slate-50 px-4 py-10">
      <div className="flex w-full max-w-3xl items-center gap-2">
        <img src="/logo.png" alt="BILON" className="h-7 w-auto" />
        <span className="text-sm font-medium text-slate-500">Conexiones OCPP recientes / Recent OCPP connections</span>
      </div>

      <div className="mt-8 w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">Todos los intentos de conexion / All connection attempts</h1>
        <p className="mt-1 text-sm text-slate-500">
          Buscá tu ID en esta lista para confirmar si tu equipo llegó a conectarse. Sin usuario ni contraseña.
        </p>
        <p className="mt-1 text-sm text-slate-500">
          Search for your ID in this list to confirm whether your device reached us. No username or password needed.
        </p>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        {!error && !rows && <p className="mt-4 text-sm text-slate-500">Cargando... / Loading...</p>}

        {rows && rows.length === 0 && (
          <p className="mt-4 text-sm text-slate-500">Todavia no hay conexiones registradas / No connections recorded yet.</p>
        )}

        {rows && rows.length > 0 && (
          <div className="mt-4 w-full overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="py-2 pr-3">ID OCPP</th>
                  <th className="py-2 pr-3">Fabricante / Vendor</th>
                  <th className="py-2 pr-3">Modelo / Model</th>
                  <th className="py-2 pr-3">Protocolo</th>
                  <th className="py-2 pr-3">Conectado / Online</th>
                  <th className="py-2">Ultima actividad / Last activity</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.ocpp_id} className="border-b border-slate-100">
                    <td className="py-2 pr-3 font-mono text-xs text-slate-900">{r.ocpp_id}</td>
                    <td className="py-2 pr-3 text-slate-700">{r.vendor || '-'}</td>
                    <td className="py-2 pr-3 text-slate-700">{r.modelo || '-'}</td>
                    <td className="py-2 pr-3 text-slate-700">{r.protocolo || '-'}</td>
                    <td className="py-2 pr-3">
                      <span className={r.conectado ? 'font-medium text-emerald-600' : 'font-medium text-slate-400'}>
                        {r.conectado ? 'Si / Yes' : 'No'}
                      </span>
                    </td>
                    <td className="py-2 text-slate-500">{timeAgo(r.ultima_actividad)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-6 flex items-center gap-4 text-sm">
          <a href="/ocpp-test" className="font-medium text-blue-600 hover:underline">
            ← Probar mi propio equipo / Test my own device
          </a>
          <a href="/ocpp-selftest" className="font-medium text-blue-600 hover:underline">
            Autodiagnostico del servidor / Server self-test →
          </a>
        </div>
      </div>
    </div>
  );
}
