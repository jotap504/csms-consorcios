import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Plus, Trash2, Send, Sparkles, Paperclip, ScrollText, FileBarChart2, Upload, ClipboardPaste,
  FileText, FileVideo, FileAudio, Eye, X,
} from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import AdminLayout from '@/components/AdminLayout';
import {
  Card, CardHeader, CardTitle, CardContent, Badge, Button, Input, Label,
  Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Tabs, TabsList, TabsTrigger, TabsContent, Switch,
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

// Fila clickeable (icono/miniatura + nombre + "Ver") para cualquier adjunto -
// usada en el presupuesto de cada proveedor, en comparativas anteriores y en
// la biblioteca general, asi el mismo archivo se ve igual en todos lados.
function AdjuntoRow({ adjunto, onQuitar }) {
  const url = `${api.defaults.baseURL}/gestion/archivos/${adjunto.archivo_path}`;
  return (
    <div className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm">
      <a href={url} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-2 text-accent">
        {adjunto.tipo === 'imagen' && <img src={url} alt="" className="h-8 w-8 shrink-0 rounded object-cover" />}
        {adjunto.tipo === 'video' && <FileVideo className="h-4 w-4 shrink-0" />}
        {adjunto.tipo === 'audio' && <FileAudio className="h-4 w-4 shrink-0" />}
        {!['imagen', 'video', 'audio'].includes(adjunto.tipo) && <FileText className="h-4 w-4 shrink-0" />}
        <span className="truncate underline">{adjunto.nombre_original}</span>
        <Eye className="h-3.5 w-3.5 shrink-0" />
      </a>
      {onQuitar && (
        <button type="button" onClick={onQuitar} className="shrink-0 text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

// Campo que puede ser texto escrito a mano O un archivo subido, nunca los
// dos a la vez (presupuesto y descripcion tecnica) - usado dentro de la
// ficha de cada proveedor.
function CampoTextoOArchivo({
  negocioId, proveedorId, campoTexto, campoAdjuntoId, textoValor, adjunto, label, placeholder, accept, onUpdated,
}) {
  const [forzarTexto, setForzarTexto] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const fileRef = useRef(null);

  const patch = async (campos) => {
    try {
      const { data } = await api.patch(`/gestion/proveedores/${proveedorId}`, campos);
      onUpdated(data);
    } catch {
      toast.error('No se pudo guardar.');
    }
  };

  const subir = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSubiendo(true);
    const form = new FormData();
    form.append('archivos', file);
    try {
      const { data } = await api.post(`/gestion/negocios/${negocioId}/adjuntos`, form);
      setForzarTexto(false);
      await patch({ [campoAdjuntoId]: data[0].id, [campoTexto]: null });
    } catch {
      toast.error('No se pudo subir el archivo.');
    } finally {
      setSubiendo(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const mostrarTexto = !adjunto && (forzarTexto || Boolean(textoValor));

  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {adjunto ? (
        <AdjuntoRow adjunto={adjunto} onQuitar={() => patch({ [campoAdjuntoId]: null })} />
      ) : mostrarTexto ? (
        <div className="flex flex-col gap-1.5">
          <textarea
            key={`${proveedorId}-${campoTexto}-${textoValor || ''}`}
            autoFocus={!textoValor}
            defaultValue={textoValor || ''}
            onBlur={(e) => { if (e.target.value !== (textoValor || '')) patch({ [campoTexto]: e.target.value }); }}
            placeholder={placeholder}
            rows={3}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <Button size="sm" variant="outline" onClick={() => { setForzarTexto(false); patch({ [campoTexto]: null }); }}>
            Quitar texto
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <input ref={fileRef} type="file" accept={accept} onChange={subir} className="hidden" />
          <Button size="sm" variant="outline" disabled={subiendo} onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4" />{subiendo ? 'Subiendo...' : 'Subir archivo'}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setForzarTexto(true)}>
            <ClipboardPaste className="h-4 w-4" />Escribir texto
          </Button>
        </div>
      )}
    </div>
  );
}

// Foto/video: solo archivo, sin alternativa de texto.
function CampoArchivoSimple({
  negocioId, proveedorId, campo, adjunto, label, accept, onUpdated,
}) {
  const [subiendo, setSubiendo] = useState(false);
  const fileRef = useRef(null);

  const subir = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSubiendo(true);
    const form = new FormData();
    form.append('archivos', file);
    try {
      const { data } = await api.post(`/gestion/negocios/${negocioId}/adjuntos`, form);
      const { data: proveedor } = await api.patch(`/gestion/proveedores/${proveedorId}`, { [campo]: data[0].id });
      onUpdated(proveedor);
    } catch {
      toast.error('No se pudo subir el archivo.');
    } finally {
      setSubiendo(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const quitar = async () => {
    try {
      const { data } = await api.patch(`/gestion/proveedores/${proveedorId}`, { [campo]: null });
      onUpdated(data);
    } catch {
      toast.error('No se pudo guardar.');
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {adjunto ? (
        <AdjuntoRow adjunto={adjunto} onQuitar={quitar} />
      ) : (
        <>
          <input ref={fileRef} type="file" accept={accept} onChange={subir} className="hidden" />
          <Button size="sm" variant="outline" disabled={subiendo} onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4" />{subiendo ? 'Subiendo...' : `Subir ${label.toLowerCase()}`}
          </Button>
        </>
      )}
    </div>
  );
}

function adjuntoDe(proveedor, prefijo) {
  const path_ = proveedor[`${prefijo}_adjunto_path`];
  if (!path_) return null;
  return {
    nombre_original: proveedor[`${prefijo}_adjunto_nombre`],
    archivo_path: path_,
    tipo: proveedor[`${prefijo}_adjunto_tipo`],
  };
}

// Ficha persistente de un proveedor: nombre, contacto, resumen, presupuesto
// (texto o adjunto), descripcion tecnica (texto o adjunto), foto, video -
// cada campo se guarda solo con PATCH apenas se completa, asi queda todo
// en el servidor al toque y no depende de terminar la comparacion.
function ProveedorCard({
  negocioId, proveedor, seleccionado, onToggleSeleccion, onUpdated, onEliminado,
}) {
  const patch = async (campos) => {
    try {
      const { data } = await api.patch(`/gestion/proveedores/${proveedor.id}`, campos);
      onUpdated(data);
    } catch {
      toast.error('No se pudo guardar.');
    }
  };

  const eliminar = async () => {
    // eslint-disable-next-line no-alert
    if (!window.confirm(`¿Borrar proveedor "${proveedor.nombre}"?`)) return;
    try {
      await api.delete(`/gestion/proveedores/${proveedor.id}`);
      onEliminado(proveedor.id);
    } catch {
      toast.error('No se pudo borrar el proveedor.');
    }
  };

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 pt-5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Switch checked={seleccionado} onCheckedChange={onToggleSeleccion} />
            <span className="text-xs text-muted-foreground">Elegir para comparar</span>
          </div>
          <button type="button" onClick={eliminar} className="text-muted-foreground hover:text-destructive">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>

        <Input
          key={`nombre-${proveedor.id}-${proveedor.nombre}`}
          defaultValue={proveedor.nombre}
          onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== proveedor.nombre) patch({ nombre: v }); }}
          placeholder="Nombre proveedor"
        />
        <Input
          key={`contacto-${proveedor.id}-${proveedor.contacto || ''}`}
          defaultValue={proveedor.contacto || ''}
          onBlur={(e) => { if (e.target.value !== (proveedor.contacto || '')) patch({ contacto: e.target.value }); }}
          placeholder="Contacto (telefono, email, etc)"
        />
        <textarea
          key={`resumen-${proveedor.id}-${proveedor.resumen || ''}`}
          defaultValue={proveedor.resumen || ''}
          onBlur={(e) => { if (e.target.value !== (proveedor.resumen || '')) patch({ resumen: e.target.value }); }}
          placeholder="Resumen / notas"
          rows={2}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <CampoTextoOArchivo
            negocioId={negocioId}
            proveedorId={proveedor.id}
            campoTexto="presupuesto_texto"
            campoAdjuntoId="presupuesto_adjunto_id"
            textoValor={proveedor.presupuesto_texto}
            adjunto={adjuntoDe(proveedor, 'presupuesto')}
            label="Presupuesto"
            placeholder="Precio, items, condiciones de pago..."
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
            onUpdated={onUpdated}
          />
          <CampoTextoOArchivo
            negocioId={negocioId}
            proveedorId={proveedor.id}
            campoTexto="descripcion_texto"
            campoAdjuntoId="descripcion_adjunto_id"
            textoValor={proveedor.descripcion_texto}
            adjunto={adjuntoDe(proveedor, 'descripcion')}
            label="Descripcion tecnica"
            placeholder="Especificaciones, ficha tecnica..."
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
            onUpdated={onUpdated}
          />
          <CampoArchivoSimple
            negocioId={negocioId}
            proveedorId={proveedor.id}
            campo="foto_adjunto_id"
            adjunto={adjuntoDe(proveedor, 'foto')}
            label="Foto"
            accept="image/*"
            onUpdated={onUpdated}
          />
          <CampoArchivoSimple
            negocioId={negocioId}
            proveedorId={proveedor.id}
            campo="video_adjunto_id"
            adjunto={adjuntoDe(proveedor, 'video')}
            label="Video"
            accept="video/*"
            onUpdated={onUpdated}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function ComparadorTab({ negocioId }) {
  const [proveedores, setProveedores] = useState([]);
  const [comparativas, setComparativas] = useState([]);
  const [seleccionados, setSeleccionados] = useState([]);
  const [titulo, setTitulo] = useState('');
  const [nombreNuevo, setNombreNuevo] = useState('');
  const [comparando, setComparando] = useState(false);
  const [resultado, setResultado] = useState(null);

  const load = () => {
    api.get(`/gestion/negocios/${negocioId}/proveedores`).then(({ data }) => setProveedores(data)).catch(() => {});
    api.get(`/gestion/negocios/${negocioId}/comparativas`).then(({ data }) => setComparativas(data)).catch(() => {});
  };
  useEffect(() => { load(); }, [negocioId]);

  const agregarProveedor = async () => {
    if (!nombreNuevo.trim()) return;
    try {
      const { data } = await api.post(`/gestion/negocios/${negocioId}/proveedores`, { nombre: nombreNuevo.trim() });
      setProveedores((prev) => [...prev, data]);
      setNombreNuevo('');
    } catch {
      toast.error('No se pudo agregar el proveedor.');
    }
  };

  const actualizarProveedor = (actualizado) => {
    setProveedores((prev) => prev.map((p) => (p.id === actualizado.id ? actualizado : p)));
  };

  const eliminarProveedor = (id) => {
    setProveedores((prev) => prev.filter((p) => p.id !== id));
    setSeleccionados((prev) => prev.filter((pid) => pid !== id));
  };

  const toggleSeleccion = (id) => {
    setSeleccionados((prev) => {
      if (prev.includes(id)) return prev.filter((pid) => pid !== id);
      if (prev.length >= 3) {
        toast.error('Maximo 3 proveedores por comparacion.');
        return prev;
      }
      return [...prev, id];
    });
  };

  const comparar = async () => {
    if (!titulo.trim() || seleccionados.length < 2) {
      toast.error('Poné un titulo y elegi 2 o 3 proveedores.');
      return;
    }
    setComparando(true);
    setResultado(null);
    try {
      const { data } = await api.post(`/gestion/negocios/${negocioId}/comparar-presupuestos`, {
        titulo: titulo.trim(),
        proveedor_ids: seleccionados,
      });
      setResultado(data.resultado);
      setTitulo('');
      setSeleccionados([]);
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
        <CardHeader><CardTitle className="text-base">Proveedores</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3">
          {proveedores.length === 0 && <p className="text-sm text-muted-foreground">Sin proveedores cargados todavia.</p>}
          {proveedores.map((p) => (
            <ProveedorCard
              key={p.id}
              negocioId={negocioId}
              proveedor={p}
              seleccionado={seleccionados.includes(p.id)}
              onToggleSeleccion={() => toggleSeleccion(p.id)}
              onUpdated={actualizarProveedor}
              onEliminado={eliminarProveedor}
            />
          ))}
          <div className="flex gap-2">
            <Input
              placeholder="Nombre del nuevo proveedor"
              value={nombreNuevo}
              onChange={(e) => setNombreNuevo(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && agregarProveedor()}
            />
            <Button variant="outline" onClick={agregarProveedor}><Plus className="h-4 w-4" />Agregar proveedor</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Comparar con IA</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Input placeholder="Titulo (ej: Presupuesto cargadores edificio X)" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
          <p className="text-sm text-muted-foreground">{seleccionados.length} proveedor(es) elegido(s) arriba (2 o 3).</p>
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
          <CardContent className="flex flex-col gap-3">
            {comparativas.map((c) => (
              <div key={c.id} className="rounded-lg border border-border p-3 text-sm">
                <button type="button" onClick={() => setResultado(c.resultado)} className="w-full text-left hover:underline">
                  <p className="font-medium">{c.titulo}</p>
                  <p className="text-xs text-muted-foreground">{formatFechaHora(c.creado_en)}</p>
                </button>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {(c.proveedores || []).map((p, i) => (
                    <div key={i} className="flex flex-col gap-1 rounded-md bg-muted/30 p-2">
                      <span className="text-xs font-medium">{p.nombre}{p.contacto ? ` - ${p.contacto}` : ''}</span>
                      {p.resumen && <span className="text-xs text-muted-foreground">{p.resumen}</span>}
                      {p.presupuesto_adjunto && <AdjuntoRow adjunto={p.presupuesto_adjunto} />}
                      {!p.presupuesto_adjunto && p.presupuesto_texto && <p className="text-xs">{p.presupuesto_texto}</p>}
                      {p.descripcion_adjunto && <AdjuntoRow adjunto={p.descripcion_adjunto} />}
                      {!p.descripcion_adjunto && p.descripcion_texto && <p className="text-xs">{p.descripcion_texto}</p>}
                      {p.foto_adjunto && <AdjuntoRow adjunto={p.foto_adjunto} />}
                      {p.video_adjunto && <AdjuntoRow adjunto={p.video_adjunto} />}
                      {!p.proveedor_id && <span className="text-xs text-muted-foreground">(comparativa antigua)</span>}
                    </div>
                  ))}
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
