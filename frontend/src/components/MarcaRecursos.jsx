import { useEffect, useRef, useState } from 'react';
import {
  Upload, Trash2, ImageIcon, FileText, Building2,
} from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import {
  Card, CardHeader, CardTitle, CardContent, Button,
} from '@/components/ui';

const TIPOS = [
  {
    tipo: 'logo', label: 'Logo', accept: 'image/*', icon: Building2,
    hint: 'Se usa para insertarlo directo en el mail, y como referencia visual al generar imagenes con IA.',
  },
  {
    tipo: 'imagen_referencia', label: 'Imagenes de referencia', accept: 'image/*', icon: ImageIcon,
    hint: 'Fotos/diseños cuyo estilo (colores, composicion) la IA va a intentar copiar al generar imagenes nuevas.',
  },
  {
    tipo: 'documento', label: 'Documentos (PDF)', accept: 'application/pdf,image/*', icon: FileText,
    hint: 'Info de la empresa (folleto, brochure) - el texto se le suma al asistente para que use datos reales.',
  },
];

export default function MarcaRecursos() {
  const [recursos, setRecursos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [subiendo, setSubiendo] = useState(null);
  const fileRefs = useRef({});

  const load = () => {
    setLoading(true);
    api.get('/comercial/marca')
      .then(({ data }) => setRecursos(data))
      .catch(() => toast.error('No se pudieron cargar los recursos de marca.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleSubir = async (tipo, file) => {
    if (!file) return;
    setSubiendo(tipo);
    try {
      const form = new FormData();
      form.append('archivo', file);
      form.append('tipo', tipo);
      form.append('nombre', file.name);
      await api.post('/comercial/marca', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Archivo agregado.');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo subir el archivo.');
    } finally {
      setSubiendo(null);
    }
  };

  const handleEliminar = async (id) => {
    try {
      await api.delete(`/comercial/marca/${id}`);
      load();
    } catch {
      toast.error('No se pudo eliminar.');
    }
  };

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle>Marca de la empresa</CardTitle>
        <p className="text-sm text-muted-foreground">Logo, imagenes de referencia de estilo y documentos que el asistente usa para armar campañas mas fieles a la marca.</p>
      </CardHeader>
      <CardContent className="grid min-w-0 gap-4 md:grid-cols-3">
        {TIPOS.map(({
          tipo, label, accept, icon: Icon, hint,
        }) => (
          <div key={tipo} className="flex min-w-0 flex-col gap-2 rounded-lg border border-border p-3">
            <div className="flex items-center gap-2 text-sm font-medium"><Icon className="h-4 w-4" />{label}</div>
            <p className="text-xs text-muted-foreground">{hint}</p>
            <div className="flex flex-col gap-1.5">
              {!loading && recursos.filter((r) => r.tipo === tipo).map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-2 py-1.5 text-xs">
                  <span className="min-w-0 truncate">{r.nombre}</span>
                  <button type="button" onClick={() => handleEliminar(r.id)} className="shrink-0 cursor-pointer text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {!loading && recursos.filter((r) => r.tipo === tipo).length === 0 && (
                <p className="text-xs text-muted-foreground italic">Nada cargado todavia.</p>
              )}
            </div>
            <input
              ref={(el) => { fileRefs.current[tipo] = el; }}
              type="file"
              accept={accept}
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) handleSubir(tipo, f); }}
            />
            <Button
              size="sm"
              variant="outline"
              loading={subiendo === tipo}
              onClick={() => fileRefs.current[tipo]?.click()}
            >
              <Upload className="h-4 w-4" />Subir
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
