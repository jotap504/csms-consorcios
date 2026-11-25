import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Plus, Trash2, Send, Sparkles, Paperclip, ScrollText, FileBarChart2, Upload, ClipboardPaste,
} from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import AdminLayout from '@/components/AdminLayout';
import {
  Card, CardHeader, CardTitle, CardContent, Badge, Button, Input, Label,
  Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Tabs, TabsList, TabsTrigger, TabsContent,
} from '@/components/ui';
import { SUPERADMIN_NAV } from '../superadmin/navConfig';

const ESTADO_BADGE = {
  pendiente: { variant: 'outline', label: 'Pendiente' },
  en_curso: { variant: 'accent', label: 'En curso' },
  hecho: { variant: 'muted', label: 'Hecho' },
};

function formatFechaHora(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function TareasTab({ negocioId }) {
  const [tareas, setTareas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');

  const load = () => {
    setLoading(true);
    api.get(`/gestion/negocios/${negocioId}/tareas`)
      .then(({ data }) => setTareas(data))
      .catch(() => toast.error('No se pudieron cargar las tareas.'))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [negocioId]);

  const crear = async (e) => {
    e.preventDefault();
    if (!titulo.trim()) return;
    try {
      await api.post(`/gestion/negocios/${negocioId}/tareas`, { titulo: titulo.trim(), descripcion: descripcion.trim() || null });
      setOpen(false); setTitulo(''); setDescripcion('');
      load();
    } catch {
      toast.error('No se pudo crear la tarea.');
    }
  };

  const cambiarEstado = async (id, estado) => {
    try {
      await api.patch(`/gestion/tareas/${id}`, { estado });
      load();
    } catch {
      toast.error('No se pudo actualizar la tarea.');
    }
  };

  const eliminar = async (id) => {
    // eslint-disable-next-line no-alert
    if (!window.confirm('Borrar esta tarea?')) return;
    try {
      await api.delete(`/gestion/tareas/${id}`);
      load();
    } catch {
      toast.error('No se pudo borrar la tarea.');
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4" />Nueva tarea</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nueva tarea</DialogTitle></DialogHeader>
            <form onSubmit={crear} className="flex flex-col gap-3">
              <div>
                <Label htmlFor="titulo-tarea">Titulo</Label>
                <Input id="titulo-tarea" value={titulo} onChange={(e) => setTitulo(e.target.value)} autoFocus />
              </div>
              <div>
                <Label htmlFor="desc-tarea">Descripcion</Label>
                <textarea
                  id="desc-tarea"
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  rows={3}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <Button type="submit">Crear</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      {loading && <p className="text-sm text-muted-foreground">Cargando...</p>}
      {!loading && tareas.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Sin tareas todavia.</p>}
      {tareas.map((t) => (
        <div key={t.id} className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-border p-3.5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="font-medium">{t.titulo}</p>
              <Badge variant={ESTADO_BADGE[t.estado].variant}>{ESTADO_BADGE[t.estado].label}</Badge>
            </div>
            {t.descripcion && <p className="mt-1 text-sm text-muted-foreground">{t.descripcion}</p>}
            <p className="mt-1 text-xs text-muted-foreground">
              {t.creado_por_nombre && `${t.creado_por_nombre} · `}{formatFechaHora(t.creado_en)}
              {t.vence_en && ` · vence ${formatFechaHora(t.vence_en)}`}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <Select value={t.estado} onValueChange={(v) => cambiarEstado(t.id, v)}>
              <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pendiente">Pendiente</SelectItem>
                <SelectItem value="en_curso">En curso</SelectItem>
                <SelectItem value="hecho">Hecho</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" variant="ghost" onClick={() => eliminar(t.id)}><Trash2 className="h-4 w-4" /></Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function ChatTab({ negocioId }) {
  const [mensajes, setMensajes] = useState([]);
  const [texto, setTexto] = useState('');
  const [pregunta, setPregunta] = useState('');
  const [respuestaIA, setRespuestaIA] = useState(null);
  const [preguntando, setPreguntando] = useState(false);
  const fileRef = useRef(null);

  const load = () => {
    api.get(`/gestion/negocios/${negocioId}/chat`)
      .then(({ data }) => setMensajes(data))
      .catch(() => toast.error('No se pudo cargar el chat.'));
  };
  useEffect(() => { load(); }, [negocioId]);

  const enviar = async (e) => {
    e.preventDefault();
    if (!texto.trim()) return;
    try {
      await api.post(`/gestion/negocios/${negocioId}/chat`, { mensaje: texto.trim() });
      setTexto('');
      load();
    } catch {
      toast.error('No se pudo enviar el mensaje.');
    }
  };

  const subirYEnviar = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append('archivos', file);
    try {
      const { data } = await api.post(`/gestion/negocios/${negocioId}/adjuntos`, form);
      await api.post(`/gestion/negocios/${negocioId}/chat`, { mensaje: `Adjunto: ${file.name}`, adjunto_id: data[0].id });
      load();
    } catch {
      toast.error('No se pudo subir el archivo.');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const preguntarIA = async () => {
    if (!pregunta.trim()) return;
    setPreguntando(true);
    setRespuestaIA(null);
    try {
      const { data } = await api.post(`/gestion/negocios/${negocioId}/chat/preguntar`, { pregunta: pregunta.trim() });
      setRespuestaIA(data.respuesta);
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo consultar a la IA.');
    } finally {
      setPreguntando(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <Input
          placeholder="Preguntale a la IA sobre este chat (ej: que se habia dicho del proveedor X)"
          value={pregunta}
          onChange={(e) => setPregunta(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && preguntarIA()}
        />
        <Button variant="outline" onClick={preguntarIA} disabled={preguntando}><Sparkles className="h-4 w-4" />Preguntar</Button>
      </div>
      {preguntando && <p className="text-sm text-muted-foreground">Pensando...</p>}
      {respuestaIA && (
        <div className="rounded-xl border border-accent/40 bg-accent/5 p-3 text-sm">{respuestaIA}</div>
      )}

      <div className="flex max-h-[420px] flex-col gap-2 overflow-y-auto rounded-xl border border-border p-3">
        {mensajes.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Sin mensajes todavia.</p>}
        {mensajes.map((m) => (
          <div key={m.id} className="rounded-lg bg-muted/50 px-3 py-2">
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-medium">{m.usuario_nombre || 'Usuario'}</span>
              <span className="text-xs text-muted-foreground">{formatFechaHora(m.creado_en)}</span>
            </div>
            {m.mensaje && <p className="text-sm">{m.mensaje}</p>}
            {m.adjunto_id && (
              <a
                className="mt-1 inline-flex items-center gap-1 text-xs text-accent underline"
                href={`${api.defaults.baseURL}/gestion/archivos/${m.adjunto_path}`}
                target="_blank" rel="noreferrer"
              >
                <Paperclip className="h-3 w-3" />{m.adjunto_nombre}
              </a>
            )}
          </div>
        ))}
      </div>

      <form onSubmit={enviar} className="flex gap-2">
        <input ref={fileRef} type="file" className="hidden" onChange={subirYEnviar} />
        <Button type="button" variant="outline" size="icon" onClick={() => fileRef.current?.click()}><Paperclip className="h-4 w-4" /></Button>
        <Input placeholder="Escribi un mensaje..." value={texto} onChange={(e) => setTexto(e.target.value)} />
        <Button type="submit"><Send className="h-4 w-4" /></Button>
      </form>
    </div>
  );
}

function FilaProveedor({ fila, onChange, adjuntos }) {
  const fileRef = useRef(null);
  const [pegarAbierto, setPegarAbierto] = useState(false);
  const [textoPegado, setTextoPegado] = useState('');
  const [subiendo, setSubiendo] = useState(false);

  const adjunto = adjuntos.find((a) => String(a.id) === String(fila.adjunto_id));

  const subirArchivo = async (file) => {
    setSubiendo(true);
    const form = new FormData();
    form.append('archivos', file);
    try {
      const { data } = await api.post(`/gestion/negocios/${fila.negocioId}/adjuntos`, form);
      onChange({ ...fila, adjunto_id: String(data[0].id) });
      toast.success('Presupuesto subido.');
    } catch {
      toast.error('No se pudo subir el archivo.');
    } finally {
      setSubiendo(false);
    }
  };

  const subir = async (e) => {
    const file = e.target.files?.[0];
    if (file) await subirArchivo(file);
    if (fileRef.current) fileRef.current.value = '';
  };

  const guardarTextoPegado = async () => {
    if (!textoPegado.trim()) return;
    const archivo = new File([textoPegado], `presupuesto-${Date.now()}.txt`, { type: 'text/plain' });
    await subirArchivo(archivo);
    setTextoPegado('');
    setPegarAbierto(false);
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <Input placeholder="Nombre proveedor" value={fila.nombre} onChange={(e) => onChange({ ...fila, nombre: e.target.value })} />
      {adjunto ? (
        <div className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm">
          <a href={`${api.defaults.baseURL}/gestion/archivos/${adjunto.archivo_path}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-accent underline">
            <Paperclip className="h-3.5 w-3.5" />{adjunto.nombre_original}
          </a>
          <Button size="sm" variant="outline" onClick={() => onChange({ ...fila, adjunto_id: '' })}>Cambiar</Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <input ref={fileRef} type="file" onChange={subir} className="hidden" />
            <Button size="sm" variant="outline" disabled={subiendo} onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4" />{subiendo ? 'Subiendo...' : 'Subir archivo'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setPegarAbierto((v) => !v)}>
              <ClipboardPaste className="h-4 w-4" />Pegar texto
            </Button>
          </div>
          {pegarAbierto && (
            <div className="flex flex-col gap-2">
              <textarea
                autoFocus
                placeholder="Pegá aca el presupuesto en texto plano..."
                value={textoPegado}
                onChange={(e) => setTextoPegado(e.target.value)}
                rows={5}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
              <Button size="sm" disabled={subiendo || !textoPegado.trim()} onClick={guardarTextoPegado}>
                {subiendo ? 'Guardando...' : 'Guardar presupuesto'}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ComparadorTab({ negocioId }) {
  const [adjuntos, setAdjuntos] = useState([]);
  const [comparativas, setComparativas] = useState([]);
  const [titulo, setTitulo] = useState('');
  const [filas, setFilas] = useState([
    { negocioId, nombre: '', adjunto_id: '' },
    { negocioId, nombre: '', adjunto_id: '' },
  ]);
  const [comparando, setComparando] = useState(false);
  const [resultado, setResultado] = useState(null);

  const load = () => {
    api.get(`/gestion/negocios/${negocioId}/adjuntos`).then(({ data }) => setAdjuntos(data)).catch(() => {});
    api.get(`/gestion/negocios/${negocioId}/comparativas`).then(({ data }) => setComparativas(data)).catch(() => {});
  };
  useEffect(() => { load(); }, [negocioId]);

  const comparar = async () => {
    const proveedores = filas.filter((f) => f.nombre.trim() && f.adjunto_id);
    if (!titulo.trim() || proveedores.length < 2) {
      toast.error('Poné un titulo y elegi presupuesto + nombre para al menos 2 proveedores.');
      return;
    }
    setComparando(true);
    setResultado(null);
    try {
      const { data } = await api.post(`/gestion/negocios/${negocioId}/comparar-presupuestos`, { titulo: titulo.trim(), proveedores });
      setResultado(data.resultado);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo comparar los presupuestos.');
    } finally {
      setComparando(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Comparar presupuestos (2-3 proveedores)</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Input placeholder="Titulo (ej: Presupuesto cargadores edificio X)" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
          {filas.map((f, i) => (
            <FilaProveedor
              key={i}
              fila={f}
              adjuntos={adjuntos}
              onChange={(nueva) => setFilas((prev) => prev.map((p, j) => (j === i ? nueva : p)))}
            />
          ))}
          {filas.length < 3 && (
            <Button size="sm" variant="outline" onClick={() => setFilas((p) => [...p, { negocioId, nombre: '', adjunto_id: '' }])}>
              <Plus className="h-4 w-4" />Agregar proveedor
            </Button>
          )}
          <Button onClick={comparar} disabled={comparando}><FileBarChart2 className="h-4 w-4" />{comparando ? 'Comparando...' : 'Comparar con IA'}</Button>
        </CardContent>
      </Card>

      {resultado && (
        <Card>
          <CardHeader><CardTitle className="text-base">Resultado</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            {resultado.resumen && <p className="rounded-lg bg-accent/5 p-3">{resultado.resumen}</p>}
            {Array.isArray(resultado.items_comparados) && resultado.items_comparados.map((item, i) => (
              <div key={i} className="rounded-lg border border-border p-3">
                <p className="font-medium">{item.item}</p>
                <div className="mt-1 grid gap-1 sm:grid-cols-2">
                  {Object.entries(item.por_proveedor || {}).map(([prov, info]) => (
                    <div key={prov} className="rounded bg-muted/50 p-2">
                      <p className="font-medium">{prov}</p>
                      <p>{info.precio}</p>
                      {info.detalle && <p className="text-muted-foreground">{info.detalle}</p>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {comparativas.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Comparativas anteriores</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-2">
            {comparativas.map((c) => (
              <div key={c.id} className="rounded-lg border border-border p-2.5 text-sm">
                <button type="button" onClick={() => setResultado(c.resultado)} className="w-full text-left hover:underline">
                  <p className="font-medium">{c.titulo}</p>
                  <p className="text-xs text-muted-foreground">{formatFechaHora(c.creado_en)}</p>
                </button>
                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                  {(c.proveedores || []).map((p, i) => {
                    const adjunto = adjuntos.find((a) => String(a.id) === String(p.adjunto_id));
                    return adjunto ? (
                      <a key={i} href={`${api.defaults.baseURL}/gestion/archivos/${adjunto.archivo_path}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-accent underline">
                        <Paperclip className="h-3 w-3" />{p.nombre}
                      </a>
                    ) : (
                      <span key={i} className="text-xs text-muted-foreground">{p.nombre}</span>
                    );
                  })}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function LogTab({ negocioId }) {
  const [log, setLog] = useState([]);
  useEffect(() => {
    api.get(`/gestion/negocios/${negocioId}/log`).then(({ data }) => setLog(data)).catch(() => {});
  }, [negocioId]);
  return (
    <div className="flex flex-col gap-2">
      {log.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Sin actividad todavia.</p>}
      {log.map((l) => (
        <div key={l.id} className="flex items-start gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm">
          <ScrollText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div>
            <p><span className="font-medium">{l.usuario_nombre}</span> {l.accion} {l.entidad_tipo} {l.detalle && `- ${l.detalle}`}</p>
            <p className="text-xs text-muted-foreground">{formatFechaHora(l.creado_en)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function NegocioDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [negocio, setNegocio] = useState(null);

  useEffect(() => {
    api.get('/gestion/negocios').then(({ data }) => setNegocio(data.find((n) => String(n.id) === id)));
  }, [id]);

  return (
    <AdminLayout title={negocio?.nombre || 'Negocio'} navItems={SUPERADMIN_NAV}>
      <Button size="sm" variant="outline" className="mb-4" onClick={() => navigate('/gestion')}>
        <ArrowLeft className="h-4 w-4" />Negocios
      </Button>
      <Tabs defaultValue="tareas">
        <TabsList>
          <TabsTrigger value="tareas">Tareas</TabsTrigger>
          <TabsTrigger value="chat">Chat</TabsTrigger>
          <TabsTrigger value="comparador">Comparador de presupuestos</TabsTrigger>
          <TabsTrigger value="log">Log</TabsTrigger>
        </TabsList>
        <TabsContent value="tareas"><TareasTab negocioId={id} /></TabsContent>
        <TabsContent value="chat"><ChatTab negocioId={id} /></TabsContent>
        <TabsContent value="comparador"><ComparadorTab negocioId={id} /></TabsContent>
        <TabsContent value="log"><LogTab negocioId={id} /></TabsContent>
      </Tabs>
    </AdminLayout>
  );
}
