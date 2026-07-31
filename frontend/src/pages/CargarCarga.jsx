import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { AlertCircle, Zap, Clock, Gauge, Battery, LogOut } from 'lucide-react';
import { api } from '@/lib/api';
import { clearSession } from '@/lib/auth';
import { formatElapsed, cn } from '@/lib/utils';
import { Button, Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui';

export default function CargarCarga() {
  const { ocppId } = useParams();
  const [cargador, setCargador] = useState(null);
  const [estado, setEstado] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadEstado = useCallback(async () => {
    try {
      const { data } = await api.get(`/residente/cargadores/${ocppId}/estado`);
      setEstado(data);
    } catch {
      // silent: la proxima ronda de polling reintenta
    }
  }, [ocppId]);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const { data } = await api.get(`/residente/cargadores/${ocppId}`);
        if (cancelled) return;
        setCargador(data);
        await loadEstado();
      } catch (err) {
        if (cancelled) return;
        setLoadError(err.response?.data?.error || 'No se pudo cargar la informacion del cargador.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    init();
    return () => { cancelled = true; };
  }, [ocppId, loadEstado]);

  useEffect(() => {
    if (!cargador) return undefined;
    const interval = setInterval(loadEstado, 5000);
    return () => clearInterval(interval);
  }, [cargador, loadEstado]);

  async function handleIniciar() {
    setActionError('');
    setActionLoading(true);
    try {
      await api.post(`/residente/cargadores/${ocppId}/iniciar`);
      await loadEstado();
    } catch (err) {
      setActionError(err.response?.data?.error || 'No se pudo iniciar la carga.');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDetener() {
    setActionError('');
    setActionLoading(true);
    try {
      await api.post(`/residente/cargadores/${ocppId}/detener`);
      await loadEstado();
    } catch (err) {
      setActionError(err.response?.data?.error || 'No se pudo detener la carga.');
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center bg-background px-4 py-6">
      <div className="flex w-full max-w-sm items-center justify-between">
        <img src="/logo.png" alt="Bilon Smart Buildings" className="h-7 w-auto" />
        <button
          onClick={() => { clearSession(); window.location.href = '/login'; }}
          className="flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <LogOut className="h-3.5 w-3.5" />
          Salir
        </button>
      </div>

      <div className="mt-6 w-full max-w-sm">
        {loading && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Cargando...
            </CardContent>
          </Card>
        )}

        {!loading && loadError && (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
              <AlertCircle className="h-8 w-8 text-destructive" />
              <p className="text-sm text-foreground">{loadError}</p>
            </CardContent>
          </Card>
        )}

        {!loading && !loadError && cargador && estado && (
          <Card>
            <CardHeader className="items-center text-center">
              <CardTitle className="text-xl">{cargador.etiqueta || cargador.ocpp_id}</CardTitle>
              <CardDescription className="font-mono text-xs">{cargador.ocpp_id}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-6">
              <div
                className={cn(
                  'flex h-32 w-32 items-center justify-center rounded-full border-4',
                  estado.activo ? 'border-accent bg-accent/10' : 'border-border bg-muted',
                )}
              >
                <Zap className={cn('h-14 w-14', estado.activo ? 'text-accent' : 'text-muted-foreground')} />
              </div>

              <p className="text-sm font-medium text-foreground">
                {estado.activo ? 'Cargando' : 'Listo para cargar'}
              </p>

              {estado.activo && (
                <div className="grid w-full grid-cols-3 gap-3 text-center">
                  <div className="flex flex-col items-center gap-1">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-semibold tabular-nums">{formatElapsed(estado.conectado_desde)}</span>
                    <span className="text-[11px] text-muted-foreground">Conectado</span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <Gauge className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-semibold tabular-nums">
                      {estado.potencia_actual_kw != null ? `${Number(estado.potencia_actual_kw).toFixed(1)}` : '-'}
                    </span>
                    <span className="text-[11px] text-muted-foreground">kW</span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <Battery className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-semibold tabular-nums">{Number(estado.kwh_sesion ?? 0).toFixed(2)}</span>
                    <span className="text-[11px] text-muted-foreground">kWh</span>
                  </div>
                </div>
              )}

              {actionError && (
                <div role="alert" className="flex w-full items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {actionError}
                </div>
              )}

              {estado.activo ? (
                <Button size="lg" variant="destructive" className="w-full" disabled={actionLoading} onClick={handleDetener}>
                  {actionLoading ? 'Deteniendo...' : 'Detener carga'}
                </Button>
              ) : (
                <Button size="lg" className="w-full" disabled={actionLoading} onClick={handleIniciar}>
                  {actionLoading ? 'Iniciando...' : 'Iniciar carga'}
                </Button>
              )}

              <p className="text-center text-xs text-muted-foreground">
                Precio actual: ${Number(cargador.costo_kwh_electricidad).toFixed(2)} / kWh
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
