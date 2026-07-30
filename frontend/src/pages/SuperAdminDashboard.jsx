import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, Zap, Plus, Receipt, LogIn } from 'lucide-react';
import { api } from '@/lib/api';
import Layout from '@/components/Layout';
import {
  StatCard, Card, CardHeader, CardTitle, CardContent,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
  Badge, Button, Input, Label,
  Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui';

const navItems = [{ to: '/superadmin', label: 'Consorcios', icon: Building2, end: true }];

export default function SuperAdminDashboard() {
  const [consorcios, setConsorcios] = useState([]);
  const [cargadores, setCargadores] = useState([]);
  const [planes, setPlanes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    nombre: '', cuit_razon_social: '', email_administracion: '',
    costo_kwh_electricidad: '', plan_id: '',
  });

  async function loadAll() {
    setLoading(true);
    const [c, ch, p] = await Promise.all([
      api.get('/superadmin/consorcios'),
      api.get('/superadmin/cargadores'),
      api.get('/superadmin/planes'),
    ]);
    setConsorcios(c.data);
    setCargadores(ch.data);
    setPlanes(p.data);
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
    setForm({ nombre: '', cuit_razon_social: '', email_administracion: '', costo_kwh_electricidad: '', plan_id: '' });
    loadAll();
  }

  const cargadoresOnline = cargadores.filter((c) => c.estado_online).length;

  return (
    <Layout title="Panel SuperAdmin" navItems={navItems}>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={Building2} label="Consorcios activos" value={consorcios.length} />
        <StatCard icon={Zap} label="Cargadores online" value={`${cargadoresOnline} / ${cargadores.length}`} />
        <StatCard icon={Receipt} label="Planes disponibles" value={planes.length} />
      </div>

      <Card className="mt-6">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Consorcios</CardTitle>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4" />
                Nuevo consorcio
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nuevo consorcio</DialogTitle>
                <DialogDescription>Alta de un edificio cliente.</DialogDescription>
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
                <Button type="submit" className="mt-2">Crear consorcio</Button>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Cargando...</p>
          ) : consorcios.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay consorcios cargados todavia.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Costo kWh</TableHead>
                  <TableHead className="text-right">Instalacion</TableHead>
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

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Cargadores (vista global)</CardTitle>
        </CardHeader>
        <CardContent>
          {cargadores.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay cargadores registrados todavia.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>OCPP ID</TableHead>
                  <TableHead>Consorcio</TableHead>
                  <TableHead>Modelo</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cargadores.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono text-xs">{c.ocpp_id}</TableCell>
                    <TableCell>{c.consorcio_nombre}</TableCell>
                    <TableCell>{c.charge_point_vendor} {c.charge_point_model}</TableCell>
                    <TableCell>
                      <Badge variant={c.estado_online ? 'accent' : 'muted'}>
                        {c.estado_online ? 'Online' : 'Offline'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </Layout>
  );
}
