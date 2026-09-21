import { useRef, useState } from 'react';
import { Zap, PlayCircle, CheckCircle2, XCircle, Loader2 } from 'lucide-react';

// Synthetic OCPP charge point: connects to OUR OWN server exactly like real
// hardware would, entirely from the browser (native WebSocket API), and
// reports pass/fail per protocol layer. Purpose: prove whether the CSMS side
// is healthy, independent of any manufacturer's flaky firmware -- isolates
// "our server" vs "their device" as the fault domain.
//
// Uses chargePointVendor "BilonTest" so these synthetic runs are excluded
// from the public /ocpp-log listing (same filter already used for internal
// test fixtures).

const STEP_KEYS = ['tls_ws', 'subprotocol', 'boot', 'heartbeat'];

const STEP_LABELS = {
  tls_ws: { es: 'Conexion TLS + WebSocket', en: 'TLS + WebSocket connection' },
  subprotocol: { es: 'Negociacion de subprotocolo OCPP', en: 'OCPP subprotocol negotiation' },
  boot: { es: 'BootNotification (respuesta del servidor)', en: 'BootNotification (server response)' },
  heartbeat: { es: 'Heartbeat (respuesta del servidor)', en: 'Heartbeat (server response)' },
};

function freshSteps() {
  const s = {};
  for (const k of STEP_KEYS) s[k] = { status: 'pending', detail: '' };
  return s;
}

function runProtocol(version) {
  return new Promise((resolve) => {
    const subproto = version === '1.6' ? 'ocpp1.6' : 'ocpp2.0.1';
    const stationId = `BILON-SELFTEST-${version.replace(/\./g, '')}-${Date.now().toString(36)}`;
    const steps = freshSteps();
    const log = [];
    let settled = false;
    let ws;
    let watchdog;

    function finish(ok) {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      try { ws.close(); } catch { /* already closed */ }
      resolve({ version, stationId, ok, steps, log });
    }

    function mark(key, status, detail) {
      steps[key] = { status, detail };
      log.push(`[${new Date().toISOString().split('T')[1].slice(0, 12)}] ${key}: ${status}${detail ? ` — ${detail}` : ''}`);
    }

    watchdog = setTimeout(() => {
      if (steps.tls_ws.status === 'pending') mark('tls_ws', 'fail', 'timeout (5s) sin abrir conexion / no connection opened');
      for (const k of STEP_KEYS) if (steps[k].status === 'pending') mark(k, 'fail', 'timeout');
      finish(false);
    }, 8000);

    let bootMsgId = null;
    let hbMsgId = null;

    try {
      ws = new WebSocket(`wss://${window.location.host}/ocpp/${stationId}`, [subproto]);
    } catch (err) {
      mark('tls_ws', 'fail', String(err?.message ?? err));
      finish(false);
      return;
    }

    ws.onopen = () => {
      mark('tls_ws', 'ok', 'conectado / connected');
      if (ws.protocol === subproto) {
        mark('subprotocol', 'ok', ws.protocol);
      } else {
        mark('subprotocol', 'fail', `servidor devolvio "${ws.protocol || '(vacio/empty)'}" en vez de "${subproto}"`);
      }
      bootMsgId = `boot-${Date.now()}`;
      // NOTE: deliberately omit chargePointSerialNumber / chargingStation.serialNumber.
      // CitrineOS enforces OCPP's CiString25 limit on those fields and silently rejects
      // the whole BootNotification with FormatViolation if they run long -- discovered
      // via this self-test. A long station id here would trip the same rejection.
      const payload = version === '1.6'
        ? [2, bootMsgId, 'BootNotification', {
          chargePointVendor: 'BilonTest',
          chargePointModel: 'SelfTestProbe',
          firmwareVersion: 'selftest-1.0',
        }]
        : [2, bootMsgId, 'BootNotification', {
          reason: 'PowerUp',
          chargingStation: { model: 'SelfTestProbe', vendorName: 'BilonTest' },
        }];
      ws.send(JSON.stringify(payload));
    };

    ws.onmessage = (evt) => {
      let frame;
      try { frame = JSON.parse(evt.data); } catch { return; }
      const [type, msgId, a, b] = frame;

      if (msgId === bootMsgId) {
        if (type === 3) {
          const status = a?.status;
          if (status === 'Accepted') {
            mark('boot', 'ok', `Accepted, interval=${a?.interval ?? '?'}s`);
            hbMsgId = `hb-${Date.now()}`;
            ws.send(JSON.stringify([2, hbMsgId, 'Heartbeat', {}]));
          } else {
            mark('boot', 'fail', `status=${status}`);
            finish(false);
          }
        } else if (type === 4) {
          mark('boot', 'fail', `CALLERROR: ${a} ${b?.length ? JSON.stringify(b) : ''}`);
          finish(false);
        }
        return;
      }

      if (msgId === hbMsgId) {
        if (type === 3) {
          mark('heartbeat', 'ok', a?.currentTime ?? 'ok');
          finish(true);
        } else {
          mark('heartbeat', 'fail', `CALLERROR: ${a}`);
          finish(false);
        }
      }
    };

    ws.onerror = () => {
      if (steps.tls_ws.status === 'pending') mark('tls_ws', 'fail', 'error de conexion / connection error (ver consola del navegador)');
    };

    ws.onclose = (evt) => {
      if (!settled) {
        for (const k of STEP_KEYS) {
          if (steps[k].status === 'pending') mark(k, 'fail', `conexion cerrada codigo ${evt.code} antes de completar / connection closed before completing`);
        }
        finish(false);
      }
    };
  });
}

