import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import {
  ArrowLeft, Plus, Pencil, Trash2, Gauge, Building2, Wrench, Activity, QrCode, Download,
  Copy, PlugZap, ChevronDown, ChevronRight, Zap, CreditCard, Upload, Sparkles, X as XIcon,
} from 'lucide-react';
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

const EMPTY_CARGADOR_FORM = { ocpp_id: '', etiqueta: '', charge_point_vendor: '', charge_point_model: '', uf_id: '', sector_id: '', ocpp_version: '2.0.1' };
const EMPTY_TARJETA_FORM = { id_tag_ocpp: '', uf_id: '', cargador_id: '' };
const EMPTY_UNIDAD_FORM = { numero_departamento: '', numero_cochera: '', propietario_nombre: '', propietario_email: '', telefono_propietario: '' };
const EMPTY_QUICK_FORM = {
  numero_departamento: '', numero_cochera: '', propietario_nombre: '', propietario_email: '', telefono_propietario: '',
  ocpp_id: '', etiqueta: '', id_tag_ocpp: '',
};

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

  const [expandedUnidad, setExpandedUnidad] = useState(null);

  const [cargadorOpen, setCargadorOpen] = useState(false);
  const [cargadorForm, setCargadorForm] = useState(EMPTY_CARGADOR_FORM);

  const [sectorOpen, setSectorOpen] = useState(false);
  const [sectorForm, setSectorForm] = useState({ nombre: '', limite_amperios_totales: '' });
  const [editSector, setEditSector] = useState(null);
  const [editSectorForm, setEditSectorForm] = useState({ nombre: '', limite_amperios_totales: '' });
  const [medidorOpen, setMedidorOpen] = useState(null);

  const [unidadOpen, setUnidadOpen] = useState(false);
  const [unidadForm, setUnidadForm] = useState(EMPTY_UNIDAD_FORM);
  const [editUnidad, setEditUnidad] = useState(null);
  const [editUnidadForm, setEditUnidadForm] = useState(EMPTY_UNIDAD_FORM);

  const [quickOpen, setQuickOpen] = useState(false);
  const [quickForm, setQuickForm] = useState(EMPTY_QUICK_FORM);

  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState('');
  const [importRows, setImportRows] = useState(null); // null = todavia no se analizo nada
  const [importSaving, setImportSaving] = useState(false);

  const [tarjetaOpen, setTarjetaOpen] = useState(false);
  const [tarjetaForm, setTarjetaForm] = useState(EMPTY_TARJETA_FORM);

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
  const [editCargadorForm, setEditCargadorForm] = useState({ etiqueta: '', charge_point_vendor: '', charge_point_model: '', ocpp_version: '2.0.1' });

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

  function openNewCargador(ufId) {
    setCargadorForm({ ...EMPTY_CARGADOR_FORM, uf_id: ufId ? String(ufId) : '' });
    setCargadorOpen(true);
  }

  async function handleCreateCargador(e) {
    e.preventDefault();
    await api.post(`/admin/consorcios/${id}/cargadores`, {
      ...cargadorForm,
      uf_id: cargadorForm.uf_id ? Number(cargadorForm.uf_id) : null,
      sector_id: cargadorForm.sector_id ? Number(cargadorForm.sector_id) : null,
    });
    setCargadorOpen(false);
    setCargadorForm(EMPTY_CARGADOR_FORM);
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
      ocpp_version: c.ocpp_version ?? '2.0.1',
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
    setUnidadForm(EMPTY_UNIDAD_FORM);
    loadAll();
  }

  function openEditUnidad(u) {
    setEditUnidad(u);
    setEditUnidadForm({
      numero_departamento: u.numero_departamento ?? '',
      numero_cochera: u.numero_cochera ?? '',
      propietario_nombre: u.propietario_nombre ?? '',
      propietario_email: u.propietario_email ?? '',
      telefono_propietario: u.telefono_propietario ?? '',
    });
  }

  async function handleEditUnidad(e) {
    e.preventDefault();
    await api.put(`/admin/unidades/${editUnidad.id}`, editUnidadForm);
    setEditUnidad(null);
    loadAll();
  }

  async function handleDeleteUnidad(unidadId) {
    if (!confirm('Borrar esta unidad funcional? Tambien se desvinculan sus cargadores y tarjetas.')) return;
    await api.delete(`/admin/unidades/${unidadId}`);
    loadAll();
  }

  function openNewTarjeta(ufId) {
    setTarjetaForm({ ...EMPTY_TARJETA_FORM, uf_id: ufId ? String(ufId) : '' });
    setTarjetaOpen(true);
  }

  async function handleCreateTarjeta(e) {
    e.preventDefault();
    await api.post(`/admin/consorcios/${id}/tarjetas`, {
      id_tag_ocpp: tarjetaForm.id_tag_ocpp,
      uf_id: Number(tarjetaForm.uf_id),
      cargador_id: tarjetaForm.cargador_id ? Number(tarjetaForm.cargador_id) : null,
    });
    setTarjetaOpen(false);
    setTarjetaForm(EMPTY_TARJETA_FORM);
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

  async function handleQuickAdd(e) {
    e.preventDefault();
    const unidad = await api.post(`/admin/consorcios/${id}/unidades`, {
      numero_departamento: quickForm.numero_departamento,
      numero_cochera: quickForm.numero_cochera,
      propietario_nombre: quickForm.propietario_nombre,
      propietario_email: quickForm.propietario_email,
      telefono_propietario: quickForm.telefono_propietario,
    });
    const ufId = unidad.data.id;

    let cargadorId = null;
    if (quickForm.ocpp_id) {
      const cargador = await api.post(`/admin/consorcios/${id}/cargadores`, {
        ocpp_id: quickForm.ocpp_id,
        etiqueta: quickForm.etiqueta,
        uf_id: ufId,
      });
      cargadorId = cargador.data.id;
    }

    if (quickForm.id_tag_ocpp) {
      await api.post(`/admin/consorcios/${id}/tarjetas`, {
        id_tag_ocpp: quickForm.id_tag_ocpp,
        uf_id: ufId,
        cargador_id: cargadorId,
      });
    }

    setQuickOpen(false);
    setQuickForm(EMPTY_QUICK_FORM);
    loadAll();
  }

  function closeImport() {
    setImportOpen(false);
    setImportFile(null);
    setImportError('');
    setImportRows(null);
  }

  async function handleAnalyzeImport() {
    if (!importFile) return;
    setImportLoading(true);
    setImportError('');
    try {
      const formData = new FormData();
      formData.append('file', importFile);
      const { data } = await api.post(`/admin/consorcios/${id}/unidades/import-preview`, formData);
      setImportRows(
        (data.rows ?? []).map((r) => ({
          numero_departamento: r.numero_departamento ?? '',
          numero_cochera: r.numero_cochera ?? '',
          propietario_nombre: r.propietario_nombre ?? '',
          propietario_email: r.propietario_email ?? '',
          telefono_propietario: r.telefono_propietario ?? '',
        })),
      );
    } catch (err) {
      setImportError(err.response?.data?.error || 'No se pudo analizar el archivo.');
    } finally {
      setImportLoading(false);
    }
  }

  function updateImportRow(idx, field, value) {
    setImportRows((rows) => rows.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  }

  function removeImportRow(idx) {
    setImportRows((rows) => rows.filter((_, i) => i !== idx));
  }

  async function handleConfirmImport() {
    setImportSaving(true);
    setImportError('');
    try {
      for (const row of importRows) {
        if (!row.numero_departamento) continue;
        await api.post(`/admin/consorcios/${id}/unidades`, row);
      }
      closeImport();
      loadAll();
    } catch (err) {
      setImportError(err.response?.data?.error || 'Fallo al crear las unidades.');
    } finally {
      setImportSaving(false);
    }
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

      {/* Dialogs compartidos entre tabs (cargador/tarjeta se pueden abrir desde Cargadores o desde Unidades) */}
      <Dialog open={cargadorOpen} onOpenChange={(open) => { setCargadorOpen(open); if (!open) setCargadorForm(EMPTY_CARGADOR_FORM); }}>
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
              <Label htmlFor="ocppVersion">Version OCPP</Label>
              <select
                id="ocppVersion"
                value={cargadorForm.ocpp_version}
                onChange={(e) => setCargadorForm({ ...cargadorForm, ocpp_version: e.target.value })}
                className="flex h-10 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="2.0.1">2.0.1</option>
                <option value="1.6">1.6J</option>
              </select>
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
            <div>
              <Label htmlFor="editOcppVersion">Version OCPP</Label>
              <select
                id="editOcppVersion"
                value={editCargadorForm.ocpp_version}
                onChange={(e) => setEditCargadorForm({ ...editCargadorForm, ocpp_version: e.target.value })}
                className="flex h-10 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="2.0.1">2.0.1</option>
                <option value="1.6">1.6J</option>
              </select>
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

      <Dialog open={tarjetaOpen} onOpenChange={(open) => { setTarjetaOpen(open); if (!open) setTarjetaForm(EMPTY_TARJETA_FORM); }}>
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

      <Dialog open={quickOpen} onOpenChange={(open) => { setQuickOpen(open); if (!open) setQuickForm(EMPTY_QUICK_FORM); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alta rapida</DialogTitle>
            <DialogDescription>Crea la unidad, su cargador y su tarjeta en un solo paso — ideal para el caso comun (1 depto = 1 cochera = 1 auto).</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleQuickAdd} className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto pr-1">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Unidad</p>
            <div>
              <Label htmlFor="qDepto">Departamento</Label>
              <Input id="qDepto" required value={quickForm.numero_departamento} onChange={(e) => setQuickForm({ ...quickForm, numero_departamento: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="qCochera">Cochera</Label>
              <Input id="qCochera" value={quickForm.numero_cochera} onChange={(e) => setQuickForm({ ...quickForm, numero_cochera: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="qProp">Propietario</Label>
              <Input id="qProp" value={quickForm.propietario_nombre} onChange={(e) => setQuickForm({ ...quickForm, propietario_nombre: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="qEmail">Email</Label>
              <Input id="qEmail" type="email" value={quickForm.propietario_email} onChange={(e) => setQuickForm({ ...quickForm, propietario_email: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="qTelefono">Telefono</Label>
              <Input id="qTelefono" value={quickForm.telefono_propietario} onChange={(e) => setQuickForm({ ...quickForm, telefono_propietario: e.target.value })} />
            </div>

            <p className="mt-2 text-xs font-semibold uppercase text-muted-foreground">Cargador (opcional)</p>
            <div>
              <Label htmlFor="qOcpp">ID OCPP</Label>
              <Input id="qOcpp" value={quickForm.ocpp_id} onChange={(e) => setQuickForm({ ...quickForm, ocpp_id: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="qEtiqueta">Etiqueta</Label>
              <Input id="qEtiqueta" placeholder="Ej: Cochera 5" value={quickForm.etiqueta} onChange={(e) => setQuickForm({ ...quickForm, etiqueta: e.target.value })} />
            </div>

            <p className="mt-2 text-xs font-semibold uppercase text-muted-foreground">Tarjeta RFID (opcional)</p>
            <div>
              <Label htmlFor="qTag">ID Tag OCPP</Label>
              <Input id="qTag" value={quickForm.id_tag_ocpp} onChange={(e) => setQuickForm({ ...quickForm, id_tag_ocpp: e.target.value })} />
            </div>

            <Button type="submit" className="mt-2">Crear todo</Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={importOpen} onOpenChange={(open) => { if (!open) closeImport(); else setImportOpen(true); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4" />Importar unidades con IA</DialogTitle>
            <DialogDescription>
              Subi un Excel, CSV o PDF con el listado de unidades del edificio. La IA extrae depto, cochera, propietario, email y telefono —
              revisa y corregi antes de confirmar, no se crea nada automaticamente.
            </DialogDescription>
          </DialogHeader>

          {importRows == null ? (
            <div className="flex flex-col gap-3">
              <Input
                type="file"
                accept=".xlsx,.xls,.csv,.pdf"
                onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
              />
              {importError && (
                <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{importError}</p>
              )}
              <Button onClick={handleAnalyzeImport} disabled={!importFile || importLoading}>
                {importLoading ? 'Analizando...' : 'Analizar archivo'}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {importRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">La IA no encontro unidades en este archivo.</p>
              ) : (
                <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Depto</TableHead>
                        <TableHead>Cochera</TableHead>
                        <TableHead>Propietario</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Telefono</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {importRows.map((row, idx) => (
                        <TableRow key={idx}>
                          <TableCell><Input className="h-8 text-xs" value={row.numero_departamento} onChange={(e) => updateImportRow(idx, 'numero_departamento', e.target.value)} /></TableCell>
                          <TableCell><Input className="h-8 text-xs" value={row.numero_cochera} onChange={(e) => updateImportRow(idx, 'numero_cochera', e.target.value)} /></TableCell>
                          <TableCell><Input className="h-8 text-xs" value={row.propietario_nombre} onChange={(e) => updateImportRow(idx, 'propietario_nombre', e.target.value)} /></TableCell>
                          <TableCell><Input className="h-8 text-xs" value={row.propietario_email} onChange={(e) => updateImportRow(idx, 'propietario_email', e.target.value)} /></TableCell>
                          <TableCell><Input className="h-8 text-xs" value={row.telefono_propietario} onChange={(e) => updateImportRow(idx, 'telefono_propietario', e.target.value)} /></TableCell>
                          <TableCell>
                            <Button size="sm" variant="ghost" onClick={() => removeImportRow(idx)}><XIcon className="h-4 w-4" /></Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              {importError && (
                <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{importError}</p>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setImportRows(null)}>Volver</Button>
                <Button onClick={handleConfirmImport} disabled={importRows.length === 0 || importSaving}>
                  {importSaving ? 'Creando...' : `Confirmar e importar ${importRows.length} unidades`}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Tabs defaultValue="cargadores">
        <TabsList>
          <TabsTrigger value="cargadores">Cargadores</TabsTrigger>
          <TabsTrigger value="sectores">Sectores</TabsTrigger>
          <TabsTrigger value="unidades">Unidades</TabsTrigger>
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
              <Button size="sm" onClick={() => openNewCargador()}><Plus className="h-4 w-4" />Agregar cargador</Button>
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
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
              <CardTitle>Unidades funcionales</CardTitle>
              <div className="flex gap-2">
                <Dialog open={unidadOpen} onOpenChange={setUnidadOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline"><Plus className="h-4 w-4" />Solo unidad</Button>
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
                      <div>
                        <Label htmlFor="propTelefono">Telefono propietario</Label>
                        <Input id="propTelefono" value={unidadForm.telefono_propietario} onChange={(e) => setUnidadForm({ ...unidadForm, telefono_propietario: e.target.value })} />
                      </div>
                      <Button type="submit" className="mt-2">Agregar</Button>
                    </form>
                  </DialogContent>
                </Dialog>
                <Button size="sm" onClick={() => setQuickOpen(true)}><Plus className="h-4 w-4" />Alta rapida</Button>
                <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}><Upload className="h-4 w-4" />Importar Excel/PDF</Button>
              </div>
            </CardHeader>
            <CardContent>
              {unidades.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay unidades funcionales cargadas todavia.</p>
              ) : (
                <div className="flex flex-col divide-y divide-border">
                  {unidades.map((u) => {
                    const isOpen = expandedUnidad === u.id;
                    const misCargadores = cargadores.filter((c) => c.uf_id === u.id);
                    const misTarjetas = tarjetas.filter((t) => t.uf_id === u.id);
                    return (
                      <div key={u.id} className="py-2">
                        <button
                          onClick={() => setExpandedUnidad(isOpen ? null : u.id)}
                          className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-muted"
                        >
                          {isOpen ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                          <div className="flex-1">
                            <p className="text-sm font-medium">
                              {u.numero_departamento}{u.numero_cochera ? ` / ${u.numero_cochera}` : ''}
                              <span className="ml-2 font-normal text-muted-foreground">{u.propietario_nombre}</span>
                            </p>
                            <p className="text-xs text-muted-foreground">{u.propietario_email}{u.telefono_propietario ? ` · ${u.telefono_propietario}` : ''}</p>
                          </div>
                          <span className="flex items-center gap-1 text-xs text-muted-foreground"><Zap className="h-3.5 w-3.5" />{misCargadores.length}</span>
                          <span className="flex items-center gap-1 text-xs text-muted-foreground"><CreditCard className="h-3.5 w-3.5" />{misTarjetas.length}</span>
                        </button>

                        {isOpen && (
                          <div className="ml-7 mt-2 flex flex-col gap-4 rounded-lg border border-border bg-muted/40 p-3">
                            <div className="flex justify-end gap-1">
                              <Button size="sm" variant="outline" onClick={() => openEditUnidad(u)}><Pencil className="h-4 w-4" />Editar</Button>
                              <Button size="sm" variant="destructive" onClick={() => handleDeleteUnidad(u.id)}><Trash2 className="h-4 w-4" />Borrar</Button>
                            </div>

                            <div>
                              <div className="mb-2 flex items-center justify-between">
                                <p className="text-xs font-semibold uppercase text-muted-foreground">Cargadores</p>
                                <Button size="sm" variant="outline" onClick={() => openNewCargador(u.id)}><Plus className="h-4 w-4" />Agregar</Button>
                              </div>
                              {misCargadores.length === 0 ? (
                                <p className="text-xs text-muted-foreground">Sin cargadores asignados.</p>
                              ) : (
                                <ul className="flex flex-col gap-1.5">
                                  {misCargadores.map((c) => (
                                    <li key={c.id} className="flex items-center justify-between rounded-md bg-white px-2.5 py-1.5 text-sm">
                                      <span>{c.etiqueta || c.ocpp_id} <span className="font-mono text-xs text-muted-foreground">({c.ocpp_id})</span></span>
                                      {c.sector_nombre && <Badge variant="muted">{c.sector_nombre}</Badge>}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>

                            <div>
                              <div className="mb-2 flex items-center justify-between">
                                <p className="text-xs font-semibold uppercase text-muted-foreground">Tarjetas RFID / NFC</p>
                                <Button size="sm" variant="outline" onClick={() => openNewTarjeta(u.id)}><Plus className="h-4 w-4" />Agregar</Button>
                              </div>
                              {misTarjetas.length === 0 ? (
                                <p className="text-xs text-muted-foreground">Sin tarjetas asignadas.</p>
                              ) : (
                                <ul className="flex flex-col gap-1.5">
                                  {misTarjetas.map((t) => (
                                    <li key={t.id} className="flex items-center justify-between rounded-md bg-white px-2.5 py-1.5 text-sm">
                                      <span className="font-mono text-xs">{t.id_tag_ocpp}</span>
                                      <div className="flex items-center gap-2">
                                        <Switch checked={t.activa} onCheckedChange={() => toggleTarjeta(t.id, t.activa)} />
                                        <Button size="sm" variant="destructive" onClick={() => handleDeleteTarjeta(t.id)}>
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                      </div>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Dialog open={editUnidad != null} onOpenChange={(open) => !open && setEditUnidad(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Editar unidad</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleEditUnidad} className="flex flex-col gap-3">
                <div>
                  <Label htmlFor="editDepto">Departamento</Label>
                  <Input id="editDepto" value={editUnidadForm.numero_departamento} onChange={(e) => setEditUnidadForm({ ...editUnidadForm, numero_departamento: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="editCochera">Cochera</Label>
                  <Input id="editCochera" value={editUnidadForm.numero_cochera} onChange={(e) => setEditUnidadForm({ ...editUnidadForm, numero_cochera: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="editProp">Propietario</Label>
                  <Input id="editProp" value={editUnidadForm.propietario_nombre} onChange={(e) => setEditUnidadForm({ ...editUnidadForm, propietario_nombre: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="editPropEmail">Email propietario</Label>
                  <Input id="editPropEmail" type="email" value={editUnidadForm.propietario_email} onChange={(e) => setEditUnidadForm({ ...editUnidadForm, propietario_email: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="editPropTelefono">Telefono propietario</Label>
                  <Input id="editPropTelefono" value={editUnidadForm.telefono_propietario} onChange={(e) => setEditUnidadForm({ ...editUnidadForm, telefono_propietario: e.target.value })} />
                </div>
                <Button type="submit" className="mt-2">Guardar cambios</Button>
              </form>
            </DialogContent>
          </Dialog>
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
