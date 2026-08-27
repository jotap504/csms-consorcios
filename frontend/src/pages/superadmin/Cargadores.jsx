import { useEffect, useMemo, useState } from 'react';
import {
  Settings, ScrollText, Save, AlertTriangle, CalendarClock, X as XIcon, UploadCloud, FileSearch, Download,
} from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import AdminLayout from '@/components/AdminLayout';
import {
  Card, CardHeader, CardTitle, CardContent,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
  Badge, Button, Input,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
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

// Buckets ajustados a los estados reales que existen en cargador_estado_actual
// (Available/Occupied/Preparing/Charging/Finishing/Faulted), no calcados de
// otro proveedor - "Cargando" en vez de "Unavailable" porque asi es como se
// ve un cargador ocupado en nuestros datos reales.
const ESTADO_FILTROS = [
  { value: 'todos', label: 'Todos' },
  { value: 'disponible', label: 'Disponible' },
  { value: 'cargando', label: 'Cargando' },
  { value: 'falla', label: 'Falla' },
  { value: 'offline', label: 'Offline' },
];

function matchesFiltroEstado(c, filtro) {
  if (filtro === 'todos') return true;
  if (filtro === 'offline') return !c.conectado_citrineos;
  if (filtro === 'falla') return c.status_ocpp === 'Faulted';
  if (filtro === 'cargando') return c.activo === true;
  if (filtro === 'disponible') return c.conectado_citrineos && !c.activo && c.status_ocpp === 'Available';
  return true;
}

export default function Cargadores() {
  const [cargadores, setCargadores] = useState([]);
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [configOpen, setConfigOpen] = useState(null);
  const [configItems, setConfigItems] = useState(null);
  const [configBusy, setConfigBusy] = useState(false);
  const [savingKey, setSavingKey] = useState(null);
  const [logOpen, setLogOpen] = useState(null);
  const [logItems, setLogItems] = useState(null);
  const [logBusy, setLogBusy] = useState(false);
  const [alarmasOpen, setAlarmasOpen] = useState(null);
  const [alarmasItems, setAlarmasItems] = useState(null);
  const [alarmasBusy, setAlarmasBusy] = useState(false);
  const [reservasOpen, setReservasOpen] = useState(null);
  const [reservasItems, setReservasItems] = useState(null);
  const [reservasBusy, setReservasBusy] = useState(false);
  const [reservaForm, setReservaForm] = useState({ idTagOcpp: '', expiraEn: '' });
  const [creandoReserva, setCreandoReserva] = useState(false);
  const [firmwareOpen, setFirmwareOpen] = useState(null);
  const [firmwareItems, setFirmwareItems] = useState(null);
  const [firmwareBusy, setFirmwareBusy] = useState(false);
  const [firmwareFile, setFirmwareFile] = useState(null);
  const [subiendoFirmware, setSubiendoFirmware] = useState(false);
  const [diagOpen, setDiagOpen] = useState(null);
  const [diagItems, setDiagItems] = useState(null);
  const [diagBusy, setDiagBusy] = useState(false);
  const [solicitandoDiag, setSolicitandoDiag] = useState(false);

  async function loadCargadores() {
    const { data } = await api.get('/superadmin/cargadores');
    setCargadores(data);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadCargadores();
  }, []);

  const cargadoresFiltrados = useMemo(
    () => cargadores.filter((c) => matchesFiltroEstado(c, filtroEstado)),
    [cargadores, filtroEstado],
  );

  async function openConfig(c) {
    setConfigOpen(c);
    setConfigItems(null);
    setConfigBusy(true);
    try {
      const { data } = await api.get(`/admin/cargadores/${encodeURIComponent(c.ocpp_id)}/configuration`);
      setConfigItems(data.items);
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo leer la configuracion del equipo.');
      setConfigOpen(null);
    } finally {
      setConfigBusy(false);
    }
  }

  async function saveConfigItem(item, newValue) {
    setSavingKey(item.key);
    try {
      const { data } = await api.put(`/admin/cargadores/${encodeURIComponent(configOpen.ocpp_id)}/configuration`, {
        key: item.key,
        value: newValue,
      });
      if (data.ok) {
        toast.success(`${item.key} actualizado.`);
        setConfigItems((items) => items.map((i) => (i.key === item.key ? { ...i, value: newValue } : i)));
      } else {
        toast.error(`El cargador respondio: ${data.status}`);
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo cambiar el parametro.');
    } finally {
      setSavingKey(null);
    }
  }

  async function openLog(c) {
    setLogOpen(c);
    setLogItems(null);
    setLogBusy(true);
    try {
      const { data } = await api.get(`/admin/cargadores/${encodeURIComponent(c.ocpp_id)}/ocpp-log`);
      setLogItems(data);
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo leer el log OCPP.');
      setLogOpen(null);
    } finally {
      setLogBusy(false);
    }
  }

  async function openAlarmas(c) {
    setAlarmasOpen(c);
    setAlarmasItems(null);
    setAlarmasBusy(true);
    try {
      const { data } = await api.get(`/admin/cargadores/${encodeURIComponent(c.ocpp_id)}/alarmas`);
      setAlarmasItems(data);
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo leer el historial de alarmas.');
      setAlarmasOpen(null);
    } finally {
      setAlarmasBusy(false);
    }
  }

  async function openReservas(c) {
    setReservasOpen(c);
    setReservasItems(null);
    setReservaForm({ idTagOcpp: '', expiraEn: '' });
    setReservasBusy(true);
    try {
      const { data } = await api.get(`/admin/consorcios/${c.consorcio_id}/reservas`);
      setReservasItems(data.filter((r) => r.cargador_ocpp_id === c.ocpp_id));
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo leer las reservas.');
      setReservasOpen(null);
    } finally {
      setReservasBusy(false);
    }
  }

  async function crearReserva() {
    if (!reservaForm.idTagOcpp || !reservaForm.expiraEn) return;
    setCreandoReserva(true);
    try {
      await api.post(`/admin/cargadores/${encodeURIComponent(reservasOpen.ocpp_id)}/reservas`, {
        idTagOcpp: reservaForm.idTagOcpp,
        expiraEn: new Date(reservaForm.expiraEn).toISOString(),
      });
      toast.success('Reserva creada.');
      await openReservas(reservasOpen);
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo crear la reserva.');
    } finally {
      setCreandoReserva(false);
    }
  }

  async function cancelarReserva(id) {
    try {
      await api.delete(`/admin/reservas/${id}`);
      toast.success('Reserva cancelada.');
      await openReservas(reservasOpen);
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo cancelar la reserva.');
    }
  }

  async function openFirmware(c) {
    setFirmwareOpen(c);
    setFirmwareItems(null);
    setFirmwareFile(null);
    setFirmwareBusy(true);
    try {
      const { data } = await api.get(`/admin/cargadores/${encodeURIComponent(c.ocpp_id)}/firmware`);
      setFirmwareItems(data);
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo leer el historial de firmware.');
      setFirmwareOpen(null);
    } finally {
      setFirmwareBusy(false);
    }
  }

  async function handleSubirFirmware() {
    if (!firmwareFile) return;
    setSubiendoFirmware(true);
    try {
      const form = new FormData();
      form.append('file', firmwareFile);
      const { data } = await api.post('/admin/firmware', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      await api.post(`/admin/cargadores/${encodeURIComponent(firmwareOpen.ocpp_id)}/firmware`, { filename: data.filename });
      toast.success('Firmware enviado al equipo.');
      setFirmwareFile(null);
      await openFirmware(firmwareOpen);
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo enviar el firmware.');
    } finally {
      setSubiendoFirmware(false);
    }
  }

  async function openDiagnostico(c) {
    setDiagOpen(c);
    setDiagItems(null);
    setDiagBusy(true);
    try {
      const { data } = await api.get(`/admin/cargadores/${encodeURIComponent(c.ocpp_id)}/diagnosticos`);
      setDiagItems(data);
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo leer el historial de diagnosticos.');
      setDiagOpen(null);
    } finally {
      setDiagBusy(false);
    }
  }

  async function handleSolicitarDiagnostico() {
    setSolicitandoDiag(true);
    try {
      await api.post(`/admin/cargadores/${encodeURIComponent(diagOpen.ocpp_id)}/diagnostico`);
      toast.success('Diagnostico solicitado al equipo.');
      await openDiagnostico(diagOpen);
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo solicitar el diagnostico.');
    } finally {
      setSolicitandoDiag(false);
    }
  }

  async function handleDescargarDiagnostico(d) {
    try {
      const response = await api.get(`/admin/diagnosticos/${d.id}/descargar`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(response.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = d.filename;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error('No se pudo descargar el diagnostico.');
    }
  }

  return (
    <AdminLayout title="Cargadores" navItems={SUPERADMIN_NAV}>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Cargadores (vista global)</CardTitle>
            <div className="flex items-center gap-2">
              <Select value={filtroEstado} onValueChange={setFiltroEstado}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ESTADO_FILTROS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={loadCargadores}>Actualizar</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {cargadoresFiltrados.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {cargadores.length === 0 ? 'No hay cargadores registrados todavia.' : 'Ningun cargador coincide con este filtro.'}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>OCPP ID</TableHead>
                  <TableHead>Instalacion / Sector</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Reportado por el equipo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Ultimo mensaje</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cargadoresFiltrados.map((c) => (
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
                        {c.status_ocpp === 'Faulted' && <Badge variant="destructive">Falla</Badge>}
                        {c.activo && <Badge variant="accent">Cargando{c.amps_asignados != null ? ` (${c.amps_asignados}A)` : ''}</Badge>}
                        {c.en_cola && <Badge variant="muted">En cola</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{timeAgo(c.ultimo_mensaje)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="outline" size="sm" onClick={() => openConfig(c)} title="Configuration">
                          <Settings className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => openLog(c)} title="OCPP Log">
                          <ScrollText className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => openAlarmas(c)} title="Alarmas historicas">
                          <AlertTriangle className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => openReservas(c)} title="Reservations">
                          <CalendarClock className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => openFirmware(c)} title="Firmware update remoto">
                          <UploadCloud className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => openDiagnostico(c)} title="Diagnostico remoto">
                          <FileSearch className="h-3.5 w-3.5" />
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

      <Dialog open={configOpen != null} onOpenChange={(o) => !o && setConfigOpen(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Configuration - {configOpen?.ocpp_id}</DialogTitle>
            <DialogDescription>
              Parametros OCPP leidos en vivo del equipo (GetConfiguration/ChangeConfiguration en 1.6, GetVariables/SetVariables en 2.0.1).
            </DialogDescription>
          </DialogHeader>
          {configBusy ? (
            <p className="text-sm text-muted-foreground">Consultando el equipo...</p>
          ) : configItems && configItems.length > 0 ? (
            <div className="max-h-[60vh] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Clave</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {configItems.map((item) => (
                    <ConfigRow
                      key={item.key}
                      item={item}
                      busy={savingKey === item.key}
                      onSave={(v) => saveConfigItem(item, v)}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">El equipo no devolvio parametros.</p>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={logOpen != null} onOpenChange={(o) => !o && setLogOpen(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>OCPP Log - {logOpen?.ocpp_id}</DialogTitle>
            <DialogDescription>Ultimos 100 mensajes OCPP intercambiados con este equipo.</DialogDescription>
          </DialogHeader>
          {logBusy ? (
            <p className="text-sm text-muted-foreground">Cargando...</p>
          ) : logItems && logItems.length > 0 ? (
            <div className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto">
              {logItems.map((l, i) => (
                <details key={i} className="rounded-lg border border-border p-2 text-xs">
                  <summary className="flex cursor-pointer items-center justify-between gap-2">
                    <span className="font-medium">{l.action}</span>
                    <span className="text-muted-foreground">{l.estado}</span>
                    <span className="text-muted-foreground">{new Date(l.timestamp).toLocaleString()}</span>
                  </summary>
                  <pre className="mt-2 overflow-x-auto rounded bg-slate-900 p-2 text-slate-100">
                    {JSON.stringify(l.contenido, null, 2)}
                  </pre>
                </details>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Sin mensajes registrados para este equipo.</p>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={alarmasOpen != null} onOpenChange={(o) => !o && setAlarmasOpen(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Alarmas historicas - {alarmasOpen?.ocpp_id}</DialogTitle>
            <DialogDescription>Solo fallas reales (status Faulted) - el estado en vivo ya se ve en la tabla.</DialogDescription>
          </DialogHeader>
          {alarmasBusy ? (
            <p className="text-sm text-muted-foreground">Cargando...</p>
          ) : alarmasItems && alarmasItems.length > 0 ? (
            <div className="max-h-[60vh] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Estado</TableHead>
                    <TableHead>Codigo de error</TableHead>
                    <TableHead>Hora</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {alarmasItems.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell><Badge variant="destructive">{a.status_ocpp}</Badge></TableCell>
                      <TableCell className="text-xs font-mono">{a.error_code ?? '-'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(a.creado_en).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Sin fallas registradas para este equipo.</p>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={reservasOpen != null} onOpenChange={(o) => !o && setReservasOpen(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Reservations - {reservasOpen?.ocpp_id}</DialogTitle>
            <DialogDescription>Solo cargadores OCPP 2.0.1 (CitrineOS no expone reserveNow para 1.6 todavia).</DialogDescription>
          </DialogHeader>
          <div className="flex items-end gap-2 rounded-lg border border-border p-3">
            <div className="flex-1">
              <label className="mb-1 block text-xs text-muted-foreground">Id tag (tarjeta RFID)</label>
              <Input value={reservaForm.idTagOcpp} onChange={(e) => setReservaForm((f) => ({ ...f, idTagOcpp: e.target.value }))} className="h-8 text-xs" />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs text-muted-foreground">Reservado hasta</label>
              <Input
                type="datetime-local"
                value={reservaForm.expiraEn}
                onChange={(e) => setReservaForm((f) => ({ ...f, expiraEn: e.target.value }))}
                className="h-8 text-xs"
              />
            </div>
            <Button size="sm" disabled={creandoReserva} onClick={crearReserva}>Reservar</Button>
          </div>
          {reservasBusy ? (
            <p className="text-sm text-muted-foreground">Cargando...</p>
          ) : reservasItems && reservasItems.length > 0 ? (
            <div className="max-h-[45vh] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Id tag</TableHead>
                    <TableHead>Hasta</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Origen</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reservasItems.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">{r.id_tag_ocpp}</TableCell>
                      <TableCell className="text-xs">{new Date(r.expira_en).toLocaleString()}</TableCell>
                      <TableCell><Badge variant={r.estado === 'activa' ? 'accent' : 'muted'}>{r.estado}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.creado_por}</TableCell>
                      <TableCell>
                        {r.estado === 'activa' && (
                          <Button size="sm" variant="outline" onClick={() => cancelarReserva(r.id)}>
                            <XIcon className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Sin reservas para este equipo.</p>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={firmwareOpen != null} onOpenChange={(o) => !o && setFirmwareOpen(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Firmware update remoto - {firmwareOpen?.ocpp_id}</DialogTitle>
            <DialogDescription>
              Sube un binario y se envia al equipo via UpdateFirmware (2.0.1) / updateFirmware (1.6). El equipo lo descarga por HTTP.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 rounded-lg border border-border p-3">
            <Input
              type="file"
              onChange={(e) => setFirmwareFile(e.target.files?.[0] ?? null)}
              className="h-8 flex-1 text-xs"
            />
            <Button size="sm" disabled={!firmwareFile || subiendoFirmware} onClick={handleSubirFirmware}>
              Enviar al equipo
            </Button>
          </div>
          {firmwareBusy ? (
            <p className="text-sm text-muted-foreground">Cargando...</p>
          ) : firmwareItems && firmwareItems.length > 0 ? (
            <div className="max-h-[45vh] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Archivo</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Hora</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {firmwareItems.map((f) => (
                    <TableRow key={f.id}>
                      <TableCell className="font-mono text-xs">{f.filename}</TableCell>
                      <TableCell className="text-xs">{f.status}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(f.creado_en).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Sin actualizaciones de firmware para este equipo.</p>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={diagOpen != null} onOpenChange={(o) => !o && setDiagOpen(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Diagnostico remoto - {diagOpen?.ocpp_id}</DialogTitle>
            <DialogDescription>
              Solicita GetLog (2.0.1) / GetDiagnostics (1.6). El equipo sube el archivo al backend cuando termina.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end">
            <Button size="sm" disabled={solicitandoDiag} onClick={handleSolicitarDiagnostico}>
              Solicitar diagnostico
            </Button>
          </div>
          {diagBusy ? (
            <p className="text-sm text-muted-foreground">Cargando...</p>
          ) : diagItems && diagItems.length > 0 ? (
            <div className="max-h-[45vh] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Estado</TableHead>
                    <TableHead>Hora</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {diagItems.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="text-xs">{d.status}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(d.creado_en).toLocaleString()}</TableCell>
                      <TableCell>
                        {d.filename && (
                          <Button size="sm" variant="outline" onClick={() => handleDescargarDiagnostico(d)}>
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Sin diagnosticos solicitados para este equipo.</p>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}

function ConfigRow({ item, busy, onSave }) {
  const [value, setValue] = useState(item.value ?? '');
  const dirty = value !== (item.value ?? '');
  return (
    <TableRow>
      <TableCell className="font-mono text-xs">{item.key}</TableCell>
      <TableCell>
        <Input value={value} onChange={(e) => setValue(e.target.value)} disabled={item.readonly || busy} className="h-8 text-xs" />
      </TableCell>
      <TableCell>
        {!item.readonly && (
          <Button size="sm" variant="outline" disabled={!dirty || busy} onClick={() => onSave(value)}>
            <Save className="h-3.5 w-3.5" />
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}
