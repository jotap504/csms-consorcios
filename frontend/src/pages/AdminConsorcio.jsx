import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import { ArrowLeft, Plus, Pencil, Trash2, Gauge, Building2, Wrench, Activity, QrCode, Download, Copy, PlugZap } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import { api } from '@/lib/api';
import { getSession } from '@/lib/auth';
import { formatElapsed } from '@/lib/utils';
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
  const [sectores, setSectores] = useState([]);

  const [cargadorOpen, setCargadorOpen] = useState(false);
  const [cargadorForm, setCargadorForm] = useState({ ocpp_id: '', etiqueta: '', charge_point_vendor: '', charge_point_model: '', uf_id: '', sector_id: '' });

  const [sectorOpen, setSectorOpen] = useState(false);
  const [sectorForm, setSectorForm] = useState({ nombre: '', limite_amperios_totales: '' });
  const [editSector, setEditSector] = useState(null);
  const [editSectorForm, setEditSectorForm] = useState({ nombre: '', limite_amperios_totales: '' });
  const [medidorOpen, setMedidorOpen] = useState(null);

  const [unidadOpen, setUnidadOpen] = useState(false);
  const [unidadForm, setUnidadForm] = useState({ numero_departamento: '', numero_cochera: '', propietario_nombre: '', propietario_email: '' });

  const [tarjetaOpen, setTarjetaOpen] = useState(false);
  const [tarjetaForm, setTarjetaForm] = useState({ id_tag_ocpp: '', uf_id: '', cargador_id: '' });

  const [live, setLive] = useState([]);
  const liveIntervalRef = useRef(null);

  const [dlmOpen, setDlmOpen] = useState(null); // ocpp_id of cargador being configured
  const [dlmAmps, setDlmAmps] = useState('32');
  const [dlmStatus, setDlmStatus] = useState('');

  const [qrOpen, setQrOpen] = useState(null); // cargador row being shown as QR
  const [qrDataUrl, setQrDataUrl] = useState('');

  async function openQr(c) {
    setQrOpen(c);
    const url = `${window.location.origin}/cargar/${c.ocpp_id}`;
    const dataUrl = await QRCode.toDataURL(url, { width: 320, margin: 2 });
    setQrDataUrl(dataUrl);
  }

  const [editCargador, setEditCargador] = useState(null); // cargador row being edited, or null
  const [editCargadorForm, setEditCargadorForm] = useState({ etiqueta: '', charge_point_vendor: '', charge_point_model: '' });

  const [paramsForm, setParamsForm] = useState({ limite_amperios_totales: '', costo_kwh_electricidad: '' });

  async function loadAll() {
    const [c, ca, u, t, s] = await Promise.all([
      api.get(`/admin/consorcios/${id}`),
      api.get(`/admin/consorcios/${id}/cargadores`),
      api.get(`/admin/consorcios/${id}/unidades`),
      api.get(`/admin/consorcios/${id}/tarjetas`),
      api.get(`/admin/consorcios/${id}/sectores`),
    ]);
    setConsorcio(c.data);
    setParamsForm({
      limite_amperios_totales: c.data.limite_amperios_totales ?? '',
      costo_kwh_electricidad: c.data.costo_kwh_electricidad ?? '',
    });
    setCargadores(ca.data);
    setUnidades(u.data);
    setTarjetas(t.data);
    setSectores(s.data);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
    loadAll();
  }, [id]);

  async function loadLive() {
    const res = await api.get(`/admin/consorcios/${id}/live`);
    setLive(res.data);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
    loadLive();
    liveIntervalRef.current = setInterval(loadLive, 5000);
    return () => clearInterval(liveIntervalRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleCreateCargador(e) {
    e.preventDefault();
    await api.post(`/admin/consorcios/${id}/cargadores`, {
      ...cargadorForm,
      uf_id: cargadorForm.uf_id ? Number(cargadorForm.uf_id) : null,
      sector_id: cargadorForm.sector_id ? Number(cargadorForm.sector_id) : null,
    });
    setCargadorOpen(false);
    setCargadorForm({ ocpp_id: '', etiqueta: '', charge_point_vendor: '', charge_point_model: '', uf_id: '', sector_id: '' });
    loadAll();
  }

  async function handleDeleteCargador(cargadorId) {
    if (!confirm('Borrar este cargador?')) return;
    await api.delete(`/admin/cargadores/${cargadorId}`);
    loadAll();
  }

  async function handleAssignCargadorUf(cargadorId, ufId) {
    await api.put(`/admin/cargadores/${cargadorId}`, { uf_id: ufId ? Number(ufId) : null });
    loadAll();
  }

  async function handleAssignCargadorSector(cargadorId, sectorId) {
    await api.put(`/admin/cargadores/${cargadorId}`, { sector_id: sectorId ? Number(sectorId) : null });
    loadAll();
  }

  function openEditCargador(c) {
    setEditCargador(c);
    setEditCargadorForm({
      etiqueta: c.etiqueta ?? '',
      charge_point_vendor: c.charge_point_vendor ?? '',
      charge_point_model: c.charge_point_model ?? '',
    });
  }

  async function handleEditCargador(e) {
    e.preventDefault();
    await api.put(`/admin/cargadores/${editCargador.id}`, editCargadorForm);
    setEditCargador(null);
    loadAll();
  }

  async function handleCreateSector(e) {
    e.preventDefault();
    await api.post(`/admin/consorcios/${id}/sectores`, {
      nombre: sectorForm.nombre,
      limite_amperios_totales: sectorForm.limite_amperios_totales === '' ? null : Number(sectorForm.limite_amperios_totales),
    });
    setSectorOpen(false);
    setSectorForm({ nombre: '', limite_amperios_totales: '' });
    loadAll();
  }

  function openEditSector(s) {
    setEditSector(s);
    setEditSectorForm({
      nombre: s.nombre ?? '',
      limite_amperios_totales: s.limite_amperios_totales ?? '',
    });
  }

  async function handleEditSector(e) {
    e.preventDefault();
    await api.put(`/admin/sectores/${editSector.id}`, {
      nombre: editSectorForm.nombre,
      limite_amperios_totales: editSectorForm.limite_amperios_totales === '' ? null : Number(editSectorForm.limite_amperios_totales),
    });
    setEditSector(null);
    loadAll();
  }

  async function handleDeleteSector(sectorId) {
    if (!confirm('Borrar este sector? Los cargadores asignados quedan sin sector (usan el limite del edificio).')) return;
    await api.delete(`/admin/sectores/${sectorId}`);
    loadAll();
  }

  async function handleToggleMedidorDinamico(sector) {
    await api.put(`/admin/sectores/${sector.id}`, { usar_medidor_dinamico: !sector.usar_medidor_dinamico });
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
    await api.post(`/admin/consorcios/${id}/tarjetas`, {
      id_tag_ocpp: tarjetaForm.id_tag_ocpp,
      uf_id: Number(tarjetaForm.uf_id),
      cargador_id: tarjetaForm.cargador_id ? Number(tarjetaForm.cargador_id) : null,
    });
    setTarjetaOpen(false);
    setTarjetaForm({ id_tag_ocpp: '', uf_id: '', cargador_id: '' });
    loadAll();
  }

  async function toggleTarjeta(tarjetaId, activa) {
    await api.put(`/admin/tarjetas/${tarjetaId}`, { activa: !activa });
    loadAll();
  }

  async function handleAssignTarjetaCargador(tarjetaId, cargadorId) {
    await api.put(`/admin/tarjetas/${tarjetaId}`, { cargador_id: cargadorId ? Number(cargadorId) : null });
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

  const liveByOcpp = new Map(live.map((c) => [c.ocpp_id, c]));
  const consumoTotalActualKw = live
    .filter((c) => c.activo && c.potencia_actual_kw != null)
    .reduce((sum, c) => sum + Number(c.potencia_actual_kw), 0);

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
          <TabsTrigger value="sectores">Sectores</TabsTrigger>
          <TabsTrigger value="unidades">Unidades</TabsTrigger>
          <TabsTrigger value="tarjetas">Tarjetas RFID / NFC</TabsTrigger>
          <TabsTrigger value="parametros">Parametros del edificio</TabsTrigger>
          <TabsTrigger value="tiempo-real">Tiempo real</TabsTrigger>
        </TabsList>

        <TabsContent value="cargadores">
          <Card>
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>Cargadores</CardTitle>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Activity className="h-3.5 w-3.5" />
                  Consumo total ahora:
                  <span className="tabular-nums font-semibold text-foreground">{consumoTotalActualKw.toFixed(1)} kW</span>
                </p>
              </div>
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
                    <div>
                      <Label htmlFor="cargadorUf">Unidad funcional</Label>
                      <select
                        id="cargadorUf"
                        value={cargadorForm.uf_id}
                        onChange={(e) => setCargadorForm({ ...cargadorForm, uf_id: e.target.value })}
                        className="flex h-10 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <option value="">Sin asignar</option>
                        {unidades.map((u) => (
                          <option key={u.id} value={u.id}>{u.numero_departamento} - {u.propietario_nombre}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="cargadorSector">Sector / piso</Label>
                      <select
                        id="cargadorSector"
                        value={cargadorForm.sector_id}
                        onChange={(e) => setCargadorForm({ ...cargadorForm, sector_id: e.target.value })}
                        className="flex h-10 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <option value="">Sin sector (limite del edificio)</option>
                        {sectores.map((s) => (
                          <option key={s.id} value={s.id}>{s.nombre}</option>
                        ))}
                      </select>
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
                      <TableHead>Unidad asignada</TableHead>
                      <TableHead>Sector</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-right">Conectado hace</TableHead>
                      <TableHead className="text-right">Consumo actual</TableHead>
                      <TableHead className="text-right">Hoy</TableHead>
                      <TableHead className="text-right">Semana</TableHead>
                      <TableHead className="text-right">Mes</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cargadores.map((c) => {
                      const l = liveByOcpp.get(c.ocpp_id);
                      return (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.etiqueta || '-'}</TableCell>
                        <TableCell className="font-mono text-xs">{c.ocpp_id}</TableCell>
                        <TableCell>
                          <select
                            value={c.uf_id ?? ''}
                            onChange={(e) => handleAssignCargadorUf(c.id, e.target.value)}
                            className="h-8 rounded-md border border-border bg-white px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <option value="">Sin asignar</option>
                            {unidades.map((u) => (
                              <option key={u.id} value={u.id}>{u.numero_departamento}{u.numero_cochera ? ` / ${u.numero_cochera}` : ''}</option>
                            ))}
                          </select>
                        </TableCell>
                        <TableCell>
                          <select
                            value={c.sector_id ?? ''}
                            onChange={(e) => handleAssignCargadorSector(c.id, e.target.value)}
                            className="h-8 rounded-md border border-border bg-white px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <option value="">Sin sector</option>
                            {sectores.map((s) => (
                              <option key={s.id} value={s.id}>{s.nombre}</option>
                            ))}
                          </select>
                        </TableCell>
                        <TableCell>
                          <Badge variant={l?.activo ? 'accent' : 'muted'}>{l?.activo ? 'Cargando' : (c.estado_online ? 'Online' : 'Offline')}</Badge>
                        </TableCell>
                        <TableCell className="tabular-nums text-right">
                          {l?.activo ? formatElapsed(l.conectado_desde) : '-'}
                        </TableCell>
                        <TableCell className="tabular-nums text-right">
                          {l?.activo && l?.potencia_actual_kw != null ? `${Number(l.potencia_actual_kw).toFixed(1)} kW` : '-'}
                        </TableCell>
                        <TableCell className="tabular-nums text-right">{Number(l?.kwh_hoy ?? 0).toFixed(1)} kWh</TableCell>
                        <TableCell className="tabular-nums text-right">{Number(l?.kwh_semana ?? 0).toFixed(1)} kWh</TableCell>
                        <TableCell className="tabular-nums text-right">{Number(l?.kwh_mes ?? 0).toFixed(1)} kWh</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="outline" onClick={() => openEditCargador(c)} title="Editar">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => openQr(c)} title="Ver QR para el residente">
                              <QrCode className="h-4 w-4" />
                            </Button>
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
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Dialog open={editCargador != null} onOpenChange={(open) => !open && setEditCargador(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Editar cargador</DialogTitle>
                <DialogDescription>{editCargador?.ocpp_id}</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleEditCargador} className="flex flex-col gap-3">
                <div>
                  <Label htmlFor="editEtiqueta">Etiqueta (identificacion)</Label>
                  <Input
                    id="editEtiqueta"
                    placeholder="Ej: Cochera 5"
                    value={editCargadorForm.etiqueta}
                    onChange={(e) => setEditCargadorForm({ ...editCargadorForm, etiqueta: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="editVendor">Fabricante</Label>
                  <Input
                    id="editVendor"
                    value={editCargadorForm.charge_point_vendor}
                    onChange={(e) => setEditCargadorForm({ ...editCargadorForm, charge_point_vendor: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="editModel">Modelo</Label>
                  <Input
                    id="editModel"
                    value={editCargadorForm.charge_point_model}
                    onChange={(e) => setEditCargadorForm({ ...editCargadorForm, charge_point_model: e.target.value })}
                  />
                </div>
                <Button type="submit" className="mt-2">Guardar cambios</Button>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={qrOpen != null} onOpenChange={(open) => !open && setQrOpen(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>QR de carga - {qrOpen?.etiqueta || qrOpen?.ocpp_id}</DialogTitle>
                <DialogDescription>
                  Imprimi y pega este codigo en el wallbox. El residente lo escanea, inicia sesion (si hace falta) y puede iniciar/detener la carga desde el celular.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col items-center gap-4">
                {qrDataUrl && <img src={qrDataUrl} alt={`QR ${qrOpen?.ocpp_id}`} className="h-64 w-64" />}
                <p className="break-all text-center text-xs text-muted-foreground">
                  {window.location.origin}/cargar/{qrOpen?.ocpp_id}
                </p>
                <a href={qrDataUrl} download={`qr-${qrOpen?.ocpp_id}.png`}>
                  <Button variant="outline" size="sm"><Download className="h-4 w-4" />Descargar PNG</Button>
                </a>
              </div>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="sectores">
          <Card>
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>Sectores / pisos</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Cada sector tiene su propio limite de amperios y se balancea de forma independiente del resto del edificio
                  (util para subsuelos o alas con acometidas electricas separadas). Los cargadores sin sector usan el limite general del edificio.
                </p>
              </div>
              <Dialog open={sectorOpen} onOpenChange={setSectorOpen}>
                <DialogTrigger asChild>
                  <Button size="sm"><Plus className="h-4 w-4" />Agregar sector</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Nuevo sector</DialogTitle>
                    <DialogDescription>Ej: "Subsuelo 1", "Ala Norte".</DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleCreateSector} className="flex flex-col gap-3">
                    <div>
                      <Label htmlFor="sectorNombre">Nombre</Label>
                      <Input id="sectorNombre" required value={sectorForm.nombre} onChange={(e) => setSectorForm({ ...sectorForm, nombre: e.target.value })} />
                    </div>
                    <div>
                      <Label htmlFor="sectorLimite">Limite de amperios de este sector</Label>
                      <Input
                        id="sectorLimite"
                        type="number"
                        min="0"
                        value={sectorForm.limite_amperios_totales}
                        onChange={(e) => setSectorForm({ ...sectorForm, limite_amperios_totales: e.target.value })}
                      />
                    </div>
                    <Button type="submit" className="mt-2">Agregar</Button>
                  </form>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {sectores.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay sectores creados. Todos los cargadores comparten el limite general del edificio.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead className="text-right">Limite (A)</TableHead>
                      <TableHead className="text-right">Cargadores asignados</TableHead>
                      <TableHead>Medidor</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sectores.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">{s.nombre}</TableCell>
                        <TableCell className="tabular-nums text-right">{s.limite_amperios_totales ?? '-'}</TableCell>
                        <TableCell className="tabular-nums text-right">
                          {cargadores.filter((c) => c.sector_id === s.id).length}
                        </TableCell>
                        <TableCell>
                          <button
                            onClick={() => setMedidorOpen(s)}
                            className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                          >
                            <Badge variant={s.usar_medidor_dinamico ? 'accent' : 'muted'}>
                              {s.usar_medidor_dinamico ? 'Dinamico' : 'Estatico'}
                            </Badge>
                            {s.ultima_lectura_en && (
                              <span>hace {formatElapsed(s.ultima_lectura_en)}</span>
                            )}
                          </button>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="outline" onClick={() => openEditSector(s)} title="Editar">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => handleDeleteSector(s.id)} title="Borrar">
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

          <Dialog open={editSector != null} onOpenChange={(open) => !open && setEditSector(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Editar sector</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleEditSector} className="flex flex-col gap-3">
                <div>
                  <Label htmlFor="editSectorNombre">Nombre</Label>
                  <Input
                    id="editSectorNombre"
                    value={editSectorForm.nombre}
                    onChange={(e) => setEditSectorForm({ ...editSectorForm, nombre: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="editSectorLimite">Limite de amperios de este sector</Label>
                  <Input
                    id="editSectorLimite"
                    type="number"
                    min="0"
                    value={editSectorForm.limite_amperios_totales}
                    onChange={(e) => setEditSectorForm({ ...editSectorForm, limite_amperios_totales: e.target.value })}
                  />
                </div>
                <Button type="submit" className="mt-2">Guardar cambios</Button>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={medidorOpen != null} onOpenChange={(open) => !open && setMedidorOpen(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2"><PlugZap className="h-4 w-4" />Medidor - {medidorOpen?.nombre}</DialogTitle>
                <DialogDescription>
                  Conecta un gateway (ESP32, puente MQTT, etc) para que mande lecturas reales del consumo del resto del edificio (sin contar los cargadores EV) a esta URL.
                </DialogDescription>
              </DialogHeader>
              {medidorOpen && (
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between rounded-lg border border-border p-3">
                    <div>
                      <p className="text-sm font-medium">Usar lectura dinamica</p>
                      <p className="text-xs text-muted-foreground">Si esta apagado, se usa siempre el limite fijo de arriba.</p>
                    </div>
                    <Switch
                      checked={medidorOpen.usar_medidor_dinamico}
                      onCheckedChange={() => { handleToggleMedidorDinamico(medidorOpen); setMedidorOpen({ ...medidorOpen, usar_medidor_dinamico: !medidorOpen.usar_medidor_dinamico }); }}
                    />
                  </div>

                  <div>
                    <Label>URL de ingesta (POST)</Label>
                    <div className="flex gap-2">
                      <Input readOnly value={`${window.location.origin}/api/medidor/sectores/${medidorOpen.id}/lectura`} className="font-mono text-xs" />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => navigator.clipboard.writeText(`${window.location.origin}/api/medidor/sectores/${medidorOpen.id}/lectura`)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div>
                    <Label>Header X-Meter-Key</Label>
                    <div className="flex gap-2">
                      <Input readOnly value={medidorOpen.medidor_api_key ?? ''} className="font-mono text-xs" />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => navigator.clipboard.writeText(medidorOpen.medidor_api_key ?? '')}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <p className="rounded-lg bg-muted p-3 font-mono text-xs text-muted-foreground">
                    {'{ "amps_l1": 12.3, "amps_l2": 11.8, "amps_l3": 12.9 }'}
                    <br />o simplemente:
                    <br />
                    {'{ "potencia_kw": 8.2 }'}
                  </p>

                  {medidorOpen.ultima_lectura_en ? (
                    <div className="rounded-lg border border-border p-3 text-sm">
                      <p className="font-medium">Ultima lectura: hace {formatElapsed(medidorOpen.ultima_lectura_en)}</p>
                      <p className="text-xs text-muted-foreground">
                        {medidorOpen.amps_l1 != null && `L1: ${Number(medidorOpen.amps_l1).toFixed(1)}A `}
                        {medidorOpen.amps_l2 != null && `L2: ${Number(medidorOpen.amps_l2).toFixed(1)}A `}
                        {medidorOpen.amps_l3 != null && `L3: ${Number(medidorOpen.amps_l3).toFixed(1)}A `}
                        {medidorOpen.potencia_kw != null && `${Number(medidorOpen.potencia_kw).toFixed(1)} kW`}
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Todavia no llego ninguna lectura para este sector.</p>
                  )}
                </div>
              )}
            </DialogContent>
          </Dialog>
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
                    <div>
                      <Label htmlFor="tarjetaCargador">Cargador (opcional)</Label>
                      <select
                        id="tarjetaCargador"
                        value={tarjetaForm.cargador_id}
                        onChange={(e) => setTarjetaForm({ ...tarjetaForm, cargador_id: e.target.value })}
                        className="flex h-10 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <option value="">Sin asignar</option>
                        {cargadores.map((c) => (
                          <option key={c.id} value={c.id}>{c.etiqueta || c.ocpp_id}</option>
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
                      <TableHead>Cargador asignado</TableHead>
                      <TableHead>Activa</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tarjetas.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="font-mono text-xs">{t.id_tag_ocpp}</TableCell>
                        <TableCell>
                          <select
                            value={t.cargador_id ?? ''}
                            onChange={(e) => handleAssignTarjetaCargador(t.id, e.target.value)}
                            className="h-8 rounded-md border border-border bg-white px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <option value="">Sin asignar</option>
                            {cargadores.map((c) => (
                              <option key={c.id} value={c.id}>{c.etiqueta || c.ocpp_id}</option>
                            ))}
                          </select>
                        </TableCell>
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

        <TabsContent value="tiempo-real">
          <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Activity className="h-4 w-4" />
            Actualiza cada 5 segundos - ultimos 30 minutos
          </div>
          {live.filter((c) => c.readings.length > 0).length === 0 ? (
            <Card>
              <CardContent className="p-5 text-sm text-muted-foreground">
                Ningun cargador tiene lecturas recientes. Los graficos aparecen cuando hay una sesion de carga activa.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {live.filter((c) => c.readings.length > 0).map((c) => {
                const chartData = c.readings.map((r) => ({
                  hora: new Date(r.timestamp).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                  kWh: Number(r.kwh_acumulado),
                }));
                const last = c.readings[c.readings.length - 1];
                return (
                  <Card key={c.ocpp_id}>
                    <CardHeader className="flex-row items-center justify-between">
                      <CardTitle>{c.etiqueta || c.ocpp_id}</CardTitle>
                      <div className="flex items-center gap-2">
                        {c.activo && <Badge variant="accent">Cargando</Badge>}
                        {c.activo && c.conectado_desde && (
                          <span className="text-xs text-muted-foreground">hace {formatElapsed(c.conectado_desde)}</span>
                        )}
                        {last?.potencia_kw != null && (
                          <span className="tabular-nums text-xs text-muted-foreground">{Number(last.potencia_kw).toFixed(1)} kW</span>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="h-56 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e4e7eb" vertical={false} />
                            <XAxis dataKey="hora" tick={{ fontSize: 11 }} stroke="#64748b" />
                            <YAxis tick={{ fontSize: 11 }} stroke="#64748b" />
                            <Tooltip formatter={(value) => [`${value} kWh`, 'Acumulado']} />
                            <Legend wrapperStyle={{ fontSize: 12 }} />
                            <Line type="monotone" dataKey="kWh" name="kWh acumulados" stroke="#059669" strokeWidth={2} dot={false} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </Layout>
  );
}
