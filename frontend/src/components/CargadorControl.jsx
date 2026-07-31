import { useEffect, useState, useCallback } from 'react';
import { AlertCircle, Zap, Clock, Gauge, Battery, ListOrdered, Plug, PlugZap, History } from 'lucide-react';
import { api } from '@/lib/api';
import { formatElapsed, cn } from '@/lib/utils';
import { Button, Card, CardContent, CardHeader, CardTitle, CardDescription, Badge } from '@/components/ui';

export default function CargadorControl({ ocppId }) {
  const [cargador, setCargador] = useState(null);
  const [estado, setEstado] = useState(null);
  const [historial, setHistorial] = useState([]);
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

  const loadHistorial = useCallback(async () => {
    try {
      const { data } = await api.get(`/residente/cargadores/${ocppId}/historial`);
      setHistorial(data);
    } catch {
      // no bloquea el resto de la tarjeta si esto falla
    }
  }, [ocppId]);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      setLoading(true);
      setLoadError('');
      try {
        const { data } = await api.get(`/residente/cargadores/${ocppId}`);
        if (cancelled) return;
        setCargador(data);
        await Promise.all([loadEstado(), loadHistorial()]);
      } catch (err) {
        if (cancelled) return;
        setLoadError(err.response?.data?.error || 'No se pudo cargar la informacion del cargador.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    init();
    return () => { cancelled = true; };
  }, [ocppId, loadEstado, loadHistorial]);

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
      await loadHistorial();
    } catch (err) {
      setActionError(err.response?.data?.error || 'No se pudo detener la carga.');
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Cargando...
        </CardContent>
      </Card>
    );
  }

  if (loadError) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <p className="text-sm text-foreground">{loadError}</p>
        </CardContent>
      </Card>
    );
  }

  if (!cargador || !estado) return null;

  const enCola = estado.activo && estado.en_cola;
  const cargando = estado.activo && !estado.en_cola;

  return (
    <>
      <Card>
        <CardHeader className="items-center text-center">
          <CardTitle className="text-xl">{cargador.etiqueta || cargador.ocpp_id}</CardTitle>
          <CardDescription className="font-mono text-xs">{cargador.ocpp_id}</CardDescription>
          {estado.conectado != null && (
            <Badge variant={estado.conectado ? 'accent' : 'muted'} className="mt-1 gap-1">
              {estado.conectado ? <PlugZap className="h-3 w-3" /> : <Plug className="h-3 w-3" />}
              {estado.conectado ? 'Vehiculo conectado' : 'Sin vehiculo conectado'}
            </Badge>
          )}
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-6">
          <div
            className={cn(
              'flex h-32 w-32 items-center justify-center rounded-full border-4',
              cargando && 'border-accent bg-accent/10',
              enCola && 'border-amber-500 bg-amber-500/10',
              !estado.activo && 'border-border bg-muted',
            )}
          >
            {enCola ? (
              <ListOrdered className="h-14 w-14 text-amber-500" />
            ) : (
              <Zap className={cn('h-14 w-14', cargando ? 'text-accent' : 'text-muted-foreground')} />
            )}
          </div>

          <p className="text-sm font-medium text-foreground">
            {enCola
              ? `En cola${estado.posicion_en_cola ? ` - posicion ${estado.posicion_en_cola}` : ''}`
              : cargando
                ? 'Cargando'
                : 'Listo para cargar'}
          </p>
          {enCola && (
            <p className="-mt-4 text-center text-xs text-muted-foreground">
              Alta demanda en el edificio ahora mismo. Arranca automaticamente apenas se libera un cupo, sin que tengas que hacer nada.
            </p>
          )}

          {cargando && (
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
              {actionLoading ? 'Deteniendo...' : enCola ? 'Cancelar' : 'Detener carga'}
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

      {historial.length > 0 && (
        <Card className="mt-4">
          <CardHeader className="flex-row items-center gap-2 py-4">
            <History className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm">Historial de cargas</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 pt-0">
            {historial.map((h) => (
              <div key={h.transaction_id_ocpp} className="flex items-center justify-between border-t border-border pt-3 first:border-t-0 first:pt-0">
                <div>
                  <p className="text-sm text-foreground">{new Date(h.fecha_inicio).toLocaleDateString('es-AR')}</p>
                  <p className="text-xs text-muted-foreground">{Number(h.kwh_consumidos).toFixed(2)} kWh</p>
                </div>
                <p className="text-sm font-semibold tabular-nums">${Number(h.monto_total_expensa).toFixed(2)}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </>
  );
}
