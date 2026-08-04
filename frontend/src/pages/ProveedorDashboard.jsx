import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Zap, Plus, Trash2, Play, Square, QrCode, History } from 'lucide-react';
import { api } from '@/lib/api';
import Layout from '@/components/Layout';
import {
  Card, CardHeader, CardTitle, CardContent,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
  Badge, Button, Input, Label,
  Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui';

const navItems = [{ to: '/proveedor', label: 'Mis cargadores', icon: Zap, end: true }];

const EMPTY_FORM = { ocpp_id: '', ocpp_version: '2.0.1', etiqueta: '' };

export default function ProveedorDashboard() {
  const [cargadores, setCargadores] = useState([]);
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [ampsForm, setAmpsForm] = useState({});
  const [qrOpen, setQrOpen] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [busy, setBusy] = useState(null);

  async function loadAll() {
    setLoading(true);
    const [ch, t] = await Promise.all([api.get('/proveedor/cargadores'), api.get('/proveedor/tests')]);
    setCargadores(ch.data);
    setTests(t.data);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAll();
    const id = setInterval(loadAll, 15000);
    return () => clearInterval(id);
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    await api.post('/proveedor/cargadores', form);
    setOpen(false);
    setForm(EMPTY_FORM);
    loadAll();
  }

  async function handleDelete(id) {
    if (!confirm('Desemparejar este cargador?')) return;
    await api.delete(`/proveedor/cargadores/${id}`);
    loadAll();
  }

  async function handleSetAmps(ocppId) {
    const amps = Number(ampsForm[ocppId]);
    if (!amps || amps <= 0) return;
    setBusy(ocppId);
    try {
      await api.post(`/proveedor/cargadores/${ocppId}/set-amps`, { amps });
      await loadAll();
    } catch (err) {
      alert(err.response?.data?.error ?? 'Error al setear amps.');
    } finally {
      setBusy(null);
    }
  }

  async function handleIniciar(ocppId) {
    setBusy(ocppId);
    try {
      await api.post(`/proveedor/cargadores/${ocppId}/iniciar`);
      await loadAll();
    } catch (err) {
      alert(err.response?.data?.error ?? 'Error al iniciar.');
    } finally {
      setBusy(null);
    }
  }

  async function handleDetener(ocppId) {
    setBusy(ocppId);
    try {
      await api.post(`/proveedor/cargadores/${ocppId}/detener`);
      await loadAll();
    } catch (err) {
      alert(err.response?.data?.error ?? 'Error al detener.');
    } finally {
      setBusy(null);
    }
  }

  async function openQr(c) {
    setQrOpen(c);
    const url = `wss://${window.location.host}/ocpp/${c.ocpp_id}`;
    const dataUrl = await QRCode.toDataURL(url, { width: 320, margin: 2 });
    setQrDataUrl(dataUrl);
    await api.post(`/proveedor/cargadores/${c.ocpp_id}/qr-generado`);
    loadAll();
  }

  return (
    <Layout title="Panel Proveedor" navItems={navItems}>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Empareja tus wallbox de prueba y proba el flujo completo (setear amperaje, iniciar/detener carga) sin afectar
          ningun consorcio real.
        </p>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setForm(EMPTY_FORM); }}>
          <DialogTrigger asChild>
            <Button className="shrink-0"><Plus className="h-4 w-4" /> Emparejar cargador</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Emparejar cargador de prueba</DialogTitle>
              <DialogDescription>El ID OCPP debe coincidir con el configurado en tu equipo.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate} className="flex flex-col gap-3">
              <div>
                <Label htmlFor="ocpp_id">ID OCPP</Label>
                <Input id="ocpp_id" required value={form.ocpp_id} onChange={(e) => setForm({ ...form, ocpp_id: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="ocpp_version">Version OCPP</Label>
                <select
                  id="ocpp_version"
                  value={form.ocpp_version}
                  onChange={(e) => setForm({ ...form, ocpp_version: e.target.value })}
                  className="flex h-10 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="2.0.1">2.0.1</option>
                  <option value="1.6">1.6J</option>
                </select>
              </div>
              <div>
                <Label htmlFor="etiqueta">Etiqueta (identificacion)</Label>
                <Input id="etiqueta" placeholder="Ej: Modelo X banco de pruebas" value={form.etiqueta} onChange={(e) => setForm({ ...form, etiqueta: e.target.value })} />
              </div>
              <Button type="submit" className="mt-2">Emparejar</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="mt-6">
        <CardHeader><CardTitle>Mis cargadores</CardTitle></CardHeader>
        <CardContent>
          {!loading && cargadores.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todavia no emparejaste ningun cargador. Conecta tu equipo a{' '}
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">wss://{window.location.host}/ocpp/&lt;TU_ID_OCPP&gt;</code>{' '}
              y despues emparejalo aca.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>OCPP ID</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Reportado por el equipo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Amps</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cargadores.map((c) => {
                  const enCarga = !!c.transaction_id_ocpp;
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-xs">
                        {c.ocpp_id}{c.etiqueta ? <div className="text-muted-foreground">{c.etiqueta}</div> : null}
                      </TableCell>
                      <TableCell>{c.ocpp_version}</TableCell>
                      <TableCell className="text-xs">
                        {c.vendor_reportado || c.modelo_reportado ? (
                          <div>{c.vendor_reportado} {c.modelo_reportado}</div>
                        ) : <span className="text-muted-foreground">nunca conecto</span>}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <Badge variant={c.conectado_citrineos ? 'accent' : 'muted'}>
                            {c.conectado_citrineos ? 'Conectado' : 'Desconectado'}
                          </Badge>
                          {enCarga && <Badge variant="accent">Cargando</Badge>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="6"
                          placeholder="A"
                          className="h-8 w-16"
                          value={ampsForm[c.ocpp_id] ?? ''}
                          onChange={(e) => setAmpsForm({ ...ampsForm, [c.ocpp_id]: e.target.value })}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1.5">
                          <Button size="sm" variant="outline" disabled={busy === c.ocpp_id} onClick={() => handleSetAmps(c.ocpp_id)}>Set</Button>
                          {enCarga ? (
                            <Button size="sm" variant="destructive" disabled={busy === c.ocpp_id} onClick={() => handleDetener(c.ocpp_id)}>
                              <Square className="h-3.5 w-3.5" /> Detener
                            </Button>
                          ) : (
                            <Button size="sm" variant="accent" disabled={busy === c.ocpp_id} onClick={() => handleIniciar(c.ocpp_id)}>
                              <Play className="h-3.5 w-3.5" /> Iniciar
                            </Button>
                          )}
                          <Button size="sm" variant="outline" onClick={() => openQr(c)}><QrCode className="h-3.5 w-3.5" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => handleDelete(c.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
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

      <Card className="mt-6">
        <CardHeader><CardTitle className="flex items-center gap-2"><History className="h-4 w-4" /> Historial de pruebas</CardTitle></CardHeader>
        <CardContent>
          {tests.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavia no hay pruebas registradas.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cuando</TableHead>
                  <TableHead>Cargador</TableHead>
                  <TableHead>Accion</TableHead>
                  <TableHead>Resultado</TableHead>
                  <TableHead>Detalle</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tests.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="text-xs text-muted-foreground">{new Date(t.creado_en).toLocaleString('es-AR')}</TableCell>
                    <TableCell className="font-mono text-xs">{t.cargador_ocpp_id}</TableCell>
                    <TableCell className="text-xs">{t.accion}</TableCell>
                    <TableCell><Badge variant={t.resultado === 'OK' ? 'accent' : 'destructive'}>{t.resultado}</Badge></TableCell>
                    <TableCell className="max-w-xs truncate text-xs text-muted-foreground">{t.detalle}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={qrOpen != null} onOpenChange={(o) => !o && setQrOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>QR de conexion - {qrOpen?.etiqueta || qrOpen?.ocpp_id}</DialogTitle>
            <DialogDescription>Escanealo desde el equipo para configurar el endpoint OCPP.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3">
            {qrDataUrl && <img src={qrDataUrl} alt={`QR ${qrOpen?.ocpp_id}`} className="h-64 w-64" />}
            <code className="break-all rounded bg-muted px-2 py-1 text-center text-xs">
              wss://{window.location.host}/ocpp/{qrOpen?.ocpp_id}
            </code>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
