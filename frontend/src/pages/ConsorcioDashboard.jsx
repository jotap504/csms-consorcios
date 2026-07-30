import { useEffect, useState } from 'react';
import { Zap, Home, CreditCard, Receipt, Download, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import Layout from '@/components/Layout';
import {
  StatCard, Card, CardHeader, CardTitle, CardContent,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
  Badge, Button, Input, Label, Switch,
  Tabs, TabsList, TabsTrigger, TabsContent,
  Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui';

const navItems = [{ to: '/consorcio', label: 'Panel', icon: Home, end: true }];

export default function ConsorcioDashboard() {
  const [liquidaciones, setLiquidaciones] = useState([]);
  const [cargadores, setCargadores] = useState([]);
  const [unidades, setUnidades] = useState([]);
  const [tarjetas, setTarjetas] = useState([]);
  const [periodo, setPeriodo] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ id_tag_ocpp: '', uf_id: '' });

  async function loadAll(currentPeriodo) {
    const [l, c, u, t] = await Promise.all([
      api.get('/consorcio/liquidaciones', { params: currentPeriodo ? { periodo: currentPeriodo } : {} }),
      api.get('/consorcio/cargadores'),
      api.get('/consorcio/unidades'),
      api.get('/consorcio/tarjetas'),
    ]);
    setLiquidaciones(l.data);
    setCargadores(c.data);
    setUnidades(u.data);
    setTarjetas(t.data);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
    loadAll(periodo);
  }, []);

  function handleFilter(e) {
    e.preventDefault();
    loadAll(periodo);
  }

  async function handleExport() {
    const res = await api.get('/consorcio/liquidaciones/export', {
      params: periodo ? { periodo } : {},
      responseType: 'blob',
    });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = `liquidacion_${periodo || 'todas'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleAddTarjeta(e) {
    e.preventDefault();
    await api.post('/consorcio/tarjetas', { id_tag_ocpp: form.id_tag_ocpp, uf_id: Number(form.uf_id) });
    setOpen(false);
    setForm({ id_tag_ocpp: '', uf_id: '' });
    loadAll(periodo);
  }

  async function toggleTarjeta(id, activa) {
    await api.put(`/consorcio/tarjetas/${id}`, { activa: !activa });
    loadAll(periodo);
  }

  const totalKwh = liquidaciones.reduce((sum, l) => sum + Number(l.kwh_consumidos), 0);
  const totalMonto = liquidaciones.reduce((sum, l) => sum + Number(l.monto_total_expensa), 0);

  return (
    <Layout title="Panel Consorcio" navItems={navItems}>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={Zap} label="Sesiones de carga" value={liquidaciones.length} />
        <StatCard icon={Receipt} label="kWh consumidos" value={totalKwh.toFixed(2)} />
        <StatCard icon={CreditCard} label="Total a liquidar" value={`$${totalMonto.toFixed(2)}`} />
      </div>

      <Tabs defaultValue="liquidaciones" className="mt-6">
        <TabsList>
          <TabsTrigger value="liquidaciones">Liquidaciones</TabsTrigger>
          <TabsTrigger value="cargadores">Cargadores</TabsTrigger>
          <TabsTrigger value="unidades">Unidades</TabsTrigger>
          <TabsTrigger value="tarjetas">Tarjetas RFID</TabsTrigger>
        </TabsList>

        <TabsContent value="liquidaciones">
          <Card>
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
              <CardTitle>Liquidaciones de expensas</CardTitle>
              <form onSubmit={handleFilter} className="flex items-center gap-2">
                <Input
                  type="month"
                  value={periodo}
                  onChange={(e) => setPeriodo(e.target.value)}
                  className="w-40"
                />
                <Button type="submit" variant="outline" size="sm">Filtrar</Button>
                <Button type="button" size="sm" onClick={handleExport}>
                  <Download className="h-4 w-4" />
                  Exportar CSV
                </Button>
              </form>
            </CardHeader>
            <CardContent>
              {liquidaciones.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay sesiones de carga registradas para este periodo.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cargador</TableHead>
                      <TableHead>Unidad</TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead className="text-right">kWh</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {liquidaciones.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="font-mono text-xs">{l.cargador_ocpp_id}</TableCell>
                        <TableCell>{l.numero_departamento ?? '-'} {l.propietario_nombre ? `(${l.propietario_nombre})` : ''}</TableCell>
                        <TableCell>{new Date(l.fecha_inicio).toLocaleDateString('es-AR')}</TableCell>
                        <TableCell className="tabular-nums text-right">{Number(l.kwh_consumidos).toFixed(2)}</TableCell>
                        <TableCell className="tabular-nums text-right">${Number(l.monto_total_expensa).toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cargadores">
          <Card>
            <CardHeader><CardTitle>Cargadores del consorcio</CardTitle></CardHeader>
            <CardContent>
              {cargadores.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay cargadores registrados todavia.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>OCPP ID</TableHead>
                      <TableHead>Modelo</TableHead>
                      <TableHead>Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cargadores.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-mono text-xs">{c.ocpp_id}</TableCell>
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
        </TabsContent>

        <TabsContent value="unidades">
          <Card>
            <CardHeader><CardTitle>Unidades funcionales</CardTitle></CardHeader>
            <CardContent>
              {unidades.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay unidades funcionales cargadas todavia.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Depto</TableHead>
                      <TableHead>Cochera</TableHead>
                      <TableHead>Propietario</TableHead>
                      <TableHead>Email</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {unidades.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell>{u.numero_departamento}</TableCell>
                        <TableCell>{u.numero_cochera ?? '-'}</TableCell>
                        <TableCell>{u.propietario_nombre}</TableCell>
                        <TableCell className="text-muted-foreground">{u.propietario_email}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tarjetas">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Tarjetas RFID</CardTitle>
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="h-4 w-4" />
                    Nueva tarjeta
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Nueva tarjeta RFID</DialogTitle>
                    <DialogDescription>Vincula un tag a una unidad funcional.</DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleAddTarjeta} className="flex flex-col gap-3">
                    <div>
                      <Label htmlFor="tag">ID Tag OCPP</Label>
                      <Input id="tag" required value={form.id_tag_ocpp} onChange={(e) => setForm({ ...form, id_tag_ocpp: e.target.value })} />
                    </div>
                    <div>
                      <Label htmlFor="uf">Unidad funcional</Label>
                      <select
                        id="uf"
                        required
                        value={form.uf_id}
                        onChange={(e) => setForm({ ...form, uf_id: e.target.value })}
                        className="flex h-10 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <option value="">Selecciona una unidad</option>
                        {unidades.map((u) => (
                          <option key={u.id} value={u.id}>{u.numero_departamento} - {u.propietario_nombre}</option>
                        ))}
                      </select>
                    </div>
                    <Button type="submit" className="mt-2">Vincular tarjeta</Button>
                  </form>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {tarjetas.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay tarjetas RFID cargadas todavia.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID Tag</TableHead>
                      <TableHead>Unidad</TableHead>
                      <TableHead>Activa</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tarjetas.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="font-mono text-xs">{t.id_tag_ocpp}</TableCell>
                        <TableCell>{t.numero_departamento} ({t.propietario_nombre})</TableCell>
                        <TableCell>
                          <Switch checked={t.activa} onCheckedChange={() => toggleTarjeta(t.id, t.activa)} />
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
    </Layout>
  );
}