function StepRow({ label, step }) {
  const icon = step.status === 'ok'
    ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
    : step.status === 'fail'
      ? <XCircle className="h-4 w-4 text-red-600" />
      : <Loader2 className="h-4 w-4 animate-spin text-slate-400" />;
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 py-2 text-sm last:border-0">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-slate-700">{label.es}</span>
        <span className="text-slate-400">/ {label.en}</span>
      </div>
      <span className="max-w-[45%] text-right text-xs text-slate-500">{step.detail}</span>
    </div>
  );
}

function ResultCard({ result }) {
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-900">OCPP {result.version}</h3>
        <span className={result.ok ? 'text-xs font-medium text-emerald-600' : 'text-xs font-medium text-red-600'}>
          {result.ok ? 'OK — sin problemas / no issues' : 'FALLO / FAILED'}
        </span>
      </div>
      <p className="mt-1 font-mono text-xs text-slate-400">{result.stationId}</p>
      <div className="mt-3">
        {STEP_KEYS.map((k) => <StepRow key={k} label={STEP_LABELS[k]} step={result.steps[k]} />)}
      </div>
    </div>
  );
}

export default function OcppSelfTest() {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null);
  const busyRef = useRef(false);

  async function handleRun() {
    if (busyRef.current) return;
    busyRef.current = true;
    setRunning(true);
    setResults(null);
    const out = [];
    for (const v of ['1.6', '2.0.1']) {
      // eslint-disable-next-line no-await-in-loop
      out.push(await runProtocol(v));
      setResults([...out]);
    }
    setRunning(false);
    busyRef.current = false;
  }

  const allOk = results && results.every((r) => r.ok);
  const anyFail = results && results.some((r) => !r.ok);

  return (
    <div className="flex min-h-dvh flex-col items-center bg-slate-50 px-4 py-10">
      <div className="flex w-full max-w-2xl items-center gap-2">
        <img src="/logo.png" alt="BILON" className="h-7 w-auto" />
        <span className="text-sm font-medium text-slate-500">Autodiagnostico del servidor OCPP / OCPP server self-test</span>
      </div>

      <div className="mt-8 w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">Probamos nuestro propio servidor / We test our own server</h1>
        <p className="mt-2 text-sm text-slate-500">
          Este boton simula un cargador real: abre una conexion WSS con nuestro servidor, negocia el
          subprotocolo OCPP, envia BootNotification y Heartbeat, y muestra exactamente en que paso
          falla algo (si falla). Si esto pasa todo en verde, el servidor esta sano — cualquier problema
          de conexion es del lado del equipo/firmware del fabricante, no de nuestro sistema.
        </p>
        <p className="mt-2 text-sm text-slate-500">
          This button simulates a real charger: opens a WSS connection to our server, negotiates the
          OCPP subprotocol, sends BootNotification and Heartbeat, and shows exactly which step fails
          (if any). If everything passes green, the server is healthy — any connection issue is on the
          manufacturer's device/firmware side, not our system.
        </p>

        <button
          type="button"
          disabled={running}
          onClick={handleRun}
          className="mt-4 flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
          {running ? 'Probando... / Testing...' : 'Ejecutar autodiagnostico / Run self-test'}
        </button>

        {results && (
          <div className="mt-5 flex flex-col gap-3">
            <div className={`rounded-lg px-3 py-2 text-sm font-medium ${allOk ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
              {allOk
                ? 'Servidor OCPP funcionando correctamente en ambas versiones / OCPP server working correctly on both versions.'
                : anyFail
                  ? 'Se encontro un problema en el servidor -- revisar el paso marcado en rojo abajo. / A server-side problem was found -- check the step marked red below.'
                  : ''}
            </div>
            {results.map((r) => <ResultCard key={r.version} result={r} />)}
          </div>
        )}

        <div className="mt-6 flex items-center gap-4 border-t border-slate-100 pt-4 text-sm">
          <a href="/ocpp-test" className="font-medium text-blue-600 hover:underline">← Probar mi propio equipo / Test my device</a>
          <a href="/ocpp-log" className="font-medium text-blue-600 hover:underline">Ver conexiones recientes / Recent connections</a>
        </div>
      </div>

      <div className="mt-4 flex w-full max-w-2xl items-center gap-2 text-xs text-slate-400">
        <Zap className="h-3.5 w-3.5" />
        Este test corre 100% en tu navegador contra nuestro servidor publico, no requiere login.
        This test runs 100% in your browser against our public server, no login required.
      </div>
    </div>
  );
}
