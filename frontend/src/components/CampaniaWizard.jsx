import {
  useEffect, useRef, useState,
} from 'react';
import {
  Send, Sparkles, Loader2, ImagePlus, Upload, Save, Building2, Eye, Pencil, ArrowUp, ArrowDown, X,
} from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import {
  Button, Input, Label,
} from '@/components/ui';
import RichTextEditor from '@/components/RichTextEditor';

// Detecta las imagenes propias (subidas/generadas, servidas desde
// /api/comercial/archivos/:filename) dentro del HTML del cuerpo, en el orden
// en que aparecen - misma logica que prepararImagenesInline en el backend
// (services/campaniaEnvioHelpers.js), pero para armar la tira de miniaturas
// reordenables. El filename ya es un UUID unico, sirve de identificador.
function extraerImagenesDelCuerpo(html) {
  const regex = /<img[^>]*\ssrc=["']([^"']*\/api\/comercial\/archivos\/([a-zA-Z0-9._-]+))["'][^>]*>/gi;
  const imagenes = [];
  let match;
  // eslint-disable-next-line no-cond-assign
  while ((match = regex.exec(html)) !== null) {
    imagenes.push({
      full: match[0], start: match.index, end: match.index + match[0].length, url: match[1], filename: match[2],
    });
  }
  return imagenes;
}

// Intercambia la posicion de dos imagenes dentro del HTML (mueve la de
// "index" un lugar hacia arriba o abajo en el orden), preservando intacto
// todo el texto/otras imagenes que hay entre medio.
function moverImagenEnCuerpo(html, index, direccion) {
  const imagenes = extraerImagenesDelCuerpo(html);
  const destino = index + direccion;
  if (destino < 0 || destino >= imagenes.length) return html;
  const a = imagenes[index];
  const b = imagenes[destino];
  const [primero, segundo] = a.start < b.start ? [a, b] : [b, a];
  return html.slice(0, primero.start) + segundo.full + html.slice(primero.end, segundo.start) + primero.full + html.slice(segundo.end);
}

function quitarImagenDelCuerpo(html, filename) {
  const img = extraerImagenesDelCuerpo(html).find((i) => i.filename === filename);
  if (!img) return html;
  return html.slice(0, img.start) + html.slice(img.end);
}

