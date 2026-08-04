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

  async function loadCargadores() {
    const ch = await api.get('/superadmin/cargadores');
    setCargadores(ch.data);
  }

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

  const cargadoresActivos = cargadores.filter((c) => c.activo).length;

  return (
    <Layout title="Panel SuperAdmin" navItems={navItems}>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={Building2} label="Consorcios activos" value={consorcios.length} />
        <StatCard icon={Zap} label="Cargadores cargando" value={`${cargadoresActivos} / ${cargadores.length}`} />
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
          <div className="flex items-center justify-between">
            <CardTitle>Cargadores (vista global)</CardTitle>
            <Button variant="outline" size="sm" onClick={loadCargadores}>Actualizar</Button>
          </div>
        </CardHeader>
        <CardContent>
          {cargadores.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay cargadores registrados todavia.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>OCPP ID</TableHead>
                  <TableHead>Consorcio / Sector</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Reportado por el equipo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Ultimo mensaje</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cargadores.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono text-xs">{c.ocpp_id}{c.etiqueta ? <div className="text-muted-foreground">{c.etiqueta}</div> : null}</TableCell>
                    <TableCell>{c.consorcio_nombre}{c.sector_nombre ? <div className="text-xs text-muted-foreground">{c.sector_nombre}</div> : null}</TableCell>
                    <TableCell>{c.ocpp_version}</TableCell>
                    <TableCell className="text-xs">
                      {c.vendor_reportado || c.modelo_reportado ? (
                        <>
                          <div>{c.vendor_reportado} {c.modelo_reportado}</div>
                          {c.firmware_reportado && <div className="text-muted-foreground">fw {c.firmware_reportado}</div>}
                        </>
                      ) : <span className="text-muted-foreground">nunca conecto</span>}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge variant={c.conectado_citrineos ? 'accent' : 'muted'}>
                          {c.conectado_citrineos ? 'Conectado' : 'Desconectado'}
                        </Badge>
                        {c.activo && <Badge variant="accent">Cargando{c.amps_asignados != null ? ` (${c.amps_asignados}A)` : ''}</Badge>}
                        {c.en_cola && <Badge variant="muted">En cola</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{timeAgo(c.ultimo_mensaje)}</TableCell>
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

function timeAgo(iso) {
  if (!iso) return 'nunca';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'recien';
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.floor(hours / 24)} d`;
}
