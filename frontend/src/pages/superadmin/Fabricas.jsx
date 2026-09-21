import { useEffect, useState } from 'react';
import { Plus, Eye } from 'lucide-react';
import { api } from '@/lib/api';
import AdminLayout from '@/components/AdminLayout';
import {
  Card, CardHeader, CardTitle, CardContent,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
  Badge, Button, Input, Label,
  Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  Tabs, TabsList, TabsTrigger, TabsContent,
} from '@/components/ui';
import { SUPERADMIN_NAV } from './navConfig';

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

// "Fabricas" = fabricantes de wallbox probando su equipo contra nuestro OCPP
// (cuentas de tipo rol=proveedor). No confundir con el modulo "Proveedores"
// (empresas a las que Bilon les compra material) - son cosas distintas que
// antes compartian el mismo nombre en la UI.
export default function Fabricas() {
  const [fabricas, setFabricas] = useState([]);
  const [provOpen, setProvOpen] = useState(false);
  const [provForm, setProvForm] = useState({ nombre_empresa: '', email_contacto: '', password: '' });
  const [provDetail, setProvDetail] = useState(null);
  const [provTests, setProvTests] = useState([]);

  const [conexiones, setConexiones] = useState([]);
  const [conexionDetail, setConexionDetail] = useState(null);
  const [conexionTests, setConexionTests] = useState([]);

  async function loadAll() {
    const { data } = await api.get('/superadmin/proveedores');
    setFabricas(data);
  }

  async function loadConexiones() {
    const { data } = await api.get('/superadmin/ocpp-conexiones');
    setConexiones(data);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAll();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadConexiones();
  }, []);

  async function handleCreateFabrica(e) {
    e.preventDefault();
    await api.post('/superadmin/proveedores', provForm);
    setProvOpen(false);
    setProvForm({ nombre_empresa: '', email_contacto: '', password: '' });
    loadAll();
  }

  async function openFabricaDetail(p) {
    setProvDetail(p);
    const t = await api.get(`/superadmin/proveedores/${p.id}/tests`);
    setProvTests(t.data);
  }

  async function openConexionDetail(c) {
    setConexionDetail(c);
    const t = await api.get(`/superadmin/ocpp-conexiones/${c.ocpp_id}/tests`);
    setConexionTests(t.data);
  }

  return (
    <AdminLayout title="Fabricas" navItems={SUPERADMIN_NAV}>
      <Tabs defaultValue="cuentas">
        <TabsList>
          <TabsTrigger value="cuentas">Cuentas registradas</TabsTrigger>
          <TabsTrigger value="conexiones">Conexiones OCPP</TabsTrigger>
        </TabsList>

        <TabsContent value="cuentas">
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>Fabricas (fabricantes probando su equipo)</CardTitle>
          <Dialog open={provOpen} onOpenChange={setProvOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4" /> Nueva fabrica</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nueva fabrica</DialogTitle>
                <DialogDescription>Le das el usuario y contraseña vos mismo (no se manda mail).</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateFabrica} className="flex flex-col gap-3">
                <div>
                  <Label htmlFor="prov_nombre">Nombre de la empresa</Label>
                  <Input id="prov_nombre" required value={provForm.nombre_empresa} onChange={(e) => setProvForm({ ...provForm, nombre_empresa: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="prov_email">Email (usuario de acceso)</Label>
                  <Input id="prov_email" type="email" required value={provForm.email_contacto} onChange={(e) => setProvForm({ ...provForm, email_contacto: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="prov_password">Contraseña</Label>
                  <Input id="prov_password" type="text" required minLength={8} placeholder="Minimo 8 caracteres" value={provForm.password} onChange={(e) => setProvForm({ ...provForm, password: e.target.value })} />
                </div>
                <Button type="submit" className="mt-2">Crear fabrica</Button>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {fabricas.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay fabricas cargadas todavia.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Contacto</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Cargadores</TableHead>
                  <TableHead className="text-right">Tests (7d)</TableHead>
                  <TableHead className="text-right">Detalle</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fabricas.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.nombre_empresa}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{p.email_contacto}</TableCell>
                    <TableCell><Badge variant={p.activo ? 'accent' : 'muted'}>{p.activo ? 'Activo' : 'Inactivo'}</Badge></TableCell>
                    <TableCell className="tabular-nums text-right">{p.cargadores_emparejados}</TableCell>
                    <TableCell className="tabular-nums text-right">{p.tests_ultimos_7d}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => openFabricaDetail(p)}><Eye className="h-3.5 w-3.5" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="conexiones">
          <Card>
            <CardHeader>
              <CardTitle>Conexiones OCPP (cuentas registradas + tester publico sin login)</CardTitle>
            </CardHeader>
            <CardContent>
              {conexiones.length === 0 ? (
                <p className="text-sm text-muted-foreground">Todavia no se registraron conexiones.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID OCPP</TableHead>
                      <TableHead>Fabricante</TableHead>
                      <TableHead>Modelo</TableHead>
                      <TableHead>Protocolo</TableHead>
                      <TableHead>Online</TableHead>
                      <TableHead className="text-right">Tests</TableHead>
                      <TableHead>Ultima actividad</TableHead>
                      <TableHead className="text-right">Detalle</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {conexiones.map((c) => (
                      <TableRow key={c.ocpp_id}>
                        <TableCell className="font-mono text-xs">{c.ocpp_id}</TableCell>
                        <TableCell className="text-xs">{c.vendor || '-'}</TableCell>
                        <TableCell className="text-xs">{c.modelo || '-'}</TableCell>
                        <TableCell className="text-xs">{c.protocolo || '-'}</TableCell>
                        <TableCell>
                          <Badge variant={c.conectado ? 'accent' : 'muted'}>{c.conectado ? 'Si' : 'No'}</Badge>
                        </TableCell>
                        <TableCell className="tabular-nums text-right">{c.tests_count}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{timeAgo(c.ultima_actividad)}</TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline" onClick={() => openConexionDetail(c)}><Eye className="h-3.5 w-3.5" /></Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={provDetail != null} onOpenChange={(o) => !o && setProvDetail(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{provDetail?.nombre_empresa}</DialogTitle>
            <DialogDescription>Ultimas pruebas registradas por esta fabrica.</DialogDescription>
          </DialogHeader>
          {provTests.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavia no hay pruebas registradas.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cuando</TableHead>
                  <TableHead>Cargador</TableHead>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Accion</TableHead>
                  <TableHead>Resultado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {provTests.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="text-xs text-muted-foreground">{timeAgo(t.creado_en)}</TableCell>
                    <TableCell className="font-mono text-xs">{t.cargador_ocpp_id}</TableCell>
                    <TableCell className="text-xs">{t.usuario_email}</TableCell>
                    <TableCell className="text-xs">{t.accion}</TableCell>
                    <TableCell><Badge variant={t.resultado === 'OK' ? 'accent' : 'destructive'}>{t.resultado}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={conexionDetail != null} onOpenChange={(o) => !o && setConexionDetail(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-mono">{conexionDetail?.ocpp_id}</DialogTitle>
            <DialogDescription>
              {conexionDetail?.vendor || 'Fabricante desconocido'} - {conexionDetail?.modelo || 'modelo desconocido'}. Acciones enviadas desde el tester (remote start/stop/set-amps).
            </DialogDescription>
          </DialogHeader>
          {conexionTests.length === 0 ? (
            <p className="text-sm text-muted-foreground">No se enviaron acciones a este equipo (solo conexion/heartbeat).</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cuando</TableHead>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Accion</TableHead>
                  <TableHead>Resultado</TableHead>
                  <TableHead>Detalle</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {conexionTests.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="text-xs text-muted-foreground">{timeAgo(t.creado_en)}</TableCell>
                    <TableCell className="text-xs">{t.usuario_email || 'sin login'}</TableCell>
                    <TableCell className="text-xs">{t.accion}</TableCell>
                    <TableCell><Badge variant={t.resultado === 'OK' ? 'accent' : 'destructive'}>{t.resultado}</Badge></TableCell>
                    <TableCell className="max-w-xs truncate text-xs text-muted-foreground">{t.detalle || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