// Wizard conversacional para armar campañas de mail: chatea con el usuario
// (asistente IA) hasta tener asunto + cuerpo, despues permite editarlo con
// texto enriquecido y agregar imagenes (generadas con IA o subidas), y
// finalmente GUARDA la campaña (sin enviarla - a quien y cuando se le manda
// se decide despues, aparte, en /comercial/contactos).
export default function CampaniaWizard({ campaniaInicial, onGuardado }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [asunto, setAsunto] = useState(campaniaInicial?.asunto ?? '');
  const [cuerpoHtml, setCuerpoHtml] = useState(campaniaInicial?.cuerpo_html ?? '');
  const [imagenPrompt, setImagenPrompt] = useState('');
  const [generandoImagen, setGenerandoImagen] = useState(false);
  const [subiendoImagen, setSubiendoImagen] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [logo, setLogo] = useState(null);
  const [vistaPreviaActiva, setVistaPreviaActiva] = useState(false);
  const editorRef = useRef(null);
  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, chatLoading]);

  useEffect(() => {
    api.get('/comercial/marca').then(({ data }) => setLogo(data.find((r) => r.tipo === 'logo') ?? null)).catch(() => {});
  }, []);

  const insertarImagenUrl = (filename) => {
    const url = `${window.location.origin}/api/comercial/archivos/${filename}`;
    editorRef.current?.insertImage(url);
  };

  const handleSend = async (e) => {
    e.preventDefault();
    const mensaje = input.trim();
    if (!mensaje || chatLoading) return;
    setInput('');
    const historial = messages.map(({ role, content }) => ({ role, content }));
    setMessages((prev) => [...prev, { role: 'user', content: mensaje }]);
    setChatLoading(true);
    try {
      const { data } = await api.post('/comercial/campanias/chat', { mensaje, historial });
      setMessages((prev) => [...prev, { role: 'assistant', content: data.respuesta }]);
      if (data.listo) {
        setAsunto(data.asunto || '');
        setCuerpoHtml(data.cuerpo_html || '');
      }
    } catch (err) {
      setMessages((prev) => [...prev, { role: 'assistant', content: err.response?.data?.error || 'No pude responder ahora, proba de nuevo.' }]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleGenerarImagen = async () => {
    if (!imagenPrompt.trim()) return;
    setGenerandoImagen(true);
    try {
      const { data } = await api.post('/comercial/campanias/imagen-ia', { prompt: imagenPrompt.trim() });
      insertarImagenUrl(data.filename);
      setImagenPrompt('');
      toast.success('Imagen insertada.');
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo generar la imagen.');
    } finally {
      setGenerandoImagen(false);
    }
  };

  const handleSubirImagen = async (file) => {
    if (!file) return;
    setSubiendoImagen(true);
    try {
      const form = new FormData();
      form.append('archivo', file);
      const { data } = await api.post('/comercial/campanias/imagen-subir', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      insertarImagenUrl(data.filename);
      toast.success('Imagen insertada.');
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo subir la imagen.');
    } finally {
      setSubiendoImagen(false);
    }
  };

  const handleGuardar = async () => {
    setGuardando(true);
    try {
      const payload = { asunto, cuerpo_html: cuerpoHtml };
      const { data } = campaniaInicial?.id
        ? await api.put(`/comercial/campanias/${campaniaInicial.id}`, payload)
        : await api.post('/comercial/campanias', payload);
      toast.success('Campaña guardada.');
      onGuardado(data);
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo guardar la campaña.');
    } finally {
      setGuardando(false);
    }
  };

  const hayBorrador = Boolean(cuerpoHtml);
  const imagenesEnCuerpo = extraerImagenesDelCuerpo(cuerpoHtml);

  function handleMoverImagen(index, direccion) {
    setCuerpoHtml((prev) => moverImagenEnCuerpo(prev, index, direccion));
  }

  function handleQuitarImagen(filename) {
    // eslint-disable-next-line no-alert
    if (!window.confirm('Quitar esta imagen del mail?')) return;
    setCuerpoHtml((prev) => quitarImagenDelCuerpo(prev, filename));
  }

  // Mismo reemplazo de placeholders + footer de baja que hace el backend al
  // mandar de verdad (services/campaniaEnvioHelpers.js: personalizarCuerpo),
  // pero con un contacto de ejemplo y un link de baja de mentira - solo para
  // mostrar como se ve, no se manda nada.
  function construirPreviewHtml() {
    const cuerpoPersonalizado = cuerpoHtml
      .replace(/\[Nombre Completo\]/gi, 'Juan Pérez')
      .replace(/\[Nombre\]/gi, 'Juan')
      .replace(/\[Apellido\]/gi, 'Pérez');
    const footerHtml = '<p style="margin-top:24px;font-size:11px;color:#999;">Si no queres recibir mas mails nuestros, <a href="#" style="color:#999;">hace click aca para darte de baja</a>.</p>';
    return cuerpoPersonalizado + footerHtml;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <div className="flex h-[520px] flex-col rounded-lg border border-border">
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-3">
          {messages.length === 0 && (
            <p className="mt-4 text-center text-sm text-muted-foreground">
              Contame que campaña queres mandar (a quien, para que, que tono) y te armo un borrador.
            </p>
          )}
          <div className="flex flex-col gap-2">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[90%] whitespace-pre-line rounded-xl px-3 py-2 text-sm ${m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'}`}>
                  {m.content}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />Pensando...
                </div>
              </div>
            )}
          </div>
        </div>
        <form onSubmit={handleSend} className="flex items-center gap-2 border-t border-border p-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Escribi tu mensaje..."
            className="h-10 flex-1 rounded-lg border border-border px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button type="submit" size="sm" disabled={chatLoading || !input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>

      <div className="flex flex-col gap-3">
        {!hayBorrador && (
          <div className="flex h-[520px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border text-center text-sm text-muted-foreground">
            <Sparkles className="h-8 w-8 opacity-40" />
            El borrador (asunto + mensaje) va a aparecer aca cuando charles con el asistente.
          </div>
        )}
        {hayBorrador && (
          <>
            <div>
              <Label htmlFor="wizAsunto">Asunto</Label>
              <Input id="wizAsunto" value={asunto} onChange={(e) => setAsunto(e.target.value)} />
            </div>
            <div className="flex items-center justify-between">
              <Label className="mb-0">{vistaPreviaActiva ? 'Vista previa' : 'Mensaje'}</Label>
              <div className="flex items-center gap-1 rounded-lg border border-border p-1">
                <Button type="button" size="sm" variant={!vistaPreviaActiva ? 'default' : 'ghost'} onClick={() => setVistaPreviaActiva(false)}>
                  <Pencil className="h-3.5 w-3.5" />Editar
                </Button>
                <Button type="button" size="sm" variant={vistaPreviaActiva ? 'default' : 'ghost'} onClick={() => setVistaPreviaActiva(true)}>
                  <Eye className="h-3.5 w-3.5" />Vista previa
                </Button>
              </div>
            </div>
            {!vistaPreviaActiva && <RichTextEditor ref={editorRef} value={cuerpoHtml} onChange={setCuerpoHtml} />}
            {vistaPreviaActiva && (
              <div className="overflow-hidden rounded-lg border border-border">
                <div className="border-b border-border bg-muted/40 p-3 text-sm">
                  <p><span className="text-muted-foreground">De:</span> BILON Smart Buildings &lt;comercial@bilon.com.ar&gt;</p>
                  <p><span className="text-muted-foreground">Para:</span> Juan Pérez &lt;juan.perez@ejemplo.com&gt;</p>
                  <p className="font-medium">{asunto || '(sin asunto)'}</p>
                </div>
                <iframe
                  title="Vista previa del mail"
                  sandbox=""
                  srcDoc={`<html><body style="margin:0;padding:16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222;">${construirPreviewHtml()}</body></html>`}
                  className="h-[420px] w-full bg-white"
                />
              </div>
            )}
            {!vistaPreviaActiva && (
              <>
                <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/40 p-2.5">
                  <Input
                    placeholder="Describi la imagen que queres generar..."
                    value={imagenPrompt}
                    onChange={(e) => setImagenPrompt(e.target.value)}
                    className="h-9 flex-1 min-w-[180px]"
                  />
                  <Button type="button" size="sm" variant="outline" loading={generandoImagen} disabled={!imagenPrompt.trim()} onClick={handleGenerarImagen}>
                    <ImagePlus className="h-4 w-4" />Generar con IA
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) handleSubirImagen(f); }}
                  />
                  <Button type="button" size="sm" variant="outline" loading={subiendoImagen} onClick={() => fileInputRef.current?.click()}>
                    <Upload className="h-4 w-4" />Subir imagen
                  </Button>
                  {logo && (
                    <Button type="button" size="sm" variant="outline" onClick={() => insertarImagenUrl(logo.filename)}>
                      <Building2 className="h-4 w-4" />Insertar logo
                    </Button>
                  )}
                </div>
                {logo && <p className="text-xs text-muted-foreground">La generacion con IA ya usa el logo y las imagenes de referencia cargadas en "Marca de la empresa" para copiar el estilo.</p>}
                {imagenesEnCuerpo.length > 0 && (
                  <div className="flex flex-col gap-1.5 rounded-lg border border-border p-2.5">
                    <p className="text-xs font-medium text-muted-foreground">Imágenes en el mail, en orden (moverlas acá reordena el mail entero)</p>
                    <div className="flex flex-wrap gap-2">
                      {imagenesEnCuerpo.map((img, i) => (
                        <div key={img.filename} className="flex flex-col items-center gap-1 rounded-lg border border-border p-1.5">
                          <img src={img.url} alt={`Imagen ${i + 1}`} className="h-16 w-16 rounded object-cover" />
                          <span className="text-[10px] text-muted-foreground">Imagen {i + 1}</span>
                          <div className="flex items-center gap-0.5">
                            <Button type="button" size="sm" variant="ghost" disabled={i === 0} onClick={() => handleMoverImagen(i, -1)} title="Mover antes">
                              <ArrowUp className="h-3.5 w-3.5" />
                            </Button>
                            <Button type="button" size="sm" variant="ghost" disabled={i === imagenesEnCuerpo.length - 1} onClick={() => handleMoverImagen(i, 1)} title="Mover despues">
                              <ArrowDown className="h-3.5 w-3.5" />
                            </Button>
                            <Button type="button" size="sm" variant="ghost" onClick={() => handleQuitarImagen(img.filename)} title="Quitar">
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
            <Button
              type="button"
              className="self-end"
              loading={guardando}
              disabled={!asunto.trim() || !cuerpoHtml.trim()}
              onClick={handleGuardar}
            >
              <Save className="h-4 w-4" />Guardar campaña
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
