import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Inbox, RefreshCw, Send, ArrowUpRight, ArrowDownLeft, ArrowLeft, Mail as MailIcon, Trash2, Forward, Sparkles,
} from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import AdminLayout from '@/components/AdminLayout';
import {
  Card, CardContent, Button, Badge, Switch, Label, Input,
} from '@/components/ui';
import { SUPERADMIN_NAV } from '../superadmin/navConfig';

function formatFecha(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

function nombreParaMostrar(mail) {
  if (mail.contacto_id) return `${mail.contacto_apellido}, ${mail.contacto_nombre}`;
  if (mail.direccion === 'entrante') return mail.de_nombre || mail.de_email || '(desconocido)';
  return mail.para_email || '(sin destinatario)';
}

export default function Bandeja() {
  const [mails, setMails] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [soloNoLeidos, setSoloNoLeidos] = useState(false);
  const [direccionFiltro, setDireccionFiltro] = useState(''); // '' = todos, 'entrante', 'saliente'
  const [loading, setLoading] = useState(true);
  const [revisando, setRevisando] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [detalle, setDetalle] = useState(null);
  const [respuesta, setRespuesta] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [reenviarOpen, setReenviarOpen] = useState(false);
  const [reenviarForm, setReenviarForm] = useState({ to: '', mensaje: '' });
  const [reenviando, setReenviando] = useState(false);

  const cargarLista = useCallback(() => {
    setLoading(true);
    const params = { page };
    if (soloNoLeidos) params.leido = 'false';
    if (direccionFiltro) params.direccion = direccionFiltro;
    api.get('/comercial/mails', { params })
      .then(({ data }) => { setMails(data.mails); setTotal(data.total); })
      .catch(() => toast.error('No se pudo cargar la bandeja.'))
      .finally(() => setLoading(false));
  }, [page, soloNoLeidos, direccionFiltro]);

  useEffect(() => { cargarLista(); }, [cargarLista]);

  const abrirMail = (id) => {
    setSelectedId(id);
    setRespuesta('');
    setReenviarOpen(false);
    setReenviarForm({ to: '', mensaje: '' });
    api.get(`/comercial/mails/${id}`).then(({ data }) => {
      setDetalle(data);
      setMails((prev) => prev.map((m) => (m.id === id ? { ...m, leido: true } : m)));
    }).catch(() => toast.error('No se pudo abrir el mail.'));
  };

  const handleRevisarBandeja = () => {
    setRevisando(true);
    api.post('/comercial/bandeja/revisar')
      .then(({ data }) => {
        toast.success(`Revisado: ${data.procesados.length} de contactos conocidos, ${data.sin_match.length} sin contacto asociado.`);
        cargarLista();
      })
      .catch(() => toast.error('No se pudo revisar la bandeja.'))
      .finally(() => setRevisando(false));
  };

  const handleResponder = (e) => {
    e.preventDefault();
    if (!respuesta.trim()) return;
    setEnviando(true);
    api.post(`/comercial/mails/${selectedId}/responder`, { cuerpo: respuesta })
      .then(() => {
        toast.success('Respuesta enviada.');
        setRespuesta('');
        cargarLista();
      })
      .catch((err) => toast.error(err.response?.data?.error || 'No se pudo enviar la respuesta.'))
      .finally(() => setEnviando(false));
  };

  const handleEliminar = () => {
    if (!selectedId) return;
    // eslint-disable-next-line no-alert
    if (!window.confirm('Borrar este mail de la bandeja? No se puede deshacer.')) return;
    setEliminando(true);
    api.delete(`/comercial/mails/${selectedId}`)
      .then(() => {
        toast.success('Mail eliminado.');
        setDetalle(null);
        setSelectedId(null);
        cargarLista();
      })
      .catch(() => toast.error('No se pudo eliminar el mail.'))
      .finally(() => setEliminando(false));
  };

  const handleReenviar = (e) => {
    e.preventDefault();
    if (!reenviarForm.to.trim()) return;
    setReenviando(true);
    api.post(`/comercial/mails/${selectedId}/reenviar`, reenviarForm)
      .then(() => {
        toast.success('Mail reenviado.');
        setReenviarOpen(false);
        setReenviarForm({ to: '', mensaje: '' });
        cargarLista();
      })
      .catch((err) => toast.error(err.response?.data?.error || 'No se pudo reenviar el mail.'))
      .finally(() => setReenviando(false));
  };

  const totalPages = Math.max(1, Math.ceil(total / 30));

  return (
    <AdminLayout title="Bandeja" navItems={SUPERADMIN_NAV}>
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between">
        <p className="text-sm text-muted-foreground">Mails de ventasbilonsmart@gmail.com - entrantes y respuestas enviadas.</p>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
          <div className="flex items-center gap-1 self-start rounded-lg border border-border p-1">
            {[
              { value: '', label: 'Todos' },
              { value: 'entrante', label: 'Entrantes' },
              { value: 'saliente', label: 'Salientes' },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => { setDireccionFiltro(opt.value); setPage(1); }}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${direccionFiltro === opt.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={soloNoLeidos} onCheckedChange={(v) => { setSoloNoLeidos(v); setPage(1); }} id="soloNoLeidos" />
            <Label htmlFor="soloNoLeidos" className="mb-0 cursor-pointer">Solo no leidos</Label>
          </div>
          <Button size="sm" variant="outline" loading={revisando} onClick={handleRevisarBandeja} className="self-start">
            <RefreshCw className="h-4 w-4" />Revisar ahora
          </Button>
        </div>
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-[380px_1fr]">
        <Card className={`overflow-hidden ${detalle ? 'hidden lg:block' : ''}`}>
          <div className="flex flex-col divide-y divide-border">
            {loading && <p className="p-5 text-sm text-muted-foreground">Cargando...</p>}
            {!loading && mails.length === 0 && (
              <div className="flex flex-col items-center gap-2 p-8 text-center text-sm text-muted-foreground">
                <Inbox className="h-8 w-8 opacity-40" />
                No hay mails para mostrar.
              </div>
            )}
            {mails.map((m) => {
              const noLeido = m.direccion === 'entrante' && !m.leido;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => abrirMail(m.id)}
                  className={`flex flex-col gap-0.5 px-4 py-3 text-left text-sm transition-colors hover:bg-muted/50 ${m.id === selectedId ? 'bg-muted/70' : ''}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`flex items-center gap-1.5 truncate ${noLeido ? 'font-semibold' : ''}`}>
                      {noLeido && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />}
                      {m.direccion === 'saliente'
                        ? <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        : <ArrowDownLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                      <span className="truncate">{nombreParaMostrar(m)}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatFecha(m.fecha)}</span>
                  </div>
                  <p className={`truncate ${noLeido ? 'font-semibold' : ''}`}>{m.asunto || '(sin asunto)'}</p>
                  <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                    {m.resumen_ia && <Sparkles className="h-3 w-3 shrink-0 text-accent" />}
                    {m.snippet}
                  </p>
                </button>
              );
            })}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-border p-3 text-sm">
              <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
              <span className="text-muted-foreground">{page} / {totalPages}</span>
              <Button size="sm" variant="ghost" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Siguiente</Button>
            </div>
          )}
        </Card>

        <Card className={`min-h-[400px] ${!detalle ? 'hidden lg:block' : ''}`}>
          {!detalle && (
            <CardContent className="flex h-full flex-col items-center justify-center gap-2 py-20 text-center text-sm text-muted-foreground">
              <MailIcon className="h-8 w-8 opacity-40" />
              Elegi un mail de la lista para verlo.
            </CardContent>
          )}
          {detalle && (
            <CardContent className="flex flex-col gap-4 p-5">
              <Button size="sm" variant="ghost" className="self-start lg:hidden" onClick={() => { setSelectedId(null); setDetalle(null); }}>
                <ArrowLeft className="h-4 w-4" />Volver a la bandeja
              </Button>
              <div className="flex flex-col gap-1 border-b border-border pb-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h2 className="text-lg font-semibold">{detalle.asunto || '(sin asunto)'}</h2>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setReenviarOpen((v) => !v)}>
                      <Forward className="h-4 w-4" />Reenviar
                    </Button>
                    <Button size="sm" variant="ghost" loading={eliminando} onClick={handleEliminar}>
                      <Trash2 className="h-4 w-4" />Borrar
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                  <span>
                    {detalle.direccion === 'entrante' ? 'De' : 'Para'}: {detalle.direccion === 'entrante' ? (detalle.de_nombre || detalle.de_email) : detalle.para_email}
                    {detalle.contacto_id && (
                      <>
                        {' - '}
                        <Link to={`/comercial/contactos/${detalle.contacto_id}`} className="font-medium text-accent hover:underline">
                          {detalle.contacto_apellido}, {detalle.contacto_nombre}
                        </Link>
                      </>
                    )}
                    {!detalle.contacto_id && <Badge variant="muted" className="ml-2">Sin contacto asociado</Badge>}
                  </span>
                  <span>{formatFecha(detalle.fecha)}</span>
                </div>
              </div>

              {detalle.direccion === 'entrante' && detalle.resumen_ia && (
                <div className="flex items-start gap-2 rounded-lg bg-accent/10 px-3 py-2.5 text-sm text-accent">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
                  <span><span className="font-medium">Resumen (IA):</span> {detalle.resumen_ia}</span>
                </div>
              )}

              <div className="whitespace-pre-wrap text-sm leading-relaxed">
                {detalle.cuerpo_texto || detalle.cuerpo_html?.replace(/<[^>]+>/g, ' ') || '(sin contenido)'}
              </div>

              {reenviarOpen && (
                <form onSubmit={handleReenviar} className="flex flex-col gap-2 rounded-lg border border-border p-3">
                  <Label htmlFor="reenviarTo">Reenviar a</Label>
                  <Input
                    id="reenviarTo"
                    type="email"
                    required
                    placeholder="destinatario@ejemplo.com"
                    value={reenviarForm.to}
                    onChange={(e) => setReenviarForm({ ...reenviarForm, to: e.target.value })}
                  />
                  <textarea
                    rows={2}
                    placeholder="Mensaje adicional (opcional)..."
                    className="flex w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={reenviarForm.mensaje}
                    onChange={(e) => setReenviarForm({ ...reenviarForm, mensaje: e.target.value })}
                  />
                  <Button type="submit" size="sm" className="self-end" loading={reenviando} disabled={!reenviarForm.to.trim()}>
                    <Forward className="h-4 w-4" />Reenviar
                  </Button>
                </form>
              )}

              <form onSubmit={handleResponder} className="mt-2 flex flex-col gap-2 border-t border-border pt-4">
                <Label htmlFor="respuesta">Responder</Label>
                <textarea
                  id="respuesta"
                  rows={4}
                  placeholder="Escribi tu respuesta..."
                  className="flex w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={respuesta}
                  onChange={(e) => setRespuesta(e.target.value)}
                />
                <Button type="submit" className="self-end" loading={enviando} disabled={!respuesta.trim()}>
                  <Send className="h-4 w-4" />Enviar respuesta
                </Button>
              </form>
            </CardContent>
          )}
        </Card>
      </div>
    </AdminLayout>
  );
}
