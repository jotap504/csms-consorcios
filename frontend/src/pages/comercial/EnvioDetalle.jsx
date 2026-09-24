import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, Send, PauseCircle, PlayCircle, XCircle, Users, MailWarning, AlertTriangle, List,
} from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import AdminLayout from '@/components/AdminLayout';
import {
  Card, CardHeader, CardTitle, CardContent, Badge, Button, StatCard,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui';
import { SUPERADMIN_NAV } from '../superadmin/navConfig';

const ESTADO_BADGE = {
  en_curso: { variant: 'accent', label: 'En curso' },
  pausado: { variant: 'destructive', label: 'Pausado' },
  completado: { variant: 'default', label: 'Completado' },
  cancelado: { variant: 'muted', label: 'Cancelado' },
};

const DEST_ESTADO_BADGE = {
  pendiente: { variant: 'muted', label: 'Pendiente' },
  enviado: { variant: 'accent', label: 'Enviado' },
  fallido: { variant: 'destructive', label: 'Fallido' },
  rebotado: { variant: 'destructive', label: 'Rebotado' },
  queja: { variant: 'destructive', label: 'Queja' },
};

const DEST_FILTROS = [
  { value: '', label: 'Todos' },
  { value: 'enviado', label: 'Enviados' },
  { value: 'pendiente', label: 'Pendientes' },
  { value: 'fallido', label: 'Fallidos' },
  { value: 'rebotado', label: 'Rebotados' },
  { value: 'queja', label: 'Quejas' },
];

function formatFechaHora(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function EnvioDetalle() {
  const { envioId } = useParams();
  const navigate = useNavigate();
  const [envio, setEnvio] = useState(null);
  const [accionando, setAccionando] = useState(false);
  const [destinatarios, setDestinatarios] = useState(null);
  const [filtroEstado, setFiltroEstado] = useState('');
  const [paginaDest, setPaginaDest] = useState(1);
  const [totalDest, setTotalDest] = useState(0);
  const intervalRef = useRef(null);

  async function load() {
    try {
      const { data } = await api.get(`/comercial/envios/${envioId}`);
      setEnvio(data);
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo cargar el envío.');
    }
  }

  async function loadDestinatarios() {
    try {
      const { data } = await api.get(`/comercial/envios/${envioId}/destinatarios`, {
        params: { estado: filtroEstado || undefined, page: paginaDest },
      });
      setDestinatarios(data.destinatarios);
      setTotalDest(data.total);
    } catch {
      toast.error('No se pudo cargar el detalle de destinatarios.');
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envioId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadDestinatarios();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envioId, filtroEstado, paginaDest]);

  useEffect(() => {
    if (!envio || !['en_curso', 'pausado'].includes(envio.estado)) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return undefined;
    }
    intervalRef.current = setInterval(load, 30000);
    return () => clearInterval(intervalRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envio?.estado]);

  async function ejecutarAccion(accion) {
    setAccionando(true);
    try {
      await api.post(`/comercial/envios/${envioId}/${accion}`);
      await load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo actualizar el envío.');
    } finally {
      setAccionando(false);
    }
  }

  if (!envio) {
    return (
      <AdminLayout title="Envío de campaña" navItems={SUPERADMIN_NAV}>
        <p className="p-4 text-sm text-muted-foreground">Cargando...</p>
      </AdminLayout>
    );
  }

  const badge = ESTADO_BADGE[envio.estado] ?? { variant: 'muted', label: envio.estado };
  const porcentaje = envio.total_destinatarios > 0 ? Math.round((envio.enviados / envio.total_destinatarios) * 100) : 0;

  return (
    <AdminLayout title="Envío de campaña" navItems={SUPERADMIN_NAV}>
      <Link to="/comercial/campanias" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />Volver a campañas
      </Link>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>{envio.campania_asunto}</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">Día {envio.dia_actual} · Último lote: {formatFechaHora(envio.ultimo_lote_en)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Plan: {envio.ramp_schedule?.length ? `${envio.ramp_schedule.join(', ')}, resto` : 'default'}
              {' · '}Ventana: {envio.hora_inicio}-{envio.hora_fin}
            </p>
          </div>
          <Badge variant={badge.variant}>{badge.label}</Badge>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {envio.pausado_motivo && (
            <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{envio.pausado_motivo}</span>
            </div>
          )}

          <div>
            <div className="mb-1 flex justify-between text-xs text-muted-foreground">
              <span>{envio.enviados} / {envio.total_destinatarios} enviados</span>
              <span>{porcentaje}%</span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${porcentaje}%` }} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard icon={Users} label="Destinatarios" value={envio.total_destinatarios} color="primary" />
            <StatCard icon={Send} label="Enviados" value={envio.enviados} hint={`Fallidos: ${envio.fallidos}`} color="emerald" />
            <StatCard icon={MailWarning} label="Rebotados" value={envio.rebotados} hint={`${(envio.tasa_rebote * 100).toFixed(1)}%`} color="amber" />
            <StatCard icon={AlertTriangle} label="Quejas" value={envio.quejas} hint={`${(envio.tasa_queja * 100).toFixed(2)}%`} color="rose" />
          </div>

          <div className="flex flex-wrap gap-2">
            {envio.estado === 'pausado' && (
              <Button size="sm" onClick={() => ejecutarAccion('reanudar')} loading={accionando}>
                <PlayCircle className="h-4 w-4" />Reanudar
              </Button>
            )}
            {envio.estado === 'en_curso' && (
              <Button size="sm" variant="outline" onClick={() => ejecutarAccion('pausar')} loading={accionando}>
                <PauseCircle className="h-4 w-4" />Pausar
              </Button>
            )}
            {['en_curso', 'pausado'].includes(envio.estado) && (
              <Button
                size="sm"
                variant="destructive"
                loading={accionando}
                onClick={() => {
                  // eslint-disable-next-line no-alert
                  if (window.confirm('Cancelar este envío? Los destinatarios pendientes no van a recibir el mail.')) ejecutarAccion('cancelar');
                }}
              >
                <XCircle className="h-4 w-4" />Cancelar
              </Button>
            )}
            {['completado', 'cancelado'].includes(envio.estado) && (
              <Button size="sm" variant="outline" onClick={() => navigate('/comercial/campanias')}>Volver</Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2"><List className="h-4 w-4" />Destinatarios</CardTitle>
          <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border p-1">
            {DEST_FILTROS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => { setFiltroEstado(f.value); setPaginaDest(1); }}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${filtroEstado === f.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {destinatarios === null && <p className="p-4 text-sm text-muted-foreground">Cargando...</p>}
          {destinatarios?.length === 0 && (
            <p className="p-8 text-center text-sm text-muted-foreground">No hay destinatarios para este filtro.</p>
          )}
          {destinatarios?.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contacto</TableHead>
                  <TableHead className="hidden sm:table-cell">Email</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="hidden md:table-cell">Enviado</TableHead>
                  <TableHead className="hidden lg:table-cell">Detalle</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {destinatarios.map((d) => {
                  const destBadge = DEST_ESTADO_BADGE[d.estado] ?? { variant: 'muted', label: d.estado };
                  const nombreCompleto = d.contacto_id ? `${d.contacto_apellido || ''}, ${d.contacto_nombre || ''}`.replace(/^, |, $/, '') : '-';
                  return (
                    <TableRow key={d.id}>
                      <TableCell>
                        <p className="truncate font-medium">{nombreCompleto}</p>
                        <p className="truncate text-xs text-muted-foreground sm:hidden">{d.email}</p>
                      </TableCell>
                      <TableCell className="hidden truncate text-sm text-muted-foreground sm:table-cell">{d.email}</TableCell>
                      <TableCell><Badge variant={destBadge.variant}>{destBadge.label}</Badge></TableCell>
                      <TableCell className="hidden whitespace-nowrap text-sm text-muted-foreground md:table-cell">{formatFechaHora(d.enviado_en)}</TableCell>
                      <TableCell className="hidden max-w-[220px] truncate text-xs text-muted-foreground lg:table-cell">{d.error || '-'}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          {totalDest > 50 && (
            <div className="flex items-center justify-between border-t border-border p-3 text-sm">
              <Button size="sm" variant="ghost" disabled={paginaDest <= 1} onClick={() => setPaginaDest((p) => p - 1)}>Anterior</Button>
              <span className="text-muted-foreground">{paginaDest} / {Math.max(1, Math.ceil(totalDest / 50))} ({totalDest} en total)</span>
              <Button size="sm" variant="ghost" disabled={paginaDest >= Math.ceil(totalDest / 50)} onClick={() => setPaginaDest((p) => p + 1)}>Siguiente</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </AdminLayout>
  );
}
