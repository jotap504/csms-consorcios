import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, LogIn } from 'lucide-react';
import { api } from '@/lib/api';
import AdminLayout from '@/components/AdminLayout';
import {
  Card, CardHeader, CardTitle, CardContent,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
  Badge, Button, Input, Label,
  Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui';
import { SUPERADMIN_NAV } from './navConfig';

export default function Edificios() {
  const [consorcios, setConsorcios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    nombre: '', cuit_razon_social: '', email_administracion: '',
    costo_kwh_electricidad: '', plan_id: '',
  });

  async function loadAll() {
    setLoading(true);
    const { data } = await api.get('/superadmin/consorcios');
    setConsorcios(data);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAll();
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    await api.post('/superadmin/consorcios', {
      ...form,
      costo_kwh_electricidad: Number(form.costo_kwh_electricidad),
      plan_id: form.plan_id ? Number(form.plan_id) : null,
    });
    setOpen(false);
    setForm({
      nombre: '', cuit_razon_social: '', email_administracion: '', costo_kwh_electricidad: '', plan_id: '',
    });
    loadAll();
  }

  return (
    <AdminLayout title="Locaciones" navItems={SUPERADMIN_NAV}>
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>Instalaciones</CardTitle>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4" />
                Nueva Instalacion
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nueva Instalacion</DialogTitle>
                <DialogDescription>Alta de una instalacion cliente.</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreate} className="flex flex-col gap-3">
                <div>
                  <Label htmlFor="nombre">Nombre</Label>
                  <Input id="nombre" required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="cuit">CUIT / razon social</Label>
                  <Input id="cuit" value={form.cuit_razon_social} onChange={(e) => setForm({ ...form, cuit_razon_social: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="email">Email administracion</Label>
                  <Input id="email" type="email" required value={form.email_administracion} onChange={(e) => setForm({ ...form, email_administracion: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="costo">Costo kWh (USD)</Label>
                  <Input id="costo" type="number" step="0.01" min="0" required value={form.costo_kwh_electricidad} onChange={(e) => setForm({ ...form, costo_kwh_electricidad: e.target.value })} />
                </div>
                <Button type="submit" className="mt-2">Crear Instalacion</Button>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Cargando...</p>
          ) : consorcios.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay instalaciones cargadas todavia.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Costo kWh</TableHead>
                  <TableHead className="text-right">Acceso</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {consorcios.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.nombre}</TableCell>
                    <TableCell>{c.plan_nombre ?? '-'}</TableCell>
                    <TableCell>
                      <Badge variant={c.estado_suscripcion === 'ACTIVO' ? 'accent' : 'destructive'}>
                        {c.estado_suscripcion}
                      </Badge>
                    </TableCell>
                    <TableCell className="tabular-nums text-right">${Number(c.costo_kwh_electricidad).toFixed(2)}</TableCell>
                    <TableCell className="text-right">
                      <Link
                        to={`/admin/consorcio/${c.id}`}
                        className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                      >
                        Entrar
                        <LogIn className="h-3.5 w-3.5" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </AdminLayout>
  );
}
