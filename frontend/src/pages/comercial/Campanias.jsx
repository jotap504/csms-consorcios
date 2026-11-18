import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Send, Pencil, Trash2, Megaphone, ArrowLeft, MailOpen, MousePointerClick, MailWarning,
} from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import AdminLayout from '@/components/AdminLayout';
import CampaniaWizard from '@/components/CampaniaWizard';
import MarcaRecursos from '@/components/MarcaRecursos';
import {
  Card, CardHeader, CardTitle, CardContent,
  Badge, Button,
} from '@/components/ui';
import { SUPERADMIN_NAV } from '../superadmin/navConfig';

function formatFecha(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const ENVIO_BOTON = {
  programado: { variant: 'outline', label: () => 'Programado' },
  en_curso: { variant: 'accent', label: (c) => `En curso ${c.envio_enviados}/${c.envio_total}` },
  pausado: { variant: 'destructive', label: () => 'Pausado' },
  completado: { variant: 'outline', label: () => 'Ver envío' },
  cancelado: { variant: 'outline', label: () => 'Ver envío (cancelado)' },
};

export default function Campanias() {
  const navigate = useNavigate();
  const [campanias, setCampanias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editando, setEditando] = useState(null); // campania completa (con cuerpo_html) o null = nueva

  const load = () => {
    setLoading(true);
    api.get('/comercial/campanias')
      .then(({ data }) => setCampanias(data))
      .catch(() => toast.error('No se pudieron cargar las campañas.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const abrirNueva = () => { setEditando(null); setOpen(true); };

  const abrirEditar = async (id) => {
    try {
      const { data } = await api.get(`/comercial/campanias/${id}`);
      setEditando(data);
      setOpen(true);
    } catch {
      toast.error('No se pudo abrir la campaña.');
    }
  };

  const handleGuardado = () => {
    setOpen(false);
    setEditando(null);
    load();
  };

  const handleEliminar = async (id) => {
    // eslint-disable-next-line no-alert
    if (!window.confirm('Borrar esta campaña? No se puede deshacer.')) return;
    try {
      await api.delete(`/comercial/campanias/${id}`);
      toast.success('Campaña eliminada.');
      load();
    } catch {
      toast.error('No se pudo eliminar la campaña.');
    }
  };

  return (
    <AdminLayout title="Campañas" navItems={SUPERADMIN_NAV}>
      {open && (
        <Card className="mb-4">
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>{editando ? 'Editar campaña' : 'Nueva campaña'}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Paso 1: armá el asunto y el mensaje (con el asistente o vos mismo). A quién y cuándo se le manda se elige en el paso 2, desde Contactos.
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => { setOpen(false); setEditando(null); }}>
              <ArrowLeft className="h-4 w-4" />Volver
            </Button>
          </CardHeader>
          <CardContent>
            <CampaniaWizard campaniaInicial={editando} onGuardado={handleGuardado} />
          </CardContent>
        </Card>
      )}
      {!open && <MarcaRecursos />}
      {!open && (
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle>Campañas de mail</CardTitle>
          <Button size="sm" onClick={abrirNueva}><Plus className="h-4 w-4" />Nueva campaña</Button>
        </CardHeader>
        <CardContent>
          {loading && <p className="p-4 text-sm text-muted-foreground">Cargando...</p>}
          {!loading && campanias.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
              <Megaphone className="h-8 w-8 opacity-40" />
              Todavia no creaste ninguna campaña.
            </div>
          )}
          {!loading && campanias.length > 0 && (
            <div className="flex flex-col gap-3">
              {campanias.map((c) => {
                const envioActivo = ['en_curso', 'pausado', 'programado'].includes(c.envio_estado);
                const botonEnvio = ENVIO_BOTON[c.envio_estado];
                return (
                  <div key={c.id} className="rounded-xl border border-border p-3.5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="break-words font-medium">{c.asunto}</p>
                        <p className="break-words text-xs text-muted-foreground">{c.resumen}</p>
                      </div>
                      <Badge variant={c.veces_enviada > 0 ? 'accent' : 'muted'}>{c.veces_enviada} vez(es)</Badge>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Creada: {formatFecha(c.creado_en)}
                      {c.ultimo_envio_en && ` · Último envío: ${formatFecha(c.ultimo_envio_en)}`}
                    </p>
                    {c.envio_enviados > 0 && (
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><MailOpen className="h-3.5 w-3.5" />{Math.round((c.envio_abiertos / c.envio_enviados) * 100)}% abiertos ({c.envio_abiertos})</span>
                        <span className="flex items-center gap-1"><MousePointerClick className="h-3.5 w-3.5" />{Math.round((c.envio_clicks / c.envio_enviados) * 100)}% clicks ({c.envio_clicks})</span>
                        {c.envio_rebotados > 0 && (
                          <span className="flex items-center gap-1 text-amber-600"><MailWarning className="h-3.5 w-3.5" />{c.envio_rebotados} rebotado(s)</span>
                        )}
                        {c.envio_quejas > 0 && (
                          <span className="flex items-center gap-1 text-rose-600"><MailWarning className="h-3.5 w-3.5" />{c.envio_quejas} queja(s)</span>
                        )}
                      </div>
                    )}
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      {c.envio_id && botonEnvio && (
                        <Button size="sm" variant={botonEnvio.variant} onClick={() => navigate(`/comercial/envios/${c.envio_id}`)}>
                          {botonEnvio.label(c)}
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => navigate(`/comercial/contactos?campania_id=${c.id}`)} disabled={envioActivo}>
                        <Send className="h-4 w-4" />Enviar
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => abrirEditar(c.id)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleEliminar(c.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
      )}
    </AdminLayout>
  );
}
