import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Send, Pencil, Trash2, Megaphone, ArrowLeft,
} from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import AdminLayout from '@/components/AdminLayout';
import CampaniaWizard from '@/components/CampaniaWizard';
import MarcaRecursos from '@/components/MarcaRecursos';
import {
  Card, CardHeader, CardTitle, CardContent,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
  Badge, Button,
} from '@/components/ui';
import { SUPERADMIN_NAV } from '../superadmin/navConfig';

function formatFecha(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

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
                Armá el asunto y el mensaje con el asistente. A quién y cuándo se le manda se elige despues, en Contactos.
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Asunto</TableHead>
                  <TableHead className="hidden sm:table-cell">Creada</TableHead>
                  <TableHead>Enviada</TableHead>
                  <TableHead className="hidden md:table-cell">Ultimo envio</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {campanias.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="max-w-[160px] sm:max-w-[240px] md:max-w-[380px]">
                      <p className="truncate font-medium">{c.asunto}</p>
                      <p className="truncate text-xs text-muted-foreground">{c.resumen}</p>
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap text-sm text-muted-foreground sm:table-cell">{formatFecha(c.creado_en)}</TableCell>
                    <TableCell>
                      <Badge variant={c.veces_enviada > 0 ? 'accent' : 'muted'}>{c.veces_enviada} vez(es)</Badge>
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap text-sm text-muted-foreground md:table-cell">{formatFecha(c.ultimo_envio_en)}</TableCell>
                    <TableCell className="max-w-[140px] sm:max-w-none">
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        {(c.envio_estado === 'en_curso' || c.envio_estado === 'pausado') && (
                          <Button
                            size="sm"
                            variant={c.envio_estado === 'pausado' ? 'destructive' : 'accent'}
                            onClick={() => navigate(`/comercial/envios/${c.envio_id}`)}
                          >
                            {c.envio_estado === 'pausado' ? 'Pausado' : `En curso ${c.envio_enviados}/${c.envio_total}`}
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => navigate(`/comercial/contactos?campania_id=${c.id}`)} disabled={c.envio_estado === 'en_curso' || c.envio_estado === 'pausado'}>
                          <Send className="h-4 w-4" /><span className="hidden sm:inline">Enviar</span>
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => abrirEditar(c.id)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => handleEliminar(c.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      )}
    </AdminLayout>
  );
}
