import { useState, useEffect, useRef } from 'react';
import { Zap, Play, Square } from 'lucide-react';
import { api } from '@/lib/api';

export default function OcppPublicTest() {
  const [ocppId, setOcppId] = useState('');
  const [version, setVersion] = useState('2.0.1');
  const [linked, setLinked] = useState(false);
  const [estado, setEstado] = useState(null);
  const [ampsInput, setAmpsInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pollRef = useRef(null);

  async function loadEstado(id) {
    try {
      const { data } = await api.get(`/public/ocpp-test/${encodeURIComponent(id)}/estado`);
      setEstado(data);
    } catch {
      // keep last known state on a transient failure
    }
  }

  function handleLink(e) {
    e.preventDefault();
    if (!ocppId.trim()) return;
    setLinked(true);
    setError('');
    loadEstado(ocppId.trim());
    pollRef.current = setInterval(() => loadEstado(ocppId.trim()), 4000);
  }

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  async function handleIniciar() {
    setBusy(true);
    setError('');
    try {
      await api.post(`/public/ocpp-test/${encodeURIComponent(ocppId)}/iniciar`, { version });
      await loadEstado(ocppId);
    } catch (err) {
      setError(err.response?.data?.error ?? 'Error al iniciar.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDetener() {
    setBusy(true);
    setError('');
    try {
      await api.post(`/public/ocpp-test/${encodeURIComponent(ocppId)}/detener`, { version });
      await loadEstado(ocppId);
    } catch (err) {
      setError(err.response?.data?.error ?? 'Error al detener.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSetAmps() {
    const amps = Number(ampsInput);
    if (!amps || amps <= 0) return;
    setBusy(true);
    setError('');
    try {
      await api.post(`/public/ocpp-test/${encodeURIComponent(ocppId)}/set-amps`, { version, amps });
      await loadEstado(ocppId);
    } catch (err) {
      setError(err.response?.data?.error ?? 'Error al setear amps.');
    } finally {
      setBusy(false);
    }
  }

  const enCarga = !!estado?.transaction_id_ocpp;

  return (
    <div className="flex min-h-dvh flex-col items-center bg-slate-50 px-4 py-10">
      <div className="flex w-full max-w-md items-center gap-2">
        <img src="/logo.png" alt="BILON" className="h-7 w-auto" />
        <span className="text-sm font-medium text-slate-500">Tester OCPP</span>
      </div>

      <div className="mt-8 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        {!linked ? (
          <form onSubmit={handleLink} className="flex flex-col gap-4">
            <div>
              <h1 className="text-lg font-semibold text-slate-900">Probá tu wallbox</h1>
              <p className="mt-1 text-sm text-slate-500">
                Conectá tu equipo a <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">wss://{window.location.host}/ocpp/&lt;ID&gt;</code>{' '}
                y escribí acá el mismo ID para ver el resultado. Sin usuario ni contraseña.
              </p>
            </div>
            <div>
              <label htmlFor="ocpp_id" className="mb-1 block text-sm font-medium text-slate-700">ID OCPP de tu equipo</label>
              <input
                id="ocpp_id"
                required
                value={ocppId}
                onChange={(e) => setOcppId(e.target.value)}
                placeholder="Ej: MI-WALLBOX-01"
                className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              />
            </div>
            <div>
              <label htmlFor="version" className="mb-1 block text-sm font-medium text-slate-700">Version OCPP</label>
              <select
                id="version"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <option value="2.0.1">2.0.1</option>
                <option value="1.6">1.6J</option>
              </select>
            </div>
            <button type="submit" className="mt-1 flex h-11 cursor-pointer items-center justify-center gap-2 rounded-lg bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700">
              <Zap className="h-4 w-4" /> Enlazar y ver estado
            </button>
          </form>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-mono text-sm font-medium text-slate-900">{ocppId}</p>
                <p className="text-xs text-slate-500">OCPP {version}</p>
              </div>
              <button type="button" onClick={() => { setLinked(false); clearInterval(pollRef.current); setEstado(null); }} className="cursor-pointer text-xs text-slate-400 hover:text-slate-600">
                Cambiar
              </button>
            </div>

            <div className="rounded-xl bg-slate-50 p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Conectado</span>
                <span className={estado?.conectado_citrineos ? 'font-medium text-emerald-600' : 'font-medium text-slate-400'}>
                  {estado?.conectado_citrineos ? 'Si' : 'No'}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-slate-500">Reportado por el equipo</span>
                <span className="text-right font-medium text-slate-700">
                  {estado?.vendor_reportado || estado?.modelo_reportado
                    ? `${estado?.vendor_reportado ?? ''} ${estado?.modelo_reportado ?? ''}`.trim()
                    : '-'}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-slate-500">Estado conector</span>
                <span className="font-medium text-slate-700">{estado?.status_ocpp ?? '-'}</span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-slate-500">Cargando</span>
                <span className={enCarga ? 'font-medium text-emerald-600' : 'font-medium text-slate-400'}>{enCarga ? 'Si' : 'No'}</span>
              </div>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex items-center gap-2">
              <input
                type="number"
                min="6"
                placeholder="Amps"
                value={ampsInput}
                onChange={(e) => setAmpsInput(e.target.value)}
                className="h-10 w-24 rounded-lg border border-slate-300 px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              />
              <button type="button" disabled={busy} onClick={handleSetAmps} className="h-10 cursor-pointer rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                Setear amps
              </button>
            </div>

            {enCarga ? (
              <button type="button" disabled={busy} onClick={handleDetener} className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-lg bg-red-600 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
                <Square className="h-4 w-4" /> Detener
              </button>
            ) : (
              <button type="button" disabled={busy} onClick={handleIniciar} className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-lg bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                <Play className="h-4 w-4" /> Iniciar
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
