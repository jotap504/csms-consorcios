import { useState, useEffect, useRef } from 'react';
import { Zap, Play, Square, Stethoscope } from 'lucide-react';
import { api } from '@/lib/api';

function Badge({ children, tone }) {
  const tones = {
    ok: 'bg-emerald-100 text-emerald-700',
    bad: 'bg-red-100 text-red-700',
    warn: 'bg-amber-100 text-amber-700',
    neutral: 'bg-slate-100 text-slate-500',
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone] ?? tones.neutral}`}>{children}</span>;
}

export default function OcppPublicTest() {
  const [ocppId, setOcppId] = useState('');
  const [version, setVersion] = useState('2.0.1');
  const [linked, setLinked] = useState(false);
  const [estado, setEstado] = useState(null);
  const [consumo, setConsumo] = useState(null);
  const [ampsInput, setAmpsInput] = useState('');
  const [ampsResultado, setAmpsResultado] = useState(null);
  const [schedule, setSchedule] = useState(null);
  const [capacidades, setCapacidades] = useState(null);
  const [busy, setBusy] = useState(false);
  const [diagBusy, setDiagBusy] = useState(false);
  const [error, setError] = useState('');
  const pollRef = useRef(null);

  async function loadEstado(id) {
    try {
      const { data } = await api.get(`/public/ocpp-test/${encodeURIComponent(id)}/estado`);
      setEstado(data);
    } catch {
      // keep last known state on a transient failure
    }
    try {
      const { data } = await api.get(`/public/ocpp-test/${encodeURIComponent(id)}/consumo`);
      setConsumo(data);
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
    setAmpsResultado(null);
    setSchedule(null);
    try {
      const { data } = await api.post(`/public/ocpp-test/${encodeURIComponent(ocppId)}/set-amps`, { version, amps });
      setAmpsResultado({ amps, ...data });
      await loadEstado(ocppId);
    } catch (err) {
      setError(err.response?.data?.error ?? 'Error al setear amps.');
    } finally {
      setBusy(false);
    }
  }

  async function handleVerSchedule() {
    setBusy(true);
    setError('');
    try {
      const { data } = await api.get(`/public/ocpp-test/${encodeURIComponent(ocppId)}/composite-schedule`);
      setSchedule(data.resultado);
    } catch (err) {
      setError(err.response?.data?.error ?? 'Error al consultar el schedule.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDiagnostico() {
    setDiagBusy(true);
    setError('');
    try {
      const { data } = await api.get(`/public/ocpp-test/${encodeURIComponent(ocppId)}/capacidades`);
      setCapacidades(data);
    } catch (err) {
      setError(err.response?.data?.error ?? 'Error al correr el diagnostico.');
    } finally {
      setDiagBusy(false);
    }
  }

  function capBadge(status) {
    if (status === 'Accepted') return <Badge tone="ok">Soportado</Badge>;
    if (status === 'UnknownVariable' || status === 'UnknownComponent') return <Badge tone="bad">No implementado</Badge>;
    if (!status) return <Badge tone="neutral">Sin respuesta</Badge>;
    return <Badge tone="warn">{status}</Badge>;
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
              <p className="mt-2 border-t border-slate-100 pt-2 text-sm text-slate-500">
                Connect your device to <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">wss://{window.location.host}/ocpp/&lt;ID&gt;</code>{' '}
                then enter the same ID below to see the result. No username or password needed.
              </p>
              <a href="/ocpp-log" className="mt-2 inline-block text-sm font-medium text-blue-600 hover:underline">
                Ver todas las conexiones recientes / See all recent connections →
              </a>
              <a href="/ocpp-selftest" className="mt-1 inline-block text-sm font-medium text-blue-600 hover:underline">
                ¿Tu equipo no conecta? Probar si nuestro servidor funciona / Device won't connect? Test if our server works →
              </a>
            </div>
            <div>
              <label htmlFor="ocpp_id" className="mb-1 block text-sm font-medium text-slate-700">ID OCPP de tu equipo / Device OCPP ID</label>
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
              <label htmlFor="version" className="mb-1 block text-sm font-medium text-slate-700">Version OCPP / OCPP Version</label>
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
              <Zap className="h-4 w-4" /> Enlazar y ver estado / Link and view status
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
                Cambiar / Change
              </button>
            </div>

            <div className="rounded-xl bg-slate-50 p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Conectado / Connected</span>
                <span className={estado?.conectado_citrineos ? 'font-medium text-emerald-600' : 'font-medium text-slate-400'}>
                  {estado?.conectado_citrineos ? 'Si / Yes' : 'No'}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-slate-500">Reportado por el equipo / Reported by device</span>
                <span className="text-right font-medium text-slate-700">
                  {estado?.vendor_reportado || estado?.modelo_reportado
                    ? `${estado?.vendor_reportado ?? ''} ${estado?.modelo_reportado ?? ''}`.trim()
                    : '-'}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-slate-500">N° de serie / Serial number</span>
                <span className="font-mono text-xs font-medium text-slate-700">{estado?.numero_serie || '-'}</span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-slate-500">Firmware</span>
                <span className="font-mono text-xs font-medium text-slate-700">{estado?.firmware || '-'}</span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-slate-500">Estado conector / Connector status</span>
                <span className="font-medium text-slate-700">{estado?.status_ocpp ?? '-'}</span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-slate-500">Cargando / Charging</span>
                <span className={enCarga ? 'font-medium text-emerald-600' : 'font-medium text-slate-400'}>{enCarga ? 'Si / Yes' : 'No'}</span>
              </div>
              {consumo?.energia_wh != null && (
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-slate-500">Energia acumulada / Accumulated energy</span>
                  <span className="font-medium text-slate-700">{(consumo.energia_wh / 1000).toFixed(3)} kWh</span>
                </div>
              )}
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex flex-col gap-2">
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
                  Setear amps / Set amps
                </button>
              </div>
              {ampsResultado && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-500">{ampsResultado.amps}A →</span>
                  {ampsResultado.aplicado ? <Badge tone="ok">Accepted</Badge> : <Badge tone="bad">{ampsResultado.status}</Badge>}
                  {version === '2.0.1' && (
                    <button type="button" onClick={handleVerSchedule} className="cursor-pointer text-blue-600 hover:underline">
                      Ver schedule real / Check real schedule
                    </button>
                  )}
                </div>
              )}
              {schedule && (
                <pre className="overflow-x-auto rounded-lg bg-slate-900 p-2 text-xs text-slate-100">{JSON.stringify(schedule, null, 2)}</pre>
              )}
            </div>

            {enCarga ? (
              <button type="button" disabled={busy} onClick={handleDetener} className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-lg bg-red-600 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
                <Square className="h-4 w-4" /> Detener / Stop
              </button>
            ) : (
              <button type="button" disabled={busy} onClick={handleIniciar} className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-lg bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                <Play className="h-4 w-4" /> Iniciar / Start
              </button>
            )}

            {version === '2.0.1' && (
              <div className="border-t border-slate-100 pt-4">
                <button
                  type="button"
                  disabled={diagBusy}
                  onClick={handleDiagnostico}
                  className="flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  <Stethoscope className="h-4 w-4" /> {diagBusy ? 'Corriendo diagnostico... / Running diagnostics...' : 'Diagnostico de compatibilidad / Compatibility diagnostic'}
                </button>
                {capacidades && (
                  <div className="mt-3 flex flex-col gap-2 rounded-xl bg-slate-50 p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Smart Charging (SetChargingProfile)</span>
                      {capBadge(capacidades.smart_charging_status)}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Display Message</span>
                      {capBadge(capacidades.display_message_status)}
                    </div>
                    <div>
                      <span className="text-slate-600">Medicion en tiempo real / Live metering</span>
                      <p className="mt-1 text-xs font-medium text-slate-700">
                        {capacidades.medicion_tiempo_real || 'Sin respuesta / No response'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
