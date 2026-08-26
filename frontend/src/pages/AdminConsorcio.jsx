import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import {
  ArrowLeft, Plus, Pencil, Trash2, Activity, Download,
  Copy, PlugZap, CreditCard, Upload, Sparkles, X as XIcon, Wallet,
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import { api } from '@/lib/api';
import { getSession } from '@/lib/auth';
import { cn, formatElapsed } from '@/lib/utils';
import { toast } from '@/lib/toast';
import AdminLayout from '@/components/AdminLayout';
import {
  Card, CardHeader, CardTitle, CardContent,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
  Badge, Button, Input, Label, Switch,
  Tabs, TabsList, TabsTrigger, TabsContent,
  Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui';
import { SUPERADMIN_NAV } from './superadmin/navConfig';
import { INSTALADOR_NAV } from './instalador/navConfig';

function navItemsFor(rol) {
  return rol === 'instalador' ? INSTALADOR_NAV : SUPERADMIN_NAV;
}

const EMPTY_TARJETA_FORM = { id_tag_ocpp: '', uf_id: '' };
const EMPTY_UNIDAD_FORM = { numero_departamento: '', numero_cochera: '', propietario_nombre: '', propietario_email: '', telefono_propietario: '' };
const EMPTY_QUICK_FORM = {
  numero_departamento: '', numero_cochera: '', propietario_nombre: '', propietario_email: '', telefono_propietario: '', id_tag_ocpp: '',
};

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function formatPeriodoLargo(periodo) {
  if (!periodo) return '';
  const [anio, mes] = periodo.split('-').map(Number);
  return `${MESES[mes - 1]} ${anio}`;
}

const CONECTOR_LABELS = { type2: 'Type 2', nacs: 'NACS (Tesla)' };
const FASES_LABELS = { monofasico: 'Monofasico', trifasico: 'Trifasico' };
const MONTAJE_LABELS = { pared: 'Pared', pie: 'Pie' };
const OCPP_PROTOCOLO_LABELS = { '1.6': 'OCPP 1.6J', '2.0.1': 'OCPP 2.0.1', ambos: 'OCPP 1.6J/2.0.1' };

// Factor de emision aproximado de la red electrica argentina (fuente
// referencial, no oficial verificada - documentos publicos de CAMMESA/
// Secretaria de Energia citan valores en el orden de 0.3-0.4 kgCO2/kWh
// segun el año y el mix hidro/termico del momento). Esta metrica es
// ilustrativa para el residente, NO un dato certificado para reportes ESG
// formales - confirmar contra la fuente oficial vigente antes de usarla asi.
const FACTOR_CO2_KG_POR_KWH = 0.35;

function stockItemLabel(item) {
  const partes = [item.marca, item.modelo].filter(Boolean).join(' ');
  const specs = [
    item.potencia_kw ? `${item.potencia_kw}kW` : null,
    item.tipo_corriente ?? null,
    FASES_LABELS[item.fases] ?? null,
    CONECTOR_LABELS[item.conector] ?? null,
    OCPP_PROTOCOLO_LABELS[item.ocpp_protocolo] ?? null,
  ].filter(Boolean).join(' / ');
  return `${partes} — ${item.identificador}${specs ? ` (${specs})` : ''}`;
}
const TIPOS_ABONO_ITEM = [
  { value: 'fijo_por_edificio', label: 'Fijo por edificio' },
  { value: 'fijo_por_cochera', label: 'Fijo por cochera' },
  { value: 'prorrateado_activos', label: 'Prorrateado entre activos' },
  { value: 'unico', label: 'Unico (no recurrente)' },
];

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
  const [medidoresModbus, setMedidoresModbus] = useState([]);
  const [medidorModbusForm, setMedidorModbusForm] = useState({
    nombre: '', modelo: 'ADW300', host: '', puerto: '502', unit_id: '1', intervalo_seg: '15',
  });

  const [sectorOpen, setSectorOpen] = useState(false);
  const [sectorForm, setSectorForm] = useState({ nombre: '', limite_amperios_totales: '' });
  const [editSector, setEditSector] = useState(null);
  const [editSectorForm, setEditSectorForm] = useState({ nombre: '', limite_amperios_totales: '' });
  const [medidorOpen, setMedidorOpen] = useState(null);
  const [showGeneralModbusForm, setShowGeneralModbusForm] = useState(false);

  const [unidadOpen, setUnidadOpen] = useState(false);
  const [unidadForm, setUnidadForm] = useState(EMPTY_UNIDAD_FORM);
  const [editUnidad, setEditUnidad] = useState(null);
  const [editUnidadForm, setEditUnidadForm] = useState(EMPTY_UNIDAD_FORM);
  const [nuevaCocheraNumero, setNuevaCocheraNumero] = useState({}); // { [ufId]: string }

  async function handleAddCochera(ufId) {
    const numero = (nuevaCocheraNumero[ufId] ?? '').trim();
    if (!numero) return;
    await api.post(`/admin/unidades/${ufId}/cocheras`, { numero_cochera: numero });
    setNuevaCocheraNumero({ ...nuevaCocheraNumero, [ufId]: '' });
    loadAll();
  }

  async function handleDeleteCochera(cocheraId) {
    if (!confirm('Borrar esta cochera? Si tiene un wallbox asignado, el wallbox queda sin cochera especifica.')) return;
    await api.delete(`/admin/cocheras/${cocheraId}`);
    loadAll();
  }

  const [quickOpen, setQuickOpen] = useState(false);
  const [quickForm, setQuickForm] = useState(EMPTY_QUICK_FORM);

  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState('');
  const [importRows, setImportRows] = useState(null); // null = todavia no se analizo nada
  const [importSaving, setImportSaving] = useState(false);

  const [tarjetaForm, setTarjetaForm] = useState(EMPTY_TARJETA_FORM);
  const [tarjetasUfOpen, setTarjetasUfOpen] = useState(null); // UF row cuyas tarjetas se estan gestionando
  const [recargaOpen, setRecargaOpen] = useState(null); // tarjeta.id cuya recarga se esta cargando
  const [recargaMonto, setRecargaMonto] = useState('');

  const [live, setLive] = useState({ cargadores: [], medidor_general: null });
  const liveIntervalRef = useRef(null);

  const [filtroCochera, setFiltroCochera] = useState('');
  const [filtroTitular, setFiltroTitular] = useState('');
  const [filtroConexion, setFiltroConexion] = useState('todos'); // todos | conectado | desconectado
  const [ordenConsumo, setOrdenConsumo] = useState('ninguno'); // ninguno | mayor | menor

  const [qrOpen, setQrOpen] = useState(null); // cargador row being shown as QR
  const [qrDataUrl, setQrDataUrl] = useState('');

  async function openQr(c) {
    setQrOpen(c);
    const url = `${window.location.origin}/cargar/${c.ocpp_id}`;
    const dataUrl = await QRCode.toDataURL(url, { width: 320, margin: 2 });
    setQrDataUrl(dataUrl);
  }

  const [paramsForm, setParamsForm] = useState({
    limite_amperios_totales: '', costo_kwh_electricidad: '', modo_facturacion: 'administrador', tipo_cliente: 'residencial',
  });

  const periodoActual = new Date().toISOString().slice(0, 7);
  const [periodoFacturacion, setPeriodoFacturacion] = useState(''); // '' = ningun mes seleccionado todavia
  const [facturaYear, setFacturaYear] = useState(new Date().getFullYear());
  const [todasLasFacturas, setTodasLasFacturas] = useState([]); // sin filtro de periodo, para pintar el calendario
  const [abonoItems, setAbonoItems] = useState([]);
  const [cargosPuntuales, setCargosPuntuales] = useState([]);
  const [facturas, setFacturas] = useState([]);
  const [reporteElectrico, setReporteElectrico] = useState([]);

  async function loadAll() {
    const [c, ca, u, t, s, mm, ai, tf] = await Promise.all([
      api.get(`/admin/consorcios/${id}`),
      api.get(`/admin/consorcios/${id}/cargadores`),
      api.get(`/admin/consorcios/${id}/unidades`),
      api.get(`/admin/consorcios/${id}/tarjetas`),
      api.get(`/admin/consorcios/${id}/sectores`),
      api.get(`/admin/consorcios/${id}/medidores-modbus`),
      api.get(`/admin/consorcios/${id}/abono-items`),
      api.get(`/admin/consorcios/${id}/facturas`),
    ]);
    setConsorcio(c.data);
    setParamsForm({
      limite_amperios_totales: c.data.limite_amperios_totales ?? '',
      costo_kwh_electricidad: c.data.costo_kwh_electricidad ?? '',
      modo_facturacion: c.data.modo_facturacion ?? 'administrador',
      tipo_cliente: c.data.tipo_cliente ?? 'residencial',
    });
    setCargadores(ca.data);
    setUnidades(u.data);
    setTarjetas(t.data);
    setSectores(s.data);
    setMedidoresModbus(mm.data);
    setAbonoItems(ai.data);
    setTodasLasFacturas(tf.data);
  }

  async function loadFacturacionPeriodo(periodo) {
    if (!periodo) {
      setCargosPuntuales([]);
      setFacturas([]);
      setReporteElectrico([]);
      return;
    }
    const [cp, f, re] = await Promise.all([
      api.get(`/admin/consorcios/${id}/cargos-puntuales`, { params: { periodo } }),
      api.get(`/admin/consorcios/${id}/facturas`, { params: { periodo } }),
      api.get(`/admin/consorcios/${id}/reporte-electrico`, { params: { periodo } }),
    ]);
    setCargosPuntuales(cp.data);
    setFacturas(f.data);
    setReporteElectrico(re.data);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
    loadAll();
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
    loadFacturacionPeriodo(periodoFacturacion);
  }, [id, periodoFacturacion]);

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

  async function handleDeleteCargador(cargadorId) {
    if (!confirm('Borrar este cargador?')) return;
    await api.delete(`/admin/cargadores/${cargadorId}`);
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

  async function handleToggleMedidorDinamicoGeneral() {
    await api.put(`/admin/consorcios/${id}`, { usar_medidor_dinamico: !consorcio.usar_medidor_dinamico });
    loadAll();
  }

  async function handleToggleSaldoPrepago() {
    await api.put(`/admin/consorcios/${id}`, { usar_saldo_prepago: !consorcio.usar_saldo_prepago });
    loadAll();
  }

  function medidorModbusDe(sectorId) {
    return medidoresModbus.find((m) => m.sector_id === sectorId) ?? null;
  }

  function openMedidorModbusForm(sectorId) {
    const existente = medidorModbusDe(sectorId);
    setMedidorModbusForm(
      existente
        ? {
          nombre: existente.nombre, modelo: existente.modelo, host: existente.host,
          puerto: String(existente.puerto), unit_id: String(existente.unit_id), intervalo_seg: String(existente.intervalo_seg),
        }
        : { nombre: '', modelo: 'ADW300', host: '', puerto: '502', unit_id: '1', intervalo_seg: '15' },
    );
  }

  async function handleSaveMedidorModbus(sectorId) {
    const existente = medidorModbusDe(sectorId);
    const body = {
      sector_id: sectorId,
      nombre: medidorModbusForm.nombre,
      modelo: medidorModbusForm.modelo,
      host: medidorModbusForm.host,
      puerto: Number(medidorModbusForm.puerto) || 502,
      unit_id: Number(medidorModbusForm.unit_id) || 1,
      intervalo_seg: Number(medidorModbusForm.intervalo_seg) || 15,
    };
    if (existente) {
      await api.put(`/admin/medidores-modbus/${existente.id}`, body);
    } else {
      await api.post(`/admin/consorcios/${id}/medidores-modbus`, body);
    }
    loadAll();
  }

  async function handleDeleteMedidorModbus(medidorId) {
    if (!confirm('Borrar la configuracion Modbus de este medidor?')) return;
    await api.delete(`/admin/medidores-modbus/${medidorId}`);
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

  async function handleCreateTarjeta(e) {
    e.preventDefault();
    if (!tarjetaForm.uf_id || !tarjetaForm.id_tag_ocpp) return;
    await api.post(`/admin/consorcios/${id}/tarjetas`, {
      id_tag_ocpp: tarjetaForm.id_tag_ocpp,
      uf_id: Number(tarjetaForm.uf_id),
    });
    setTarjetaForm({ ...EMPTY_TARJETA_FORM, uf_id: tarjetaForm.uf_id });
    loadAll();
  }

  async function toggleTarjeta(tarjetaId, activa) {
    await api.put(`/admin/tarjetas/${tarjetaId}`, { activa: !activa });
    loadAll();
  }

  async function handleRecargarSaldo(tarjetaId) {
    const monto = Number(recargaMonto);
    if (!monto || monto <= 0) return;
    await api.post(`/admin/tarjetas/${tarjetaId}/recargas`, { monto });
    setRecargaOpen(null);
    setRecargaMonto('');
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

    if (quickForm.id_tag_ocpp) {
      await api.post(`/admin/consorcios/${id}/tarjetas`, {
        id_tag_ocpp: quickForm.id_tag_ocpp,
        uf_id: ufId,
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
    try {
      await api.put(`/admin/consorcios/${id}`, {
        limite_amperios_totales: paramsForm.limite_amperios_totales === '' ? null : Number(paramsForm.limite_amperios_totales),
        costo_kwh_electricidad: paramsForm.costo_kwh_electricidad === '' ? null : Number(paramsForm.costo_kwh_electricidad),
        modo_facturacion: paramsForm.modo_facturacion,
        tipo_cliente: paramsForm.tipo_cliente,
      });
      toast.success('Parametros guardados.');
      loadAll();
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudieron guardar los parametros.');
    }
  }

  const [clonarOpen, setClonarOpen] = useState(false);
  const [catalogoAbonos, setCatalogoAbonos] = useState([]);
  const [catalogoSeleccion, setCatalogoSeleccion] = useState([]);

  async function openClonarCatalogo() {
    setClonarOpen(true);
    setCatalogoSeleccion([]);
    const { data } = await api.get('/admin/abono-items-catalogo');
    setCatalogoAbonos(data.filter((p) => p.activo));
  }

  function toggleCatalogoSeleccion(catalogoId) {
    setCatalogoSeleccion((prev) => (prev.includes(catalogoId)
      ? prev.filter((id2) => id2 !== catalogoId)
      : [...prev, catalogoId]));
  }

  async function handleClonarCatalogo(e) {
    e.preventDefault();
    if (catalogoSeleccion.length === 0) return;
    try {
      const { data } = await api.post(`/admin/consorcios/${id}/abono-items/clonar-catalogo`, { catalogo_ids: catalogoSeleccion });
      toast.success(`${data.length} plantilla(s) clonada(s).`);
      setClonarOpen(false);
      loadAll();
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo clonar el catalogo.');
    }
  }

  const [abonoItemOpen, setAbonoItemOpen] = useState(false);
  const [abonoItemForm, setAbonoItemForm] = useState({ nombre: '', tipo: 'fijo_por_cochera', monto: '' });
  const [savingFacturacion, setSavingFacturacion] = useState(false);
  const [editFactura, setEditFactura] = useState(null); // factura row, or null
  const [editFacturaDetalle, setEditFacturaDetalle] = useState([]); // [{concepto, monto}]

  async function handleCreateAbonoItem(e) {
    e.preventDefault();
    setSavingFacturacion(true);
    try {
      await api.post(`/admin/consorcios/${id}/abono-items`, {
        nombre: abonoItemForm.nombre, tipo: abonoItemForm.tipo, monto: Number(abonoItemForm.monto),
      });
      setAbonoItemOpen(false);
      setAbonoItemForm({ nombre: '', tipo: 'fijo_por_cochera', monto: '' });
      toast.success('Abono creado.');
      loadAll();
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo crear el abono.');
    } finally {
      setSavingFacturacion(false);
    }
  }

  async function handleToggleAbonoItem(item) {
    await api.put(`/admin/abono-items/${item.id}`, { activo: !item.activo });
    loadAll();
  }

  async function handleDeleteAbonoItem(itemId) {
    if (!confirm('Borrar este abono?')) return;
    await api.delete(`/admin/abono-items/${itemId}`);
    toast.success('Abono borrado.');
    loadAll();
  }

  const [cargoOpen, setCargoOpen] = useState(false);
  const [cargoForm, setCargoForm] = useState({ uf_id: '', descripcion: '', monto: '' });

  async function handleCreateCargo(e) {
    e.preventDefault();
    setSavingFacturacion(true);
    try {
      await api.post(`/admin/consorcios/${id}/cargos-puntuales`, {
        uf_id: cargoForm.uf_id ? Number(cargoForm.uf_id) : null,
        descripcion: cargoForm.descripcion,
        monto: Number(cargoForm.monto),
        periodo: periodoFacturacion,
      });
      setCargoOpen(false);
      setCargoForm({ uf_id: '', descripcion: '', monto: '' });
      toast.success('Cargo puntual registrado.');
      loadFacturacionPeriodo(periodoFacturacion);
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo crear el cargo.');
    } finally {
      setSavingFacturacion(false);
    }
  }

  async function handleDeleteCargo(cargoId) {
    if (!confirm('Borrar este cargo puntual?')) return;
    await api.delete(`/admin/cargos-puntuales/${cargoId}`);
    toast.success('Cargo borrado.');
    loadFacturacionPeriodo(periodoFacturacion);
  }

  async function reloadTodasLasFacturas() {
    const { data } = await api.get(`/admin/consorcios/${id}/facturas`);
    setTodasLasFacturas(data);
  }

  async function handleGenerarFacturas() {
    if (!confirm(`Generar/actualizar las facturas pendientes de ${periodoFacturacion}?`)) return;
    setSavingFacturacion(true);
    try {
      const { data } = await api.post(`/admin/consorcios/${id}/facturas/generar`, { periodo: periodoFacturacion });
      toast.success(`${data.length} factura(s) generada(s)/actualizada(s).`);
      loadFacturacionPeriodo(periodoFacturacion);
      reloadTodasLasFacturas();
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudieron generar las facturas.');
    } finally {
      setSavingFacturacion(false);
    }
  }

  async function handleMarcarFactura(facturaId, estado) {
    await api.put(`/admin/facturas/${facturaId}`, { estado });
    toast.success(estado === 'pagada' ? 'Factura marcada como pagada.' : 'Factura actualizada.');
    loadFacturacionPeriodo(periodoFacturacion);
    reloadTodasLasFacturas();
  }

  function openEditFactura(f) {
    setEditFactura(f);
    setEditFacturaDetalle(f.detalle.map((d) => ({ concepto: d.concepto, monto: String(d.monto) })));
  }

  async function handleUpdateFacturaDetalle(e) {
    e.preventDefault();
    const detalle = editFacturaDetalle
      .map((d) => ({ concepto: d.concepto.trim(), monto: Number(d.monto) }))
      .filter((d) => d.concepto && d.monto > 0);
    if (detalle.length === 0) {
      toast.error('Agrega al menos un item con concepto y monto.');
      return;
    }
    setSavingFacturacion(true);
    try {
      await api.put(`/admin/facturas/${editFactura.id}`, { detalle });
      toast.success('Factura actualizada.');
      setEditFactura(null);
      loadFacturacionPeriodo(periodoFacturacion);
      reloadTodasLasFacturas();
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo actualizar la factura.');
    } finally {
      setSavingFacturacion(false);
    }
  }

  // ---- Instalacion (stock -> instalacion -> facturar) ----
  const [productos, setProductos] = useState([]);
  const [instalaciones, setInstalaciones] = useState([]);
  const [stockDisponiblePorProducto, setStockDisponiblePorProducto] = useState({});
  const [instForm, setInstForm] = useState({ cochera_id: '', notas: '' });
  const [carrito, setCarrito] = useState([]); // [{producto_id, nombre, serializado, stock_item_id?, identificador?, cantidad?}]
  const [itemPick, setItemPick] = useState({ producto_id: '', stock_item_id: '', cantidad: '1' });
  const [facturarOpen, setFacturarOpen] = useState(null); // instalacion row, or null
  const [facturarForm, setFacturarForm] = useState({ modo: 'kit', descripcion_kit: 'Kit de instalacion completo', monto_kit: '' });
  const [savingInstalacion, setSavingInstalacion] = useState(false);

  async function loadInstalaciones() {
    const [p, inst] = await Promise.all([
      api.get('/admin/productos-catalogo'),
      api.get(`/admin/consorcios/${id}/instalaciones`),
    ]);
    setProductos(p.data);
    setInstalaciones(inst.data);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
    loadInstalaciones();
  }, [id]);

  async function handlePickProducto(productoId) {
    setItemPick({ producto_id: productoId, stock_item_id: '', cantidad: '1' });
    const producto = productos.find((p) => String(p.id) === String(productoId));
    if (producto?.serializado && !stockDisponiblePorProducto[productoId]) {
      const { data } = await api.get('/admin/stock-items', { params: { producto_id: productoId, estado: 'en_stock' } });
      setStockDisponiblePorProducto((prev) => ({ ...prev, [productoId]: data }));
    }
  }

  function handleAgregarAlCarrito() {
    const producto = productos.find((p) => String(p.id) === String(itemPick.producto_id));
    if (!producto) return;
    if (producto.serializado) {
      if (!itemPick.stock_item_id) return;
      const stockItem = (stockDisponiblePorProducto[itemPick.producto_id] || []).find((s) => String(s.id) === String(itemPick.stock_item_id));
      setCarrito([...carrito, {
        producto_id: producto.id, nombre: `${producto.marca ?? ''} ${producto.modelo}`.trim(),
        serializado: true, stock_item_id: stockItem.id, identificador: stockItem.identificador,
      }]);
    } else {
      setCarrito([...carrito, {
        producto_id: producto.id, nombre: `${producto.marca ?? ''} ${producto.modelo}`.trim(),
        serializado: false, cantidad: Number(itemPick.cantidad) || 1,
      }]);
    }
    setItemPick({ producto_id: '', stock_item_id: '', cantidad: '1' });
  }

  function handleQuitarDelCarrito(idx) {
    setCarrito(carrito.filter((_, i) => i !== idx));
  }

  async function handleCrearInstalacion(e) {
    e.preventDefault();
    if (carrito.length === 0) return;
    setSavingInstalacion(true);
    try {
      await api.post(`/admin/consorcios/${id}/instalaciones`, {
        cochera_id: instForm.cochera_id ? Number(instForm.cochera_id) : null,
        notas: instForm.notas || null,
        items: carrito.map((c) => (c.serializado
          ? { producto_id: c.producto_id, stock_item_id: c.stock_item_id }
          : { producto_id: c.producto_id, cantidad: c.cantidad })),
      });
      setCarrito([]);
      setInstForm({ cochera_id: '', notas: '' });
      setStockDisponiblePorProducto({});
      toast.success('Instalacion registrada.');
      loadInstalaciones();
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo registrar la instalacion.');
    } finally {
      setSavingInstalacion(false);
    }
  }

  async function handleFacturarInstalacion(e) {
    e.preventDefault();
    setSavingInstalacion(true);
    try {
      await api.post(`/admin/instalaciones/${facturarOpen.id}/facturar`, {
        modo: facturarForm.modo,
        descripcion_kit: facturarForm.descripcion_kit,
        monto_kit: facturarForm.monto_kit === '' ? null : Number(facturarForm.monto_kit),
        periodo: periodoFacturacion || periodoActual,
      });
      setFacturarOpen(null);
      toast.success('Cargo generado a partir de la instalacion.');
      loadInstalaciones();
      loadFacturacionPeriodo(periodoFacturacion);
      reloadTodasLasFacturas();
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo facturar la instalacion.');
    } finally {
      setSavingInstalacion(false);
    }
  }

  const periodosFacturados = new Set(todasLasFacturas.map((f) => f.periodo));

  const liveByOcpp = new Map(live.cargadores.map((c) => [c.ocpp_id, c]));
  const consumoTotalActualKw = live.cargadores
    .filter((c) => c.activo && c.potencia_actual_kw != null)
    .reduce((sum, c) => sum + Number(c.potencia_actual_kw), 0);

  const cargadoresFiltrados = cargadores
    .filter((c) => {
      const l = liveByOcpp.get(c.ocpp_id);
      const conectado = !!c.estado_online;
      if (filtroCochera && !`${c.uf_numero_departamento ?? ''} ${c.cochera_numero ?? ''}`.toLowerCase().includes(filtroCochera.toLowerCase())) return false;
      if (filtroTitular && !(c.uf_propietario_nombre ?? '').toLowerCase().includes(filtroTitular.toLowerCase())) return false;
      if (filtroConexion === 'conectado' && !conectado) return false;
      if (filtroConexion === 'desconectado' && conectado) return false;
      return true;
    })
    .sort((a, b) => {
      if (ordenConsumo === 'ninguno') return 0;
      const consumoA = liveByOcpp.get(a.ocpp_id)?.potencia_actual_kw ?? 0;
      const consumoB = liveByOcpp.get(b.ocpp_id)?.potencia_actual_kw ?? 0;
      return ordenConsumo === 'mayor' ? consumoB - consumoA : consumoA - consumoB;
    });

  if (!consorcio) {
    return (
      <AdminLayout title="Cargando..." navItems={navItemsFor(session?.rol)}>
        <p className="text-sm text-muted-foreground">Cargando consorcio...</p>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title={consorcio.nombre} breadcrumb="Locaciones" navItems={navItemsFor(session?.rol)}>
      <button
        onClick={() => navigate(isSuperadmin ? '/superadmin/edificios' : '/instalador')}
        className="mb-4 flex cursor-pointer items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Volver a instalaciones
      </button>

      {/* Dialogs compartidos entre tabs (cargador/tarjeta se pueden abrir desde Cargadores o desde Unidades) */}
      <Dialog open={qrOpen != null} onOpenChange={(open) => !open && setQrOpen(null)}>
        <DialogContent className="max-w-lg">
          {qrOpen && (() => {
            const l = liveByOcpp.get(qrOpen.ocpp_id);
            return (
              <>
                <DialogHeader>
                  <DialogTitle>{qrOpen.etiqueta || qrOpen.ocpp_id}</DialogTitle>
                  <DialogDescription>
                    {qrOpen.cochera_numero ? `${qrOpen.uf_numero_departamento} - Cochera ${qrOpen.cochera_numero}` : 'Area comun'}
                    {qrOpen.uf_propietario_nombre ? ` · ${qrOpen.uf_propietario_nombre}` : ''}
                  </DialogDescription>
                </DialogHeader>
                <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1">
                  <div>
                    <p className="mb-1.5 text-xs font-semibold uppercase text-muted-foreground">Estado del equipo</p>
                    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3 text-sm">
                      <Badge variant={l?.activo || qrOpen.estado_online ? 'accent' : 'muted'}>{l?.activo ? 'Cargando' : (qrOpen.estado_online ? 'Online' : 'Offline')}</Badge>
                      {l?.activo && <span className="text-muted-foreground">conectado hace {formatElapsed(l.conectado_desde)}</span>}
                      {qrOpen.ultimo_heartbeat && <span className="text-muted-foreground">ultimo heartbeat hace {formatElapsed(qrOpen.ultimo_heartbeat)}</span>}
                    </div>
                  </div>

                  <div>
                    <p className="mb-1.5 text-xs font-semibold uppercase text-muted-foreground">Ficha tecnica</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-lg border border-border p-3 text-sm">
                      <span className="text-muted-foreground">ID OCPP</span><span className="font-mono text-xs">{qrOpen.ocpp_id}</span>
                      <span className="text-muted-foreground">Fabricante</span><span>{qrOpen.charge_point_vendor || '-'}</span>
                      <span className="text-muted-foreground">Modelo</span><span>{qrOpen.charge_point_model || '-'}</span>
                      <span className="text-muted-foreground">Potencia</span><span>{qrOpen.potencia_kw ? `${qrOpen.potencia_kw} kW` : '-'}</span>
                      <span className="text-muted-foreground">Corriente</span><span>{qrOpen.tipo_corriente || '-'}</span>
                      <span className="text-muted-foreground">Fases</span><span>{FASES_LABELS[qrOpen.fases] ?? '-'}</span>
                      <span className="text-muted-foreground">Conector</span><span>{CONECTOR_LABELS[qrOpen.conector] ?? '-'}</span>
                      <span className="text-muted-foreground">Montaje</span><span>{MONTAJE_LABELS[qrOpen.montaje] ?? '-'}</span>
                      <span className="text-muted-foreground">Protocolo soportado</span><span>{OCPP_PROTOCOLO_LABELS[qrOpen.ocpp_protocolo] ?? '-'}</span>
                      <span className="text-muted-foreground">Version OCPP en uso</span><span>{qrOpen.ocpp_version}</span>
                      <span className="text-muted-foreground">Serie de stock</span><span className="font-mono text-xs">{qrOpen.stock_identificador || '-'}</span>
                    </div>
                  </div>

                  <div>
                    <p className="mb-1.5 text-xs font-semibold uppercase text-muted-foreground">Reportes de consumo (OCPP MeterValues)</p>
                    <div className="grid grid-cols-5 gap-2 rounded-lg border border-border p-3 text-center text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">Actual</p>
                        <p className="tabular-nums font-semibold">{l?.activo && l?.potencia_actual_kw != null ? `${Number(l.potencia_actual_kw).toFixed(1)}kW` : '-'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Hoy</p>
                        <p className="tabular-nums font-semibold">{Number(l?.kwh_hoy ?? 0).toFixed(1)}kWh</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Semana</p>
                        <p className="tabular-nums font-semibold">{Number(l?.kwh_semana ?? 0).toFixed(1)}kWh</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Mes</p>
                        <p className="tabular-nums font-semibold">{Number(l?.kwh_mes ?? 0).toFixed(1)}kWh</p>
                      </div>
                      <div title="Estimado - factor de emision aproximado, no verificado contra fuente oficial">
                        <p className="text-xs text-muted-foreground">CO2 evitado (mes)</p>
                        <p className="tabular-nums font-semibold">{(Number(l?.kwh_mes ?? 0) * FACTOR_CO2_KG_POR_KWH).toFixed(1)}kg</p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <p className="mb-1.5 text-xs font-semibold uppercase text-muted-foreground">QR para el residente</p>
                    <div className="flex flex-col items-center gap-3 rounded-lg border border-border p-3">
                      {qrDataUrl && <img src={qrDataUrl} alt={`QR ${qrOpen.ocpp_id}`} className="h-40 w-40" />}
                      <p className="break-all text-center text-xs text-muted-foreground">
                        {window.location.origin}/cargar/{qrOpen.ocpp_id}
                      </p>
                      <a href={qrDataUrl} download={`qr-${qrOpen.ocpp_id}.png`}>
                        <Button variant="outline" size="sm"><Download className="h-4 w-4" />Descargar PNG</Button>
                      </a>
                    </div>
                  </div>

                  <Button
                    variant="destructive"
                    size="sm"
                    className="self-start"
                    onClick={async () => { await handleDeleteCargador(qrOpen.id); setQrOpen(null); }}
                  >
                    <Trash2 className="h-4 w-4" />Borrar wallbox
                  </Button>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      <Dialog open={quickOpen} onOpenChange={(open) => { setQuickOpen(open); if (!open) setQuickForm(EMPTY_QUICK_FORM); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alta rapida</DialogTitle>
            <DialogDescription>Crea la unidad y su tarjeta en un solo paso. El wallbox se agrega despues desde la solapa Instalacion.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleQuickAdd} className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto pr-1">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Unidad</p>
            <div>
              <Label htmlFor="qDepto">Departamento</Label>
              <Input id="qDepto" required value={quickForm.numero_departamento} onChange={(e) => setQuickForm({ ...quickForm, numero_departamento: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="qCochera">Cochera (opcional)</Label>
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
          <TabsTrigger value="unidades">Unidades</TabsTrigger>
          <TabsTrigger value="parametros">Parametros del edificio</TabsTrigger>
          <TabsTrigger value="instalacion">Instalacion</TabsTrigger>
          <TabsTrigger value="facturacion">Facturacion</TabsTrigger>
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
            </CardHeader>
            <CardContent>
              <div className="mb-4 flex flex-wrap items-end gap-3">
                <div>
                  <Label htmlFor="filtroCochera">Buscar por cochera</Label>
                  <Input id="filtroCochera" placeholder="Depto o cochera" value={filtroCochera} onChange={(e) => setFiltroCochera(e.target.value)} className="h-9 w-40" />
                </div>
                <div>
                  <Label htmlFor="filtroTitular">Buscar por titular</Label>
                  <Input id="filtroTitular" placeholder="Nombre" value={filtroTitular} onChange={(e) => setFiltroTitular(e.target.value)} className="h-9 w-40" />
                </div>
                <div>
                  <Label htmlFor="filtroConexion">Conexion</Label>
                  <select
                    id="filtroConexion"
                    value={filtroConexion}
                    onChange={(e) => setFiltroConexion(e.target.value)}
                    className="h-9 rounded-lg border border-border bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="todos">Todos</option>
                    <option value="conectado">Conectado</option>
                    <option value="desconectado">Desconectado</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="ordenConsumo">Consumo actual</Label>
                  <select
                    id="ordenConsumo"
                    value={ordenConsumo}
                    onChange={(e) => setOrdenConsumo(e.target.value)}
                    className="h-9 rounded-lg border border-border bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="ninguno">Sin ordenar</option>
                    <option value="mayor">Mayor primero</option>
                    <option value="menor">Menor primero</option>
                  </select>
                </div>
                {(filtroCochera || filtroTitular || filtroConexion !== 'todos' || ordenConsumo !== 'ninguno') && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => { setFiltroCochera(''); setFiltroTitular(''); setFiltroConexion('todos'); setOrdenConsumo('ninguno'); }}
                  >
                    Limpiar filtros
                  </Button>
                )}
              </div>

              {cargadores.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay cargadores instalados todavia.</p>
              ) : cargadoresFiltrados.length === 0 ? (
                <p className="text-sm text-muted-foreground">Ningun cargador coincide con los filtros.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID OCPP</TableHead>
                      <TableHead>Cochera</TableHead>
                      <TableHead>Sector</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-right">Conectado hace</TableHead>
                      <TableHead className="text-right">Consumo actual</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cargadoresFiltrados.map((c) => {
                      const l = liveByOcpp.get(c.ocpp_id);
                      return (
                      <TableRow key={c.id} className="cursor-pointer" onClick={() => openQr(c)}>
                        <TableCell className="font-mono text-xs">{c.ocpp_id}</TableCell>
                        <TableCell>
                          {c.cochera_numero ? `${c.uf_numero_departamento} - Cochera ${c.cochera_numero}` : 'Area comun'}
                        </TableCell>
                        <TableCell>{c.sector_nombre ?? '-'}</TableCell>
                        <TableCell>
                          <Badge variant={l?.activo || c.estado_online ? 'accent' : 'muted'}>{l?.activo ? 'Cargando' : (c.estado_online ? 'Online' : 'Offline')}</Badge>
                        </TableCell>
                        <TableCell className="tabular-nums text-right">
                          {l?.activo ? formatElapsed(l.conectado_desde) : '-'}
                        </TableCell>
                        <TableCell className="tabular-nums text-right">
                          {l?.activo && l?.potencia_actual_kw != null ? `${Number(l.potencia_actual_kw).toFixed(1)} kW` : '-'}
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
                        <Label htmlFor="cochera">Cochera (opcional, podes agregar mas despues)</Label>
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
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Unidad funcional</TableHead>
                      <TableHead>Cochera</TableHead>
                      <TableHead>Titular</TableHead>
                      <TableHead>Mail</TableHead>
                      <TableHead>Celular</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {unidades.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium">{u.numero_departamento}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1">
                            {(u.cocheras ?? []).map((coch) => (
                              <Badge key={coch.id} variant="muted" className="gap-1">
                                {coch.numero_cochera}
                                <button type="button" onClick={() => handleDeleteCochera(coch.id)} className="cursor-pointer text-muted-foreground hover:text-destructive" title="Borrar cochera">
                                  <XIcon className="h-3 w-3" />
                                </button>
                              </Badge>
                            ))}
                            <button
                              type="button"
                              onClick={() => {
                                const numero = prompt('Numero de la nueva cochera:');
                                if (numero && numero.trim()) {
                                  setNuevaCocheraNumero({ ...nuevaCocheraNumero, [u.id]: numero.trim() });
                                  handleAddCochera(u.id);
                                }
                              }}
                              className="cursor-pointer rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                              title="Agregar cochera"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </TableCell>
                        <TableCell>{u.propietario_nombre || '-'}</TableCell>
                        <TableCell className="text-xs">{u.propietario_email || '-'}</TableCell>
                        <TableCell className="text-xs">{u.telefono_propietario || '-'}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="outline" onClick={() => setTarjetasUfOpen(u)} title="Tarjetas RFID/NFC">
                              <CreditCard className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => openEditUnidad(u)} title="Editar">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => handleDeleteUnidad(u.id)} title="Borrar">
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

          <Dialog open={tarjetasUfOpen != null} onOpenChange={(open) => !open && setTarjetasUfOpen(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Tarjetas RFID/NFC - {tarjetasUfOpen?.numero_departamento}</DialogTitle>
                <DialogDescription>Una tarjeta activada sirve para cualquiera de los wallbox de esta unidad.</DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-3">
                {tarjetasUfOpen && tarjetas.filter((t) => t.uf_id === tarjetasUfOpen.id).length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sin tarjetas asignadas.</p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {tarjetasUfOpen && tarjetas.filter((t) => t.uf_id === tarjetasUfOpen.id).map((t) => (
                      <li key={t.id} className="flex flex-col gap-1.5 rounded-md bg-muted px-2.5 py-1.5 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-xs">{t.id_tag_ocpp}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">Saldo: ${Number(t.saldo ?? 0).toFixed(2)}</span>
                            <Button size="sm" variant="outline" onClick={() => { setRecargaOpen(t.id); setRecargaMonto(''); }}>
                              <Wallet className="h-3.5 w-3.5" />
                            </Button>
                            <Switch checked={t.activa} onCheckedChange={() => toggleTarjeta(t.id, t.activa)} />
                            <Button size="sm" variant="destructive" onClick={() => handleDeleteTarjeta(t.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                        {recargaOpen === t.id && (
                          <div className="flex gap-2 border-t border-border pt-1.5">
                            <Input
                              type="number"
                              placeholder="Monto a recargar"
                              value={recargaMonto}
                              onChange={(e) => setRecargaMonto(e.target.value)}
                              className="h-8 text-xs"
                            />
                            <Button size="sm" onClick={() => handleRecargarSaldo(t.id)}>Confirmar</Button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                <form onSubmit={handleCreateTarjeta} className="flex gap-2 border-t border-border pt-3">
                  <Input
                    placeholder="Nuevo ID Tag OCPP"
                    value={tarjetaForm.uf_id === String(tarjetasUfOpen?.id) ? tarjetaForm.id_tag_ocpp : ''}
                    onChange={(e) => setTarjetaForm({ ...tarjetaForm, id_tag_ocpp: e.target.value, uf_id: String(tarjetasUfOpen?.id ?? '') })}
                  />
                  <Button type="submit" size="sm">Agregar</Button>
                </form>
              </div>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="instalacion">
          <Card className="mb-4">
            <CardHeader><CardTitle>Nueva instalacion</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={handleCrearInstalacion} className="flex flex-col gap-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="instUf">Unidad funcional - Cochera</Label>
                    <select
                      id="instUf"
                      value={instForm.cochera_id}
                      onChange={(e) => setInstForm({ ...instForm, cochera_id: e.target.value })}
                      className="flex h-10 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <option value="">Sin unidad (material de edificio, ej: medidor general)</option>
                      {unidades.flatMap((u) => (u.cocheras ?? []).map((coch) => {
                        const ocupada = cargadores.some((c) => c.cochera_id === coch.id);
                        return (
                          <option key={coch.id} value={coch.id} disabled={ocupada}>
                            {u.numero_departamento} - Cochera {coch.numero_cochera}{ocupada ? ' (ya tiene wallbox)' : ''}
                          </option>
                        );
                      }))}
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="instNotas">Notas</Label>
                    <Input id="instNotas" value={instForm.notas} onChange={(e) => setInstForm({ ...instForm, notas: e.target.value })} />
                  </div>
                </div>

                <div className="rounded-lg border border-border p-3">
                  <p className="mb-2 text-sm font-medium">Agregar material desde stock</p>
                  <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                    <select
                      value={itemPick.producto_id}
                      onChange={(e) => handlePickProducto(e.target.value)}
                      className="flex h-10 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <option value="">Elegi un producto</option>
                      {productos.map((p) => (
                        <option key={p.id} value={p.id}>{p.marca} {p.modelo} ({Number(p.stock_disponible)} disp.)</option>
                      ))}
                    </select>
                    {itemPick.producto_id && productos.find((p) => String(p.id) === String(itemPick.producto_id))?.serializado ? (
                      <select
                        value={itemPick.stock_item_id}
                        onChange={(e) => setItemPick({ ...itemPick, stock_item_id: e.target.value })}
                        className="flex h-10 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <option value="">Elegi la unidad (serie)</option>
                        {(stockDisponiblePorProducto[itemPick.producto_id] || []).map((s) => (
                          <option key={s.id} value={s.id}>{stockItemLabel(s)}</option>
                        ))}
                      </select>
                    ) : itemPick.producto_id ? (
                      <Input
                        type="number"
                        min="0.01"
                        step="0.01"
                        placeholder="Cantidad"
                        value={itemPick.cantidad}
                        onChange={(e) => setItemPick({ ...itemPick, cantidad: e.target.value })}
                      />
                    ) : <div />}
                    <Button type="button" variant="outline" onClick={handleAgregarAlCarrito} disabled={!itemPick.producto_id}>
                      <Plus className="h-4 w-4" />Agregar
                    </Button>
                  </div>

                  {carrito.length > 0 && (
                    <div className="mt-3 flex flex-col gap-1">
                      {carrito.map((c, i) => (
                        // eslint-disable-next-line react/no-array-index-key
                        <div key={i} className="flex items-center justify-between rounded-md bg-muted px-3 py-1.5 text-sm">
                          <span>{c.nombre}{c.identificador ? ` - ${c.identificador}` : ` x${c.cantidad}`}</span>
                          <button type="button" onClick={() => handleQuitarDelCarrito(i)} className="cursor-pointer text-muted-foreground hover:text-destructive">
                            <XIcon className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <Button type="submit" className="self-start" disabled={carrito.length === 0} loading={savingInstalacion}>Registrar instalacion</Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Instalaciones registradas</CardTitle></CardHeader>
            <CardContent>
              {instalaciones.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin instalaciones registradas todavia.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>UF</TableHead>
                      <TableHead>Instalador</TableHead>
                      <TableHead>Facturada</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {instalaciones.map((inst) => (
                      <TableRow key={inst.id}>
                        <TableCell className="text-xs text-muted-foreground">{inst.fecha}</TableCell>
                        <TableCell>{inst.numero_departamento || inst.numero_cochera || '-'}</TableCell>
                        <TableCell className="text-xs">{inst.instalador_email}</TableCell>
                        <TableCell><Badge variant={inst.facturada ? 'accent' : 'muted'}>{inst.facturada ? 'Si' : 'No'}</Badge></TableCell>
                        <TableCell className="text-right">
                          {!inst.facturada && (
                            <Button size="sm" variant="outline" onClick={() => setFacturarOpen(inst)}>Facturar</Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Dialog open={facturarOpen != null} onOpenChange={(o) => !o && setFacturarOpen(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Facturar instalacion</DialogTitle>
                <DialogDescription>Se factura al periodo {periodoFacturacion || periodoActual} (seleccionalo antes en la solapa Facturacion si necesitas otro mes).</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleFacturarInstalacion} className="flex flex-col gap-3">
                <div>
                  <Label htmlFor="facModo">Modo</Label>
                  <select
                    id="facModo"
                    value={facturarForm.modo}
                    onChange={(e) => setFacturarForm({ ...facturarForm, modo: e.target.value })}
                    className="flex h-10 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="kit">Kit resumido (1 solo cargo)</option>
                    <option value="desglosado">Desglosado (1 cargo por item)</option>
                  </select>
                </div>
                {facturarForm.modo === 'kit' && (
                  <>
                    <div>
                      <Label htmlFor="facDesc">Descripcion del kit</Label>
                      <Input id="facDesc" value={facturarForm.descripcion_kit} onChange={(e) => setFacturarForm({ ...facturarForm, descripcion_kit: e.target.value })} />
                    </div>
                    <div>
                      <Label htmlFor="facMonto">Monto (vacio = suma de costos)</Label>
                      <Input id="facMonto" type="number" step="0.01" min="0" value={facturarForm.monto_kit} onChange={(e) => setFacturarForm({ ...facturarForm, monto_kit: e.target.value })} />
                    </div>
                  </>
                )}
                <Button type="submit" className="mt-2" loading={savingInstalacion}>Generar cargo</Button>
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
                <div>
                  <Label htmlFor="modoFacturacion">Modo de facturacion Bilon</Label>
                  <select
                    id="modoFacturacion"
                    value={paramsForm.modo_facturacion}
                    onChange={(e) => setParamsForm({ ...paramsForm, modo_facturacion: e.target.value })}
                    className="flex h-10 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="administrador">Administrador (1 factura consolidada al edificio)</option>
                    <option value="propietario_directo">Propietario directo (1 factura por UF)</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="tipoCliente">Tipo de cliente</Label>
                  <select
                    id="tipoCliente"
                    value={paramsForm.tipo_cliente}
                    onChange={(e) => setParamsForm({ ...paramsForm, tipo_cliente: e.target.value })}
                    className="flex h-10 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="residencial">Residencial (consorcio)</option>
                    <option value="comercial">Comercial (cochera)</option>
                  </select>
                </div>
                <Button type="submit" className="self-start">
                  <Pencil className="h-4 w-4" />
                  Guardar parametros
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Ex-solapa "Sectores" - ahora vive dentro de Parametros */}
          <Card className="mb-4">
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2"><PlugZap className="h-4 w-4" />Medidor general del edificio</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Mide el consumo total del edificio (fuera de los cargadores EV) para descontarlo del limite general. Aplica a los cargadores sin sector asignado.
                </p>
              </div>
              {consorcio && (
                <div className="flex items-center gap-2">
                  {consorcio.ultima_lectura_en && (
                    <span className="text-xs text-muted-foreground">ultima lectura hace {formatElapsed(consorcio.ultima_lectura_en)}</span>
                  )}
                  <Switch
                    checked={consorcio.usar_medidor_dinamico}
                    onCheckedChange={handleToggleMedidorDinamicoGeneral}
                  />
                </div>
              )}
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {consorcio?.ultima_lectura_en && (
                <p className="text-xs text-muted-foreground">
                  {consorcio.amps_l1 != null && `L1: ${Number(consorcio.amps_l1).toFixed(1)}A `}
                  {consorcio.amps_l2 != null && `L2: ${Number(consorcio.amps_l2).toFixed(1)}A `}
                  {consorcio.amps_l3 != null && `L3: ${Number(consorcio.amps_l3).toFixed(1)}A `}
                  {consorcio.potencia_kw != null && `${Number(consorcio.potencia_kw).toFixed(1)} kW`}
                </p>
              )}
              {!showGeneralModbusForm ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-fit"
                  onClick={() => { openMedidorModbusForm(null); setShowGeneralModbusForm(true); }}
                >
                  {medidorModbusDe(null) ? 'Editar conexion Modbus' : 'Configurar conexion Modbus (RS485->TCP)'}
                </Button>
              ) : (
                <div className="grid grid-cols-2 gap-2 rounded-lg border border-border p-3 sm:grid-cols-3">
                  <div>
                    <Label>Nombre</Label>
                    <Input value={medidorModbusForm.nombre} onChange={(e) => setMedidorModbusForm({ ...medidorModbusForm, nombre: e.target.value })} placeholder="Medidor general" />
                  </div>
                  <div>
                    <Label>Modelo</Label>
                    <Input value={medidorModbusForm.modelo} onChange={(e) => setMedidorModbusForm({ ...medidorModbusForm, modelo: e.target.value })} placeholder="ADW300" />
                  </div>
                  <div>
                    <Label>Host / IP del gateway</Label>
                    <Input value={medidorModbusForm.host} onChange={(e) => setMedidorModbusForm({ ...medidorModbusForm, host: e.target.value })} placeholder="192.168.1.50" />
                  </div>
                  <div>
                    <Label>Puerto</Label>
                    <Input type="number" value={medidorModbusForm.puerto} onChange={(e) => setMedidorModbusForm({ ...medidorModbusForm, puerto: e.target.value })} />
                  </div>
                  <div>
                    <Label>Unit ID (esclavo)</Label>
                    <Input type="number" value={medidorModbusForm.unit_id} onChange={(e) => setMedidorModbusForm({ ...medidorModbusForm, unit_id: e.target.value })} />
                  </div>
                  <div>
                    <Label>Intervalo (seg)</Label>
                    <Input type="number" value={medidorModbusForm.intervalo_seg} onChange={(e) => setMedidorModbusForm({ ...medidorModbusForm, intervalo_seg: e.target.value })} />
                  </div>
                  <div className="col-span-full flex gap-2">
                    <Button size="sm" onClick={async () => { await handleSaveMedidorModbus(null); setShowGeneralModbusForm(false); }}>Guardar</Button>
                    <Button size="sm" variant="outline" onClick={() => setShowGeneralModbusForm(false)}>Cancelar</Button>
                    {medidorModbusDe(null) && (
                      <Button size="sm" variant="destructive" onClick={async () => { await handleDeleteMedidorModbus(medidorModbusDe(null).id); setShowGeneralModbusForm(false); }}>
                        Borrar
                      </Button>
                    )}
                  </div>
                  {medidorModbusDe(null)?.ultimo_error && (
                    <p className="col-span-full text-xs text-destructive">Ultimo error: {medidorModbusDe(null).ultimo_error}</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="mb-4">
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2"><Wallet className="h-4 w-4" />Saldo prepago en tarjetas RFID</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Si esta activado, el residente necesita saldo positivo en su tarjeta para iniciar una carga - se descuenta automaticamente al terminar cada sesion. No afecta la facturacion por expensas existente.
                </p>
              </div>
              {consorcio && (
                <Switch checked={consorcio.usar_saldo_prepago} onCheckedChange={handleToggleSaldoPrepago} />
              )}
            </CardHeader>
          </Card>

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
                            onClick={() => { openMedidorModbusForm(s.id); setMedidorOpen(s); }}
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

                  <div className="border-t border-border pt-3">
                    <p className="mb-2 text-sm font-medium">O, conexion Modbus-TCP directa (gateway RS485-&gt;TCP en este piso)</p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      <div>
                        <Label>Nombre</Label>
                        <Input value={medidorModbusForm.nombre} onChange={(e) => setMedidorModbusForm({ ...medidorModbusForm, nombre: e.target.value })} placeholder={`Medidor ${medidorOpen.nombre}`} />
                      </div>
                      <div>
                        <Label>Modelo</Label>
                        <Input value={medidorModbusForm.modelo} onChange={(e) => setMedidorModbusForm({ ...medidorModbusForm, modelo: e.target.value })} placeholder="ADW300" />
                      </div>
                      <div>
                        <Label>Host / IP del gateway</Label>
                        <Input value={medidorModbusForm.host} onChange={(e) => setMedidorModbusForm({ ...medidorModbusForm, host: e.target.value })} placeholder="192.168.1.51" />
                      </div>
                      <div>
                        <Label>Puerto</Label>
                        <Input type="number" value={medidorModbusForm.puerto} onChange={(e) => setMedidorModbusForm({ ...medidorModbusForm, puerto: e.target.value })} />
                      </div>
                      <div>
                        <Label>Unit ID (esclavo)</Label>
                        <Input type="number" value={medidorModbusForm.unit_id} onChange={(e) => setMedidorModbusForm({ ...medidorModbusForm, unit_id: e.target.value })} />
                      </div>
                      <div>
                        <Label>Intervalo (seg)</Label>
                        <Input type="number" value={medidorModbusForm.intervalo_seg} onChange={(e) => setMedidorModbusForm({ ...medidorModbusForm, intervalo_seg: e.target.value })} />
                      </div>
                      <div className="col-span-full flex gap-2">
                        <Button size="sm" onClick={() => handleSaveMedidorModbus(medidorOpen.id)}>Guardar</Button>
                        {medidorModbusDe(medidorOpen.id) && (
                          <Button size="sm" variant="destructive" onClick={() => handleDeleteMedidorModbus(medidorModbusDe(medidorOpen.id).id)}>
                            Borrar
                          </Button>
                        )}
                      </div>
                      {medidorModbusDe(medidorOpen.id)?.ultimo_error && (
                        <p className="col-span-full text-xs text-destructive">Ultimo error: {medidorModbusDe(medidorOpen.id).ultimo_error}</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="facturacion">
          <Card className="mb-4">
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>Abonos configurados</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Lo que Bilon le factura a este cliente - separado de la electricidad (esa la impute el administrador con el reporte de abajo).
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={openClonarCatalogo}>Clonar desde catalogo</Button>
                <Dialog open={abonoItemOpen} onOpenChange={setAbonoItemOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm"><Plus className="h-4 w-4" />Nuevo abono</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Nuevo abono</DialogTitle></DialogHeader>
                    <form onSubmit={handleCreateAbonoItem} className="flex flex-col gap-3">
                      <div>
                        <Label htmlFor="abNombre">Nombre</Label>
                        <Input id="abNombre" required value={abonoItemForm.nombre} onChange={(e) => setAbonoItemForm({ ...abonoItemForm, nombre: e.target.value })} />
                      </div>
                      <div>
                        <Label htmlFor="abTipo">Tipo</Label>
                        <select
                          id="abTipo"
                          value={abonoItemForm.tipo}
                          onChange={(e) => setAbonoItemForm({ ...abonoItemForm, tipo: e.target.value })}
                          className="flex h-10 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {TIPOS_ABONO_ITEM.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <Label htmlFor="abMonto">Monto</Label>
                        <Input id="abMonto" type="number" step="0.01" min="0" required value={abonoItemForm.monto} onChange={(e) => setAbonoItemForm({ ...abonoItemForm, monto: e.target.value })} />
                      </div>
                      <Button type="submit" className="mt-2" loading={savingFacturacion}>Crear abono</Button>
                    </form>
                  </DialogContent>
                </Dialog>
                <Dialog open={clonarOpen} onOpenChange={setClonarOpen}>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Clonar desde catalogo</DialogTitle>
                      <DialogDescription>Selecciona las plantillas a clonar a este edificio. No borra los abonos ya cargados.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleClonarCatalogo} className="flex flex-col gap-3">
                      {catalogoAbonos.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No hay plantillas activas en el catalogo.</p>
                      ) : (
                        <ul className="flex max-h-[50vh] flex-col gap-1.5 overflow-y-auto">
                          {catalogoAbonos.map((p) => (
                            <li key={p.id}>
                              <label className="flex cursor-pointer items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted">
                                <span className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={catalogoSeleccion.includes(p.id)}
                                    onChange={() => toggleCatalogoSeleccion(p.id)}
                                    className="h-4 w-4"
                                  />
                                  {p.nombre}
                                  <span className="text-xs text-muted-foreground">({TIPOS_ABONO_ITEM.find((t) => t.value === p.tipo)?.label ?? p.tipo})</span>
                                </span>
                                <span className="tabular-nums text-xs text-muted-foreground">${Number(p.monto_sugerido).toFixed(2)}</span>
                              </label>
                            </li>
                          ))}
                        </ul>
                      )}
                      <Button type="submit" className="mt-2" disabled={catalogoSeleccion.length === 0}>
                        Clonar {catalogoSeleccion.length > 0 ? `(${catalogoSeleccion.length})` : ''}
                      </Button>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {abonoItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay abonos configurados. Cloná del catálogo o creá uno nuevo.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {abonoItems.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.nombre}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{TIPOS_ABONO_ITEM.find((t) => t.value === item.tipo)?.label ?? item.tipo}</TableCell>
                        <TableCell className="tabular-nums text-right">${Number(item.monto).toFixed(2)}</TableCell>
                        <TableCell>
                          <button onClick={() => handleToggleAbonoItem(item)} className="cursor-pointer">
                            <Badge variant={item.activo ? 'accent' : 'muted'}>{item.activo ? 'Activo' : 'Inactivo'}</Badge>
                          </button>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="destructive" aria-label={`Borrar abono ${item.nombre}`} onClick={() => handleDeleteAbonoItem(item.id)}><Trash2 className="h-4 w-4" /></Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card className="mb-4">
            <CardHeader className="flex-row items-center justify-between gap-3">
              <CardTitle>Calendario de facturacion</CardTitle>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => setFacturaYear(facturaYear - 1)}>{'<'}</Button>
                <span className="w-12 text-center text-sm font-semibold tabular-nums">{facturaYear}</span>
                <Button size="sm" variant="ghost" onClick={() => setFacturaYear(facturaYear + 1)}>{'>'}</Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                {MESES.map((nombreMes, idx) => {
                  const periodo = `${facturaYear}-${String(idx + 1).padStart(2, '0')}`;
                  const facturado = periodosFacturados.has(periodo);
                  const seleccionado = periodoFacturacion === periodo;
                  return (
                    <button
                      key={periodo}
                      type="button"
                      onClick={() => setPeriodoFacturacion(seleccionado ? '' : periodo)}
                      className={cn(
                        'flex flex-col items-center gap-1 rounded-lg border p-3 text-sm font-medium transition-colors cursor-pointer',
                        facturado ? 'border-accent/40 bg-accent/10 text-accent hover:bg-accent/20' : 'border-amber-500/40 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20',
                        seleccionado && 'ring-2 ring-primary ring-offset-1',
                      )}
                    >
                      {nombreMes}
                      <span className="text-xs font-normal">{facturado ? 'Facturado' : 'Pendiente'}</span>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {!periodoFacturacion ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                Selecciona un mes del calendario para ver sus cargos, facturas y reporte de electricidad.
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="mb-4 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5">
                <p className="text-sm font-semibold text-primary">Mostrando: {formatPeriodoLargo(periodoFacturacion)}</p>
              </div>

              <Card className="mb-4">
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
              <CardTitle>Cargos puntuales - {formatPeriodoLargo(periodoFacturacion)}</CardTitle>
              <Dialog open={cargoOpen} onOpenChange={setCargoOpen}>
                <DialogTrigger asChild>
                  <Button size="sm"><Plus className="h-4 w-4" />Nuevo cargo</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Nuevo cargo puntual</DialogTitle>
                    <DialogDescription>Visita tecnica, reparacion, etc. Sin UF = va al administrador.</DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleCreateCargo} className="flex flex-col gap-3">
                    <div>
                      <Label htmlFor="cgUf">Unidad funcional (opcional)</Label>
                      <select
                        id="cgUf"
                        value={cargoForm.uf_id}
                        onChange={(e) => setCargoForm({ ...cargoForm, uf_id: e.target.value })}
                        className="flex h-10 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <option value="">Sin UF (va al administrador)</option>
                        {unidades.map((u) => (
                          <option key={u.id} value={u.id}>{u.numero_departamento || u.numero_cochera}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="cgDesc">Descripcion</Label>
                      <Input id="cgDesc" required value={cargoForm.descripcion} onChange={(e) => setCargoForm({ ...cargoForm, descripcion: e.target.value })} placeholder="Ej: Reparacion wallbox UF 4B" />
                    </div>
                    <div>
                      <Label htmlFor="cgMonto">Monto</Label>
                      <Input id="cgMonto" type="number" step="0.01" min="0" required value={cargoForm.monto} onChange={(e) => setCargoForm({ ...cargoForm, monto: e.target.value })} />
                    </div>
                    <Button type="submit" className="mt-2" loading={savingFacturacion}>Crear cargo</Button>
                  </form>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {cargosPuntuales.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin cargos puntuales este periodo.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Descripcion</TableHead>
                      <TableHead>UF</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cargosPuntuales.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell>{c.descripcion}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{c.numero_departamento || c.numero_cochera || 'Administrador'}</TableCell>
                        <TableCell className="tabular-nums text-right">${Number(c.monto).toFixed(2)}</TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="destructive" aria-label={`Borrar cargo ${c.descripcion}`} onClick={() => handleDeleteCargo(c.id)}><Trash2 className="h-4 w-4" /></Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card className="mb-4">
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
              <CardTitle>Facturas Bilon - {formatPeriodoLargo(periodoFacturacion)}</CardTitle>
              <Button size="sm" onClick={handleGenerarFacturas} loading={savingFacturacion}>Generar/actualizar facturas</Button>
            </CardHeader>
            <CardContent>
              {facturas.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin facturas generadas para este periodo todavia.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Destinatario</TableHead>
                      <TableHead>Detalle</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {facturas.map((f) => (
                      <TableRow key={f.id}>
                        <TableCell>{f.uf_id ? (f.numero_departamento || f.numero_cochera) : 'Administrador'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {f.detalle.map((d) => `${d.concepto}: $${Number(d.monto).toFixed(2)}`).join(' + ')}
                        </TableCell>
                        <TableCell className="tabular-nums text-right">${Number(f.monto_total).toFixed(2)}</TableCell>
                        <TableCell>
                          <Badge variant={f.estado === 'pagada' ? 'accent' : f.estado === 'anulada' ? 'destructive' : 'muted'}>{f.estado}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {f.estado === 'pendiente' && (
                            <div className="flex justify-end gap-1">
                              <Button size="sm" variant="outline" aria-label="Editar factura" onClick={() => openEditFactura(f)}><Pencil className="h-4 w-4" /></Button>
                              <Button size="sm" variant="outline" onClick={() => handleMarcarFactura(f.id, 'pagada')}>Marcar pagada</Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Dialog open={editFactura != null} onOpenChange={(o) => !o && setEditFactura(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  Editar factura - {editFactura?.uf_id ? (editFactura.numero_departamento || editFactura.numero_cochera) : 'Administrador'}
                </DialogTitle>
                <DialogDescription>Solo se puede editar mientras la factura esta pendiente.</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleUpdateFacturaDetalle} className="flex flex-col gap-3">
                {editFacturaDetalle.map((d, idx) => (
                  <div key={idx} className="flex items-end gap-2">
                    <div className="flex-1">
                      {idx === 0 && <Label>Concepto</Label>}
                      <Input
                        value={d.concepto}
                        onChange={(e) => setEditFacturaDetalle((prev) => prev.map((it, i) => (i === idx ? { ...it, concepto: e.target.value } : it)))}
                      />
                    </div>
                    <div className="w-28">
                      {idx === 0 && <Label>Monto</Label>}
                      <Input
                        type="number"
                        step="0.01"
                        value={d.monto}
                        onChange={(e) => setEditFacturaDetalle((prev) => prev.map((it, i) => (i === idx ? { ...it, monto: e.target.value } : it)))}
                      />
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      aria-label="Quitar item"
                      onClick={() => setEditFacturaDetalle((prev) => prev.filter((_, i) => i !== idx))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="self-start"
                  onClick={() => setEditFacturaDetalle((prev) => [...prev, { concepto: '', monto: '' }])}
                >
                  <Plus className="h-4 w-4" />Agregar item
                </Button>
                <p className="text-right text-sm text-muted-foreground">
                  Total: ${editFacturaDetalle.reduce((sum, d) => sum + (Number(d.monto) || 0), 0).toFixed(2)}
                </p>
                <Button type="submit" className="mt-2" loading={savingFacturacion}>Guardar cambios</Button>
              </form>
            </DialogContent>
          </Dialog>

          <Card>
            <CardHeader>
              <CardTitle>Reporte de electricidad - {formatPeriodoLargo(periodoFacturacion)}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Para que el administrador impute el consumo en sus propias expensas. Bilon no factura esto.
              </p>
            </CardHeader>
            <CardContent>
              {reporteElectrico.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin sesiones de carga cerradas este periodo.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>UF</TableHead>
                      <TableHead className="text-right">kWh</TableHead>
                      <TableHead className="text-right">Monto sugerido</TableHead>
                      <TableHead className="text-right">Sesiones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reporteElectrico.map((r) => (
                      <TableRow key={r.uf_id}>
                        <TableCell>{r.numero_departamento || r.numero_cochera}</TableCell>
                        <TableCell className="tabular-nums text-right">{Number(r.kwh_totales).toFixed(2)}</TableCell>
                        <TableCell className="tabular-nums text-right">${Number(r.monto_sugerido).toFixed(2)}</TableCell>
                        <TableCell className="tabular-nums text-right">{r.sesiones}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="tiempo-real">
          <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Activity className="h-4 w-4" />
            Actualiza cada 5 segundos - ultimos 30 minutos
          </div>

          {live.medidor_general?.ultima_lectura && (
            <Card className="mb-4 min-w-0">
              <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2"><PlugZap className="h-4 w-4" />Medidor general del edificio</CardTitle>
                <span className="tabular-nums text-xs text-muted-foreground">
                  {[
                    live.medidor_general.ultima_lectura.amps_l1 != null && `L1: ${Number(live.medidor_general.ultima_lectura.amps_l1).toFixed(1)}A`,
                    live.medidor_general.ultima_lectura.amps_l2 != null && `L2: ${Number(live.medidor_general.ultima_lectura.amps_l2).toFixed(1)}A`,
                    live.medidor_general.ultima_lectura.amps_l3 != null && `L3: ${Number(live.medidor_general.ultima_lectura.amps_l3).toFixed(1)}A`,
                    live.medidor_general.ultima_lectura.potencia_kw != null && `${Number(live.medidor_general.ultima_lectura.potencia_kw).toFixed(1)} kW`,
                  ].filter(Boolean).join(' - ')}
                </span>
              </CardHeader>
              <CardContent>
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={live.medidor_general.readings.map((r) => ({
                        hora: new Date(r.timestamp).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                        kW: r.potencia_kw != null ? Number(r.potencia_kw) : null,
                      }))}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e4e7eb" vertical={false} />
                      <XAxis dataKey="hora" tick={{ fontSize: 11 }} stroke="#64748b" />
                      <YAxis tick={{ fontSize: 11 }} stroke="#64748b" />
                      <Tooltip formatter={(value) => [`${value} kW`, 'Potencia']} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Line type="monotone" dataKey="kW" name="Potencia (kW)" stroke="#2563eb" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {live.cargadores.filter((c) => c.readings.length > 0).length === 0 ? (
            <Card>
              <CardContent className="p-5 text-sm text-muted-foreground">
                Ningun cargador tiene lecturas recientes. Los graficos aparecen cuando hay una sesion de carga activa.
              </CardContent>
            </Card>
          ) : (
            <div className="grid min-w-0 gap-4 lg:grid-cols-2">
              {live.cargadores.filter((c) => c.readings.length > 0).map((c) => {
                const chartData = c.readings.map((r) => ({
                  hora: new Date(r.timestamp).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                  kWh: Number(r.kwh_acumulado),
                }));
                const last = c.readings[c.readings.length - 1];
                return (
                  <Card key={c.ocpp_id} className="min-w-0">
                    <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
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
    </AdminLayout>
  );
}
