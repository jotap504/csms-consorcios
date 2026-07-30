import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Pencil, Trash2, Gauge, Building2, Wrench } from 'lucide-react';
import { api } from '@/lib/api';
import { getSession } from '@/lib/auth';
import Layout from '@/components/Layout';
import {
  Card, CardHeader, CardTitle, CardContent,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
  Badge, Button, Input, Label, Switch,
  Tabs, TabsList, TabsTrigger, TabsContent,
  Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui';

function navItemsFor(rol) {
  if (rol === 'instalador') {
    return [{ to: '/instalador', label: 'Consorcios', icon: Wrench, end: true }];
  }
  return [
    { to: '/superadmin', label: 'Consorcios', icon: Building2, end: true },
  ];
}

export default function AdminConsorcio() {
  const { id } = useParams();
  const navigate = useNavigate();
  const session = getSession();
  const isSuperadmin = session?.rol === 'superadmin';

  const [consorcio, setConsorcio] = useState(null);
  const [cargadores, setCargadores] = useState([]);
  const [unidades, setUnidades] = useState([]);
  const [tarjetas, setTarjetas] = useState([]);

  const [cargadorOpen, setCargadorOpen] = useState(false);
  const [cargadorForm, setCargadorForm] = useState({ ocpp_id: '', etiqueta: '', charge_point_vendor: '', charge_point_model: '' });

  const [unidadOpen, setUnidadOpen] = useState(false);
  const [unidadForm, setUnidadForm] = useState({ numero_departamento: '', numero_cochera: '', propietario_nombre: '', propietario_email: '' });

  const [tarjetaOpen, setTarjetaOpen] = useState(false);
  const [tarjetaForm, setTarjetaForm] = useState({ id_tag_ocpp: '', uf_id: '' });

  const [dlmOpen, setDlmOpen] = useState(null); // ocpp_id of cargador being configured
  const [dlmAmps, setDlmAmps] = useState('32');
  const [dlmStatus, setDlmStatus] = useState('');

  const [paramsForm, setParamsForm] = useState({ limite_amperios_totales: '', costo_kwh_electricidad: '' });

  async function loadAll() {
    const [c, ca, u, t] = await Promise.all([
      api.get(`/admin/consorcios/${id}`),
      api.get(`/admin/consorcios/${id}/cargadores`),
      api.get(`/admin/consorcios/${id}/unidades`),
      api.get(`/admin/consorcios/${id}/tarjetas`),
    ]);
    setConsorcio(c.data);
    setParamsForm({
      limite_amperios_totales: c.data.limite_amperios_totales ?? '',
      costo_kwh_electricidad: c.data.costo_kwh_electricidad ?? '',
    });
    setCargadores(ca.data);
    setUnidades(u.data);
    setTarjetas(t.data);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
    loadAll();
  }, [id]);

  async function handleCreateCargador(e) {
    e.preventDefault();
    await api.post(`/admin/consorcios/${id}/cargadores`, cargadorForm);
    setCargadorOpen(false);
    setCargadorForm({ ocpp_id: '', etiqueta: '', charge_point_vendor: '', charge_point_model: '' });
    loadAll();
  }

  async function handleDeleteCargador(cargadorId) {
    if (!confirm('Borrar este cargador?')) return;
    await api.delete(`/admin/cargadores/${cargadorId}`);
    loadAll();
  }

  async function handleCreateUnidad(e) {
    e.preventDefault();
    await api.post(`/admin/consorcios/${id}/unidades`, unidadForm);
    setUnidadOpen(false);
    setUnidadForm({ numero_departamento: '', numero_cochera: '', propietario_nombre: '', propietario_email: '' });
    loadAll();
  }

  async function handleDeleteUnidad(unidadId) {
    if (!confirm('Borrar esta unidad funcional?')) return;
    await api.delete(`/admin/unidades/${unidadId}`);
    loadAll();
  }

  async function handleCreateTarjeta(e) {
    e.preventDefault();
    await api.post(`/admin/consorcios/${id}/tarjetas`, { id_tag_ocpp: tarjetaForm.id_tag_ocpp, uf_id: Number(tarjetaForm.uf_id) });
    setTarjetaOpen(false);
    setTarjetaForm({ id_tag_ocpp: '', uf_id: '' });
    loadAll();
  }

  async function toggleTarjeta(tarjetaId, activa) {
    await api.put(`/admin/tarjetas/${tarjetaId}`, { activa: !activa });
    loadAll();
  }

  async function handleDeleteTarjeta(tarjetaId) {
    if (!confirm('Borrar esta tarjeta?')) return;
    await api.delete(`/admin/tarjetas/${tarjetaId}`);
    loadAll();
  }

  async function handleSaveParams(e) {
    e.preventDefault();
    await api.put(`/admin/consorcios/${id}`, {
      limite_amperios_totales: paramsForm.limite_amperios_totales === '' ? null : Number(paramsForm.limite_amperios_totales),
      costo_kwh_electricidad: paramsForm.costo_kwh_electricidad === '' ? null : Number(paramsForm.costo_kwh_electricidad),
    });
    loadAll();
  }

  async function handlePushDlm(ocppId) {
    setDlmStatus('Enviando...');
    try {
      await api.post(`/admin/cargadores/${ocppId}/charging-profile`, { maxAmps: Number(dlmAmps) });
      setDlmStatus('Perfil de carga aplicado.');
    } catch (err) {
      setDlmStatus(err.response?.data?.error ?? 'No se pudo aplicar el perfil de carga.');
    }
  }

  if (!consorcio) {
    return (
      <Layout title="Cargando..." navItems={navItemsFor(session?.rol)}>
        <p className="text-sm text-muted-foreground">Cargando consorcio...</p>
      </Layout>
    );
  }

  return (
    <Layout title={consorcio.nombre} navItems={navItemsFor(session?.rol)}>
      <button
        onClick={() => navigate(isSuperadmin ? '/superadmin' : '/instalador')}
        className="mb-4 flex cursor-pointer items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Volver a consorcios
      </button>

      <Tabs defaultValue="cargadores">
        <TabsList>
          <TabsTrigger value="cargadores">Cargadores</TabsTrigger>
          <TabsTrigger value="unidades">Unidades</TabsTrigger>
          <TabsTrigger value="tarjetas">Tarjetas RFID / NFC</TabsTrigger>
          <TabsTrigger value="parametros">Parametros del edificio</TabsTrigger>
        </TabsList>

        <TabsContent value="cargadores">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Cargadores</CardTitle>
              <Dialog open={cargadorOpen} onOpenChange={setCargadorOpen}>
                <DialogTrigger asChild>
                  <Button size="sm"><Plus className="h-4 w-4" />Agregar cargador</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Nuevo cargador</DialogTitle>
                    <DialogDescription>El ID OCPP debe coincidir con el configurado en el equipo fisico.</DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleCreateCargador} className="flex flex-col gap-3">
                    <div>
                      <Label htmlFor="ocpp_id">ID OCPP</Label>
                      <Input id="ocpp_id" required value={cargadorForm.ocpp_id} onChange={(e) => setCargadorForm({ ...cargadorForm, ocpp_id: e.target.value })} />
                    </div>
                    <div>
                      <Label htmlFor="etiqueta">Etiqueta (identificacion)</Label>
                      <Input id="etiqueta" placeholder="Ej: Cochera 5" value={cargadorForm.etiqueta} onChange={(e) => setCargadorForm({ ...cargadorForm, etiqueta: e.target.value })} />
                    </div>
                    <div>
                      <Label htmlFor="vendor">Fabricante</Label>
                      <Input id="vendor" value={cargadorForm.charge_point_vendor} onChange={(e) => setCargadorForm({ ...cargadorForm, charge_point_vendor: e.target.value })} />
                    </div>
                    <div>
                      <Label htmlFor="model">Modelo</Label>
                      <Input id="model" value={cargadorForm.charge_point_model} onChange={(e) => setCargadorForm({ ...cargadorForm, charge_point_model: e.target.value })} />
                    </div>
                    <Button type="submit" className="mt-2">Agregar</Button>
                  </form>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {cargadores.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay cargadores instalados todavia.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Identificacion</TableHead>
                      <TableHead>ID OCPP</TableHead>
                      <TableHead>Modelo</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cargadores.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.etiqueta || '-'}</TableCell>
                        <TableCell className="font-mono text-xs">{c.ocpp_id}</TableCell>
                        <TableCell>{c.charge_point_vendor} {c.charge_point_model}</TableCell>
                        <TableCell>
                          <Badge variant={c.estado_online ? 'accent' : 'muted'}>{c.estado_online ? 'Online' : 'Offline'}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Dialog open={dlmOpen === c.ocpp_id} onOpenChange={(open) => { setDlmOpen(open ? c.ocpp_id : null); setDlmStatus(''); }}>
                              <DialogTrigger asChild>
                                <Button size="sm" variant="outline" title="Balanceo de carga">
                                  <Gauge className="h-4 w-4" />
                                </Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>Balanceo de carga - {c.etiqueta || c.ocpp_id}</DialogTitle>
                                  <DialogDescription>Envia un limite maximo de corriente (Amperios) al cargador via OCPP.</DialogDescription>
                                </DialogHeader>
                                <div className="flex flex-col gap-3">
                                  <div>
                                    <Label htmlFor="dlmAmps">Corriente maxima (A)</Label>
                                    <Input id="dlmAmps" type="number" min="1" value={dlmAmps} onChange={(e) => setDlmAmps(e.target.value)} />
                                  </div>
                                  {dlmStatus && <p className="text-sm text-muted-foreground">{dlmStatus}</p>}
                                  <Button onClick={() => handlePushDlm(c.ocpp_id)}>Aplicar</Button>
                                </div>
                              </DialogContent>
                            </Dialog>
                            <Button size="sm" variant="destructive" onClick={() => handleDeleteCargador(c.id)} title="Borrar">
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
        </TabsContent>

        <TabsContent value="unidades">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Unidades funcionales</CardTitle>
              <Dialog open={unidadOpen} onOpenChange={setUnidadOpen}>
                <DialogTrigger asChild>
                  <Button size="sm"><Plus className="h-4 w-4" />Agregar unidad</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Nueva unidad funcional</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleCreateUnidad} className="flex flex-col gap-3">
                    <div>
                      <Label htmlFor="depto">Departamento</Label>
                      <Input id="depto" required value={unidadForm.numero_departamento} onChange={(e) => setUnidadForm({ ...unidadForm, numero_departamento: e.target.value })} />
                    </div>
                    <div>
                      <Label htmlFor="cochera">Cochera</Label>
                      <Input id="cochera" value={unidadForm.numero_cochera} onChange={(e) => setUnidadForm({ ...unidadForm, numero_cochera: e.target.value })} />
                    </div>
                    <div>
                      <Label htmlFor="prop">Propietario</Label>
                      <Input id="prop" value={unidadForm.propietario_nombre} onChange={(e) => setUnidadForm({ ...unidadForm, propietario_nombre: e.target.value })} />
                    </div>
                    <div>
                      <Label htmlFor="propEmail">Email propietario</Label>
                      <Input id="propEmail" type="email" value={unidadForm.propietario_email} onChange={(e) => setUnidadForm({ ...unidadForm, propietario_email: e.target.value })} />
                    </div>
                    <Button type="submit" className="mt-2">Agregar</Button>
                  </form>
                </DialogContent>
              </Dialog>
            </CardHeader>
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
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {unidades.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell>{u.numero_departamento}</TableCell>
                        <TableCell>{u.numero_cochera ?? '-'}</TableCell>
                        <TableCell>{u.propietario_nombre}</TableCell>
                        <TableCell className="text-muted-foreground">{u.propietario_email}</TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="destructive" onClick={() => handleDeleteUnidad(u.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
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
              <CardTitle>Tarjetas RFID / NFC</CardTitle>
              <Dialog open={tarjetaOpen} onOpenChange={setTarjetaOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" disabled={unidades.length === 0}><Plus className="h-4 w-4" />Asignar tarjeta</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Asignar tarjeta</DialogTitle>
                    <DialogDescription>Vincula un tag RFID o NFC (celular) a una unidad funcional.</DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleCreateTarjeta} className="flex flex-col gap-3">
                    <div>
                      <Label htmlFor="tag">ID Tag OCPP</Label>
                      <Input id="tag" required value={tarjetaForm.id_tag_ocpp} onChange={(e) => setTarjetaForm({ ...tarjetaForm, id_tag_ocpp: e.target.value })} />
                    </div>
                    <div>
                      <Label htmlFor="uf">Unidad funcional</Label>
                      <select
                        id="uf"
                        required
                        value={tarjetaForm.uf_id}
                        onChange={(e) => setTarjetaForm({ ...tarjetaForm, uf_id: e.target.value })}
                        className="flex h-10 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <option value="">Selecciona una unidad</option>
                        {unidades.map((u) => (
                          <option key={u.id} value={u.id}>{u.numero_departamento} - {u.propietario_nombre}</option>
                        ))}
                      </select>
                    </div>
                    <Button type="submit" className="mt-2">Vincular</Button>
                  </form>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {tarjetas.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay tarjetas asignadas todavia.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID Tag</TableHead>
                      <TableHead>Activa</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tarjetas.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="font-mono text-xs">{t.id_tag_ocpp}</TableCell>
                        <TableCell>
                          <Switch checked={t.activa} onCheckedChange={() => toggleTarjeta(t.id, t.activa)} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="destructive" onClick={() => handleDeleteTarjeta(t.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="parametros">
          <Card>
            <CardHeader><CardTitle>Parametros del edificio</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={handleSaveParams} className="flex max-w-sm flex-col gap-4">
                <div>
                  <Label htmlFor="limiteAmp">Carga maxima de la instalacion (A)</Label>
                  <Input
                    id="limiteAmp"
                    type="number"
                    min="0"
                    value={paramsForm.limite_amperios_totales}
                    onChange={(e) => setParamsForm({ ...paramsForm, limite_amperios_totales: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="costoKwh">Costo por kWh (USD)</Label>
                  <Input
                    id="costoKwh"
                    type="number"
                    step="0.01"
                    min="0"
                    value={paramsForm.costo_kwh_electricidad}
                    onChange={(e) => setParamsForm({ ...paramsForm, costo_kwh_electricidad: e.target.value })}
                  />
                </div>
                <Button type="submit" className="self-start">
                  <Pencil className="h-4 w-4" />
                  Guardar parametros
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </Layout>
  );
}
