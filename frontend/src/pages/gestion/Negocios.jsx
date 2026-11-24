import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Boxes, Send } from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import AdminLayout from '@/components/AdminLayout';
import {
  Card, CardHeader, CardTitle, CardContent, Badge, Button,
  Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, Input, Label,
} from '@/components/ui';
import { SUPERADMIN_NAV } from '../superadmin/navConfig';

function VincularTelegramDialog() {
  const [open, setOpen] = useState(false);
  const [datos, setDatos] = useState(null);

  const abrir = async () => {
    setOpen(true);
    try {
      const { data } = await api.get('/gestion/telegram/vincular');
      setDatos(data);
    } catch {
      toast.error('No se pudo generar el codigo de vinculacion.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" onClick={abrir}><Send className="h-4 w-4" />Vincular Telegram</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Vincular Telegram</DialogTitle>
          <DialogDescription>
            {datos?.bot_username ? `Abri Telegram, buscá @${datos.bot_username} y mandale este mensaje:` : 'Mandale este mensaje al bot desde Telegram:'}
          </DialogDescription>
        </DialogHeader>
        {!datos && <p className="text-sm text-muted-foreground">Generando codigo...</p>}
        {datos && (
          <div className="flex flex-col gap-2">
            <code className="rounded-md bg-muted px-3 py-2 text-center text-lg font-semibold">/vincular {datos.codigo}</code>
            <p className="text-xs text-muted-foreground">Vale por {datos.expira_en_minutos} minutos. Despues podes escribirle "Wallbox: ..." con un archivo adjunto, o "reunion con cliente 12/12 10hs" para que te agende y te avise.</p>
            {datos.ya_vinculado && <p className="text-xs text-amber-600">Ya tenias un chat vinculado - este codigo lo va a reemplazar.</p>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function Negocios() {
  const navigate = useNavigate();
  const [negocios, setNegocios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [nombre, setNombre] = useState('');
  const [guardando, setGuardando] = useState(false);

  const load = () => {
    setLoading(true);
    api.get('/gestion/negocios')
      .then(({ data }) => setNegocios(data))
      .catch(() => toast.error('No se pudieron cargar los negocios.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const crear = async (e) => {
    e.preventDefault();
    if (!nombre.trim()) return;
    setGuardando(true);
    try {
      await api.post('/gestion/negocios', { nombre: nombre.trim() });
      toast.success('Negocio creado.');
      setOpen(false);
      setNombre('');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo crear el negocio.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <AdminLayout title="Organizacion" navItems={SUPERADMIN_NAV}>
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle>Negocios</CardTitle>
          <div className="flex items-center gap-2">
          <VincularTelegramDialog />
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4" />Nuevo negocio</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nuevo negocio</DialogTitle>
                <DialogDescription>Un espacio separado para organizar tareas, archivos y chat (ej. Wallbox, Drones, Detector de incendio).</DialogDescription>
              </DialogHeader>
              <form onSubmit={crear} className="flex flex-col gap-3">
                <div>
                  <Label htmlFor="nombre-negocio">Nombre</Label>
                  <Input id="nombre-negocio" value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
                </div>
                <Button type="submit" disabled={guardando}>Crear</Button>
              </form>
            </DialogContent>
          </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {loading && <p className="p-4 text-sm text-muted-foreground">Cargando...</p>}
          {!loading && negocios.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
              <Boxes className="h-8 w-8 opacity-40" />
              Todavia no creaste ningun negocio.
            </div>
          )}
          {!loading && negocios.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {negocios.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => navigate(`/gestion/${n.id}`)}
                  className="flex flex-col items-start gap-1.5 rounded-xl border border-border p-4 text-left transition-colors hover:bg-muted"
                >
                  <div className="flex w-full items-center justify-between gap-2">
                    <p className="font-medium">{n.nombre}</p>
                    {Number(n.pendientes) > 0 && <Badge variant="accent">{n.pendientes} pendiente(s)</Badge>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </AdminLayout>
  );
}
