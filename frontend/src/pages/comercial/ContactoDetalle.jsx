import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, Plus, CalendarPlus, FileText, ClipboardList,
} from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import AdminLayout from '@/components/AdminLayout';
import {
  Card, CardHeader, CardTitle, CardContent,
  Badge, Button, Input, Label,
  Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui';
import { SUPERADMIN_NAV } from '../superadmin/navConfig';

const SELECT_CLASS = 'flex h-10 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const hoy = () => new Date().toISOString().slice(0, 10);

const ESTADOS = [
  'Nuevo', 'Contactado', 'Interesado', 'Reunion agendada', 'Relevamiento tecnico',
  'Presupuesto enviado', 'Negociacion', 'Ganado', 'Perdido', 'Pausado',
];
const CANALES = ['Email', 'WhatsApp', 'Llamada', 'Reunion', 'Otro'];

const EMPTY_SEG = {
  fecha: hoy(), canal: 'Llamada', tipo_actividad: '', resultado_resumen: '', mail_completo: '',
  estado_comercial_despues: '', proxima_accion: '', fecha_proxima_accion: '', notas: '',
};
const EMPTY_VISITA = { fecha_hora: '', direccion: '', notas: '' };

export default function ContactoDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [contacto, setContacto] = useState(null);
  const [segOpen, setSegOpen] = useState(false);
  const [segForm, setSegForm] = useState(EMPTY_SEG);
  const [visitaOpen, setVisitaOpen] = useState(false);
  const [visitaForm, setVisitaForm] = useState(EMPTY_VISITA);
  const [saving, setSaving] = useState(false);

  async function load() {
    const { data } = await api.get(`/comercial/contactos/${id}`);
    setContacto(data);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleQuickUpdate(patch) {
    try {
      await api.put(`/comercial/contactos/${id}`, patch);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo actualizar.');
    }
  }

  async function handleAddSeguimiento(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post(`/comercial/contactos/${id}/seguimientos`, {
        ...segForm,
        estado_comercial_despues: segForm.estado_comercial_despues || null,
        fecha_proxima_accion: segForm.fecha_proxima_accion || null,
      });
      setSegOpen(false);
      setSegForm(EMPTY_SEG);
      toast.success('Seguimiento registrado.');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo registrar el seguimiento.');
    } finally {
      setSaving(false);
    }
  }

  async function handleCrearRelevamiento() {
    try {
      const { data } = await api.post(`/comercial/contactos/${id}/relevamientos`, {});
      navigate(`/comercial/relevamientos/${data.id}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo crear el relevamiento.');
    }
  }

  async function handleCrearCotizacion() {
    try {
      const { data } = await api.post(`/comercial/contactos/${id}/cotizaciones`, {});
      navigate(`/comercial/cotizaciones/${data.id}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo crear la cotizacion.');
    }
  }

  async function handleAddVisita(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post(`/comercial/contactos/${id}/visitas`, visitaForm);
      setVisitaOpen(false);
      setVisitaForm(EMPTY_VISITA);
      toast.success('Visita agendada.');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo agendar la visita.');
    } finally {
      setSaving(false);
    }
  }

  if (!contacto) {
    return (
      <AdminLayout title="Contacto" navItems={SUPERADMIN_NAV}>
        <p className="text-sm text-muted-foreground">Cargando...</p>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title={`${contacto.apellido}, ${contacto.nombre}`} navItems={SUPERADMIN_NAV}>
      <Button size="sm" variant="outline" className="mb-4" onClick={() => navigate('/comercial/contactos')}>
        <ArrowLeft className="h-4 w-4" />Volver
      </Button>

      <div className="grid min-w-0 gap-4 lg:grid-cols-3">
        <Card className="min-w-0 lg:col-span-1">
          <CardHeader><CardTitle>Datos del contacto</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <p className="text-xs text-muted-foreground">{contacto.codigo}</p>
            <div><span className="text-muted-foreground">Tipo:</span> {contacto.tipo_contacto}</div>
            <div><span className="text-muted-foreground">Email:</span> {contacto.email || '-'}</div>
            <div><span className="text-muted-foreground">Telefono:</span> {contacto.telefono || '-'}</div>
            <div><span className="text-muted-foreground">Administracion/Empresa:</span> {contacto.administracion_empresa || '-'}</div>
            <div><span className="text-muted-foreground">CUIT:</span> {contacto.cuit || '-'}</div>
            <div><span className="text-muted-foreground">Zona:</span> {contacto.zona || '-'}</div>
            <div><span className="text-muted-foreground">Origen:</span> {contacto.origen || '-'}</div>
            <div><span className="text-muted-foreground">Interes principal:</span> {contacto.interes_principal || '-'}</div>
            <div><span className="text-muted-foreground">Responsable:</span> {contacto.responsable_nombre || '-'}</div>

            <div className="mt-2 border-t border-border pt-3">
              <Label htmlFor="estadoSelect">Estado comercial</Label>
              <select
                id="estadoSelect"
                className={SELECT_CLASS}
                value={contacto.estado_comercial}
                onChange={(e) => handleQuickUpdate({ estado_comercial: e.target.value })}
              >
                {ESTADOS.map((es) => <option key={es} value={es}>{es}</option>)}
              </select>
            </div>
            <div>
              <Label htmlFor="prioridadSelect">Prioridad</Label>
              <select
                id="prioridadSelect"
                className={SELECT_CLASS}
                value={contacto.prioridad}
                onChange={(e) => handleQuickUpdate({ prioridad: e.target.value })}
              >
                <option value="Alta">Alta</option>
                <option value="Media">Media</option>
                <option value="Baja">Baja</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={contacto.alerta === 'Vencido' ? 'destructive' : contacto.alerta === 'Hoy' ? 'default' : 'muted'}>{contacto.alerta}</Badge>
              {contacto.fecha_proxima_accion && <span className="text-xs text-muted-foreground">{contacto.proxima_accion} - {String(contacto.fecha_proxima_accion).slice(0, 10)}</span>}
            </div>
            {contacto.motivo_baja && <p className="text-xs text-muted-foreground">Motivo: {contacto.motivo_baja}</p>}
            {contacto.observaciones && (
              <div className="mt-2 border-t border-border pt-3">
                <p className="text-xs text-muted-foreground">Observaciones</p>
                <p>{contacto.observaciones}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
          <Card>
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
              <CardTitle>Relevamiento tecnico</CardTitle>
              <Button size="sm" onClick={handleCrearRelevamiento}><Plus className="h-4 w-4" />Nuevo relevamiento</Button>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {contacto.relevamientos.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin relevamientos todavia.</p>
              ) : (
                contacto.relevamientos.map((r) => (
                  <Link
                    key={r.id}
                    to={`/comercial/relevamientos/${r.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3 text-sm hover:bg-muted/50"
                  >
                    <span className="flex min-w-0 items-center gap-2"><ClipboardList className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="truncate">{String(r.fecha).slice(0, 10)}{r.edificio_nombre ? ` - ${r.edificio_nombre}` : ''}</span></span>
                    <Badge variant={r.estado === 'revisado' ? 'accent' : 'muted'}>{r.estado}</Badge>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
              <CardTitle>Cotizaciones</CardTitle>
              <Button size="sm" onClick={handleCrearCotizacion}><Plus className="h-4 w-4" />Nueva cotizacion</Button>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {(contacto.cotizaciones ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin cotizaciones todavia.</p>
              ) : (
                contacto.cotizaciones.map((q) => (
                  <Link
                    key={q.id}
                    to={`/comercial/cotizaciones/${q.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3 text-sm hover:bg-muted/50"
                  >
                    <span className="flex min-w-0 items-center gap-2"><FileText className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="truncate">{q.codigo ? `${q.codigo} - ` : ''}{String(q.fecha).slice(0, 10)}{q.edificio?.nombre ? ` - ${q.edificio.nombre}` : ''}</span></span>
                    <Badge variant={q.estado === 'enviado' || q.estado === 'aprobado' ? 'accent' : q.estado === 'rechazado' ? 'destructive' : 'muted'}>{q.estado}</Badge>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>

          {contacto.presupuestos.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-sm text-muted-foreground">Presupuestos (historico)</CardTitle></CardHeader>
              <CardContent className="flex flex-col gap-2">
                {contacto.presupuestos.map((p) => {
                  const total = (p.opciones ?? []).reduce((s, o) => s + Number(o.total ?? 0), 0);
                  return (
                    <Link
                      key={p.id}
                      to={`/comercial/presupuestos/${p.id}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3 text-sm hover:bg-muted/50"
                    >
                      <span className="flex items-center gap-2"><FileText className="h-4 w-4 shrink-0 text-muted-foreground" />{String(p.fecha).slice(0, 10)}</span>
                      <span className="ml-auto flex items-center gap-2">
                        <span className="tabular-nums">{p.moneda === 'USD' ? 'US$' : '$'}{total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                        <Badge variant={p.estado === 'enviado' || p.estado === 'aprobado' ? 'accent' : p.estado === 'rechazado' ? 'destructive' : 'muted'}>{p.estado}</Badge>
                      </span>
                    </Link>
                  );
                })}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
              <CardTitle>Seguimiento</CardTitle>
              <div className="flex flex-wrap gap-2">
                <Dialog open={visitaOpen} onOpenChange={(o) => { setVisitaOpen(o); if (!o) setVisitaForm(EMPTY_VISITA); }}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline"><CalendarPlus className="h-4 w-4" />Agendar visita</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Agendar visita tecnica</DialogTitle>
                      <DialogDescription>Coordinacion de relevamiento en el edificio.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleAddVisita} className="flex flex-col gap-3">
                      <div>
                        <Label htmlFor="vFecha">Fecha y hora</Label>
                        <Input id="vFecha" type="datetime-local" required value={visitaForm.fecha_hora} onChange={(e) => setVisitaForm({ ...visitaForm, fecha_hora: e.target.value })} />
                      </div>
                      <div>
                        <Label htmlFor="vDireccion">Direccion</Label>
                        <Input id="vDireccion" value={visitaForm.direccion} onChange={(e) => setVisitaForm({ ...visitaForm, direccion: e.target.value })} />
                      </div>
                      <div>
                        <Label htmlFor="vNotas">Notas</Label>
                        <Input id="vNotas" value={visitaForm.notas} onChange={(e) => setVisitaForm({ ...visitaForm, notas: e.target.value })} />
                      </div>
                      <Button type="submit" className="mt-2" loading={saving}>Agendar</Button>
                    </form>
                  </DialogContent>
                </Dialog>
                <Dialog open={segOpen} onOpenChange={(o) => { setSegOpen(o); if (!o) setSegForm(EMPTY_SEG); }}>
                  <DialogTrigger asChild>
                    <Button size="sm"><Plus className="h-4 w-4" />Registrar actividad</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Registrar seguimiento</DialogTitle>
                      <DialogDescription>Queda en el historial del contacto y actualiza la proxima accion.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleAddSeguimiento} className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label htmlFor="sFecha">Fecha</Label>
                          <Input id="sFecha" type="date" value={segForm.fecha} onChange={(e) => setSegForm({ ...segForm, fecha: e.target.value })} />
                        </div>
                        <div>
                          <Label htmlFor="sCanal">Canal</Label>
                          <select id="sCanal" className={SELECT_CLASS} value={segForm.canal} onChange={(e) => setSegForm({ ...segForm, canal: e.target.value })}>
                            {CANALES.map((c) => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                      </div>
                      <div>
                        <Label htmlFor="sTipo">Tipo de actividad</Label>
                        <Input id="sTipo" placeholder="Ej: llamada de seguimiento" value={segForm.tipo_actividad} onChange={(e) => setSegForm({ ...segForm, tipo_actividad: e.target.value })} />
                      </div>
                      <div>
                        <Label htmlFor="sResumen">Resumen del resultado</Label>
                        <Input id="sResumen" value={segForm.resultado_resumen} onChange={(e) => setSegForm({ ...segForm, resultado_resumen: e.target.value })} />
                      </div>
                      <div>
                        <Label htmlFor="sMail">Mail completo (opcional)</Label>
                        <textarea
                          id="sMail"
                          rows={4}
                          className="flex w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          value={segForm.mail_completo}
                          onChange={(e) => setSegForm({ ...segForm, mail_completo: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label htmlFor="sEstadoDespues">Nuevo estado comercial (opcional)</Label>
                        <select id="sEstadoDespues" className={SELECT_CLASS} value={segForm.estado_comercial_despues} onChange={(e) => setSegForm({ ...segForm, estado_comercial_despues: e.target.value })}>
                          <option value="">Sin cambio</option>
                          {ESTADOS.map((es) => <option key={es} value={es}>{es}</option>)}
                        </select>
                      </div>
                      <div>
                        <Label htmlFor="sProxima">Proxima accion</Label>
                        <Input id="sProxima" value={segForm.proxima_accion} onChange={(e) => setSegForm({ ...segForm, proxima_accion: e.target.value })} />
                      </div>
                      <div>
                        <Label htmlFor="sFechaProxima">Fecha proxima accion</Label>
                        <Input id="sFechaProxima" type="date" value={segForm.fecha_proxima_accion} onChange={(e) => setSegForm({ ...segForm, fecha_proxima_accion: e.target.value })} />
                      </div>
                      <div>
                        <Label htmlFor="sNotas">Notas</Label>
                        <Input id="sNotas" value={segForm.notas} onChange={(e) => setSegForm({ ...segForm, notas: e.target.value })} />
                      </div>
                      <Button type="submit" className="mt-2" loading={saving}>Guardar</Button>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {contacto.seguimientos.length === 0 && contacto.visitas.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin actividad registrada todavia.</p>
              ) : (
                <>
                  {contacto.visitas.map((v) => (
                    <div key={`v${v.id}`} className="rounded-lg border border-border bg-accent/5 p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">Visita tecnica</span>
                        <Badge variant={v.estado === 'realizada' ? 'accent' : v.estado === 'cancelada' ? 'destructive' : 'muted'}>{v.estado}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{new Date(v.fecha_hora).toLocaleString('es-AR')} {v.direccion ? `- ${v.direccion}` : ''}</p>
                      {v.notas && <p className="mt-1">{v.notas}</p>}
                    </div>
                  ))}
                  {contacto.seguimientos.map((s) => (
                    <div key={`s${s.id}`} className="rounded-lg border border-border p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{s.canal}{s.tipo_actividad ? ` - ${s.tipo_actividad}` : ''}</span>
                        <span className="text-xs text-muted-foreground">{String(s.fecha).slice(0, 10)}</span>
                      </div>
                      {s.resultado_resumen && <p className="mt-1">{s.resultado_resumen}</p>}
                      {s.estado_comercial_despues && <Badge variant="muted" className="mt-1">→ {s.estado_comercial_despues}</Badge>}
                      <p className="mt-1 text-xs text-muted-foreground">{s.responsable_nombre}</p>
                    </div>
                  ))}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}
