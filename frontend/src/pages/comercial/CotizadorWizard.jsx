import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, Plus, Trash2, Zap, ChevronDown, ChevronRight, Printer, Calculator, Send, ListChecks, Mail, Sparkles,
} from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import AdminLayout from '@/components/AdminLayout';
import {
  Card, CardHeader, CardTitle, CardContent, Button, Input, Label, Badge,
  Tabs, TabsList, TabsTrigger, TabsContent,
} from '@/components/ui';
import { SUPERADMIN_NAV } from '../superadmin/navConfig';

const SELECT_CLASS = 'flex h-10 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

const CATEGORIAS_BOM = [
  'Infraestructura eléctrica', 'Tableros y protecciones', 'Cableado y canalizaciones',
  'Red Ethernet', 'Comunicaciones', 'Medición', 'Ingeniería', 'Mano de obra',
  'Puesta en marcha', 'Wallboxes iniciales',
];

const WALLBOX_MODELOS = [
  { modelo: 'BILON 7.4kW Monofasico', potencia_kw: 7.4, tipo: 'mono' },
  { modelo: 'BILON 11kW Trifasico', potencia_kw: 11, tipo: 'tri' },
  { modelo: 'BILON 22kW Trifasico', potencia_kw: 22, tipo: 'tri' },
];

function uid() { return crypto.randomUUID(); }

function pisoVacio(orden) {
  return { id: uid(), nombre: `Piso ${orden}`, orden, troncales: [] };
}

function troncalVacio(nombre) {
  return {
    id: uid(),
    nombre,
    cocheras: [],
    distancia_tablero_a_inicio_m: '',
    longitud_troncal_m: '',
    longitud_ramal_promedio_m: '',
    potencia_nominal_wallbox_kw: 7.4,
    tipo_alimentacion: 'mono',
    factor_simultaneidad: 0.3,
    metodo_instalacion: 'C',
    temperatura_ambiente_c: 30,
    material_conductor: 'cobre',
    agrupamiento_circuitos: 1,
    calculo: null,
  };
}

function money(n, moneda) {
  const v = Number(n) || 0;
  return `${moneda === 'USD' ? 'US$' : '$'} ${v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Mismo dimensionado de switch que backend/src/routes/comercial.js
// (bom/generar) - solo para preview en vivo, el calculo real que define el
// presupuesto ocurre en el servidor.
const PUERTOS_SWITCH_DISPONIBLES = [8, 16, 24, 48];
function puertosNecesariosCliente(cantCocheras) {
  const necesarios = (Number(cantCocheras) || 0) + 1;
  return PUERTOS_SWITCH_DISPONIBLES.find((p) => p >= necesarios) ?? PUERTOS_SWITCH_DISPONIBLES[PUERTOS_SWITCH_DISPONIBLES.length - 1];
}

export default function CotizadorWizard() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [cot, setCot] = useState(null);
  const [edificio, setEdificio] = useState(null);
  const [pisos, setPisos] = useState([]);
  const [infra, setInfra] = useState({});
  const [wallboxes, setWallboxes] = useState([]);
  const [bom, setBom] = useState([]);
  const [margenPct, setMargenPct] = useState('');
  const [ivaPct, setIvaPct] = useState('21');
  const [catalogo, setCatalogo] = useState([]);
  const [expandido, setExpandido] = useState({});
  const [saving, setSaving] = useState(false);
  const [recalculando, setRecalculando] = useState(false);
  const [generandoBom, setGenerandoBom] = useState(false);
  const [enviandoMail, setEnviandoMail] = useState(false);
  const [buscandoIA, setBuscandoIA] = useState(() => new Set());
  const [tab, setTab] = useState('edificio');
  const [wbForm, setWbForm] = useState({ cochera: null, modeloIdx: 0, longitud_cable_m: '' });

  async function load() {
    const { data } = await api.get(`/comercial/cotizaciones/${id}`);
    setCot(data);
    setEdificio(data.edificio || {});
    setPisos(data.pisos?.length ? data.pisos : []);
    setInfra(data.infraestructura || {});
    setWallboxes(data.wallboxes || []);
    setBom(data.bom || []);
    setMargenPct(data.margen_pct ?? '');
    setIvaPct(data.iva_pct ?? '21');
    const { data: catalogoData } = await api.get('/comercial/catalogo-items');
    setCatalogo(catalogoData);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const totales = useMemo(() => {
    const troncalesFlat = pisos.flatMap((p) => p.troncales || []);
    const cocherasPreparadas = troncalesFlat.reduce((acc, t) => acc + (t.cocheras?.length || 0), 0);
    return {
      cocherasTotal: Number(edificio?.cantidad_cocheras_total) || 0,
      cocherasPreparadas,
      wallboxesIniciales: wallboxes.length,
      pisos: pisos.length,
      troncales: troncalesFlat.length,
      puntosEthernet: cocherasPreparadas,
      // Switches/medidor/gateway/router ya no se tildan a mano - se calculan
      // solos por troncal al generar el presupuesto (ver bom/generar). Este
      // total es solo un preview: 1 switch por troncal (dimensionado a sus
      // cocheras) + 1 medidor + 1 gateway (mismo kit) + 1 router fijos.
      switches: troncalesFlat.length,
      medidores: 1,
      gateways: 1,
      routers: 1,
    };
  }, [edificio, pisos, wallboxes]);

  const cocherasValidas = totales.cocherasTotal === 0 || totales.cocherasPreparadas === totales.cocherasTotal;
  const todasLasCocheras = useMemo(() => pisos.flatMap((p) => (p.troncales || []).flatMap(
    (t) => (t.cocheras || []).map((c) => ({ ...c, piso_id: p.id, troncal_id: t.id, pisoNombre: p.nombre, troncalNombre: t.nombre })),
  )), [pisos]);
  const cocherasConWallbox = new Set(wallboxes.map((w) => w.cochera_id));
  const cocherasDisponibles = todasLasCocheras.filter((c) => !cocherasConWallbox.has(c.id));

  async function guardar(patch, mensaje) {
    setSaving(true);
    try {
      const body = {
        edificio, pisos, infraestructura: infra, wallboxes, bom,
        margen_pct: margenPct === '' ? null : Number(margenPct),
        iva_pct: ivaPct === '' ? null : Number(ivaPct),
        ...patch,
      };
      const { data } = await api.put(`/comercial/cotizaciones/${id}`, body);
      // PUT devuelve la fila sin el join a comercial_contactos (a diferencia
      // de GET) - se mezcla sobre el estado previo para no perder
      // nombre/apellido/disclaimer_predimensionado que ya estaban cargados.
      setCot((prev) => ({ ...prev, ...data }));
      if (mensaje) toast.success(mensaje);
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  }

  async function handleRecalcular() {
    setRecalculando(true);
    try {
      await guardar({}, null);
      const { data } = await api.post(`/comercial/cotizaciones/${id}/recalcular`);
      setPisos(data.pisos);
      setCot((prev) => ({ ...prev, ...data }));
      toast.success('Ingenieria recalculada.');
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo recalcular.');
    } finally {
      setRecalculando(false);
    }
  }

  async function handleGenerarBom() {
    setGenerandoBom(true);
    try {
      await guardar({}, null);
      const { data } = await api.post(`/comercial/cotizaciones/${id}/bom/generar`);
      setBom(data.bom);
      setCot((prev) => ({ ...prev, ...data }));
      toast.success('Presupuesto generado a partir de la configuracion.');
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo generar el presupuesto.');
    } finally {
      setGenerandoBom(false);
    }
  }

  async function handleAgregarWallbox(e) {
    e.preventDefault();
    if (!wbForm.cochera) return;
    const modeloSel = WALLBOX_MODELOS[wbForm.modeloIdx];
    try {
      const { data } = await api.post(`/comercial/cotizaciones/${id}/wallboxes`, {
        cochera_id: wbForm.cochera.id,
        piso_id: wbForm.cochera.piso_id,
        troncal_id: wbForm.cochera.troncal_id,
        modelo: modeloSel.modelo,
        potencia_kw: modeloSel.potencia_kw,
        longitud_cable_m: wbForm.longitud_cable_m === '' ? null : Number(wbForm.longitud_cable_m),
      });
      setWallboxes(data.wallboxes);
      setWbForm({ cochera: null, modeloIdx: 0, longitud_cable_m: '' });
      toast.success('Wallbox agregado.');
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo agregar el wallbox.');
    }
  }

  async function handleEliminarWallbox(wallboxId) {
    // eslint-disable-next-line no-alert
    if (!window.confirm('Quitar este wallbox de la cotizacion?')) return;
    try {
      const { data } = await api.delete(`/comercial/cotizaciones/${id}/wallboxes/${wallboxId}`);
      setWallboxes(data.wallboxes);
    } catch {
      toast.error('No se pudo quitar el wallbox.');
    }
  }

  function toggleExpandido(key) {
    setExpandido((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function updatePiso(pisoId, patch) {
    setPisos((prev) => prev.map((p) => (p.id === pisoId ? { ...p, ...patch } : p)));
  }
  function agregarPiso() {
    setPisos((prev) => [...prev, pisoVacio(prev.length + 1)]);
  }
  function eliminarPiso(pisoId) {
    setPisos((prev) => prev.filter((p) => p.id !== pisoId));
  }

  function updateTroncal(pisoId, troncalId, patch) {
    setPisos((prev) => prev.map((p) => (p.id !== pisoId ? p : {
      ...p,
      troncales: p.troncales.map((t) => (t.id === troncalId ? { ...t, ...patch } : t)),
    })));
  }
  function agregarTroncal(pisoId) {
    setPisos((prev) => prev.map((p) => (p.id !== pisoId ? p : {
      ...p,
      troncales: [...p.troncales, troncalVacio(`Troncal ${p.troncales.length + 1}`)],
    })));
  }
  function eliminarTroncal(pisoId, troncalId) {
    setPisos((prev) => prev.map((p) => (p.id !== pisoId ? p : {
      ...p,
      troncales: p.troncales.filter((t) => t.id !== troncalId),
    })));
  }

  function generarCocheras(pisoId, troncalId, cantidad) {
    const yaNumeradas = todasLasCocheras.length;
    const nuevas = Array.from({ length: cantidad }, (_, i) => ({
      id: uid(), numero: yaNumeradas + i + 1, wallbox_inicial: false, distancia_individual_m: null,
    }));
    updateTroncal(pisoId, troncalId, { cocheras: nuevas });
  }
  function eliminarCochera(pisoId, troncalId, cocheraId) {
    setPisos((prev) => prev.map((p) => (p.id !== pisoId ? p : {
      ...p,
      troncales: p.troncales.map((t) => (t.id !== troncalId ? t : { ...t, cocheras: t.cocheras.filter((c) => c.id !== cocheraId) })),
    })));
  }

  // -------- BOM: edicion de lineas --------
  function updateLineaBom(idx, patch) {
    setBom((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }
  function elegirCatalogoItem(idx, catalogoItemId) {
    const item = catalogo.find((c) => String(c.id) === String(catalogoItemId));
    if (!item) return;
    updateLineaBom(idx, {
      catalogo_item_id: item.id, precio_unitario: Number(item.precio_unitario), costo: item.costo ?? null,
      pendiente_precio: false, estimado: !!item.estimado,
    });
  }
  const bomConTotales = useMemo(() => bom.map((l) => ({
    ...l, subtotal: (Number(l.cantidad) || 0) * (Number(l.precio_unitario) || 0),
  })), [bom]);
  const subtotalPorCategoria = useMemo(() => {
    const acc = {};
    for (const l of bomConTotales) acc[l.categoria] = (acc[l.categoria] || 0) + l.subtotal;
    return acc;
  }, [bomConTotales]);
  const itemsPendientes = useMemo(() => bomConTotales.filter((l) => l.pendiente_precio).length, [bomConTotales]);
  const subtotalGeneral = Object.values(subtotalPorCategoria).reduce((a, b) => a + b, 0);
  const margenMonto = subtotalGeneral * ((Number(margenPct) || 0) / 100);
  const ivaMonto = (subtotalGeneral + margenMonto) * ((Number(ivaPct) || 0) / 100);
  const totalGeneral = subtotalGeneral + margenMonto + ivaMonto;

  async function handleGuardarPresupuesto() {
    await guardar({ bom: bomConTotales }, 'Presupuesto guardado.');
  }

  async function handleMarcarEnviado() {
    await guardar({ bom: bomConTotales, estado: 'enviado' }, 'Cotizacion marcada como enviada.');
  }

  async function handleBuscarIA(idx) {
    setBuscandoIA((prev) => new Set(prev).add(idx));
    try {
      const { data } = await api.post(`/comercial/cotizaciones/${id}/bom/${idx}/buscar-ia`);
      if (data.encontrado) {
        setBom(data.cotizacion.bom);
        toast.success(`Precio encontrado por IA: ${data.nota || ''}`);
      } else {
        toast.error(data.nota || 'La IA no encontro un precio de referencia para este item.');
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo buscar el precio con IA.');
    } finally {
      setBuscandoIA((prev) => { const next = new Set(prev); next.delete(idx); return next; });
    }
  }

  async function handleEnviarMail() {
    setEnviandoMail(true);
    try {
      const { data } = await api.post(`/comercial/cotizaciones/${id}/enviar-mail`);
      toast.success(`Cotizacion enviada por mail a ${data.to}.`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo enviar el mail.');
    } finally {
      setEnviandoMail(false);
    }
  }

  if (!cot || !edificio) {
    return (
      <AdminLayout title="Cotizador" navItems={SUPERADMIN_NAV}>
        <p className="text-sm text-muted-foreground">Cargando...</p>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title={`Cotizacion ${cot.codigo || ''} - ${cot.apellido}, ${cot.nombre}`} navItems={SUPERADMIN_NAV}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Button size="sm" variant="outline" onClick={() => navigate(`/comercial/contactos/${cot.contacto_id}`)}>
          <ArrowLeft className="h-4 w-4" />Volver al contacto
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={cot.estado === 'borrador' ? 'muted' : 'accent'}>{cot.estado}</Badge>
          <Link to={`/comercial/cotizaciones/${id}/bom`} target="_blank">
            <Button size="sm" variant="outline"><ListChecks className="h-4 w-4" />Detalle interno</Button>
          </Link>
          {itemsPendientes > 0 ? (
            <Button size="sm" variant="outline" disabled title={`${itemsPendientes} item(s) sin precio - completalos en Presupuesto`}>
              <Printer className="h-4 w-4" />Vista de impresion
            </Button>
          ) : (
            <Link to={`/comercial/cotizaciones/${id}/imprimir`} target="_blank">
              <Button size="sm" variant="outline"><Printer className="h-4 w-4" />Vista de impresion</Button>
            </Link>
          )}
          {(itemsPendientes > 0 || !cot.email) ? (
            <Button size="sm" variant="outline" disabled title={itemsPendientes > 0 ? `${itemsPendientes} item(s) sin precio - completalos en Presupuesto` : 'El contacto no tiene email cargado'}>
              <Mail className="h-4 w-4" />Enviar por mail
            </Button>
          ) : (
            <Button size="sm" variant="outline" loading={enviandoMail} onClick={handleEnviarMail}>
              <Mail className="h-4 w-4" />Enviar por mail
            </Button>
          )}
          <Button size="sm" variant="outline" loading={saving} onClick={() => guardar({}, 'Guardado.')}>Guardar</Button>
          {cot.estado === 'borrador' && (
            <Button
              size="sm"
              loading={saving}
              disabled={itemsPendientes > 0}
              title={itemsPendientes > 0 ? `${itemsPendientes} item(s) sin precio - completalos en Presupuesto` : undefined}
              onClick={handleMarcarEnviado}
            >
              <Send className="h-4 w-4" />Marcar enviada
            </Button>
          )}
        </div>
      </div>

      <Card className="mb-4 overflow-hidden">
        <div className="flex flex-wrap">
          {[
            { label: 'Cocheras totales', value: totales.cocherasTotal, bar: 'bg-primary' },
            { label: 'Cocheras preparadas', value: totales.cocherasPreparadas, bar: cocherasValidas ? 'bg-accent' : 'bg-rose-500' },
            { label: 'Wallboxes iniciales', value: totales.wallboxesIniciales, bar: 'bg-amber-500' },
            { label: 'Pisos', value: totales.pisos, bar: 'bg-violet-500' },
            { label: 'Troncales', value: totales.troncales, bar: 'bg-violet-500' },
            { label: 'Puntos Ethernet', value: totales.puntosEthernet, bar: 'bg-blue-500' },
            { label: 'Switches', value: totales.switches, bar: 'bg-blue-500' },
            { label: 'Medidores / Gateways / Routers', value: `${totales.medidores} / ${totales.gateways} / ${totales.routers}`, bar: 'bg-primary' },
          ].map((s) => (
            <div key={s.label} className="flex min-w-[9.5rem] flex-1 items-center gap-2.5 border-b border-r border-border px-3.5 py-2.5 last:border-r-0 sm:min-w-[11rem]">
              <span className={`h-7 w-1 shrink-0 rounded-full ${s.bar}`} />
              <div className="min-w-0">
                <p className="text-xs leading-tight text-muted-foreground">{s.label}</p>
                <p className="tabular-nums text-lg font-semibold leading-tight">{s.value}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>
      {!cocherasValidas && (
        <p className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Las cocheras asignadas a las troncales no coinciden con la cantidad total de cocheras del proyecto.
        </p>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="edificio">Edificio</TabsTrigger>
          <TabsTrigger value="estructura">Pisos y troncales</TabsTrigger>
          <TabsTrigger value="electrico">Calculo electrico</TabsTrigger>
          <TabsTrigger value="red">Infraestructura y red</TabsTrigger>
          <TabsTrigger value="wallboxes">Wallboxes iniciales</TabsTrigger>
          <TabsTrigger value="presupuesto">Presupuesto</TabsTrigger>
        </TabsList>

        <TabsContent value="edificio">
          <Card>
            <CardHeader><CardTitle>Datos del edificio</CardTitle></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="edNombre">Nombre del edificio</Label>
                <Input id="edNombre" value={edificio.nombre || ''} onChange={(e) => setEdificio({ ...edificio, nombre: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="edDireccion">Direccion</Label>
                <Input id="edDireccion" value={edificio.direccion || ''} onChange={(e) => setEdificio({ ...edificio, direccion: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="edUfs">Cantidad de unidades funcionales</Label>
                <Input id="edUfs" type="number" value={edificio.cantidad_ufs ?? ''} onChange={(e) => setEdificio({ ...edificio, cantidad_ufs: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="edCocheras">Cantidad total de cocheras a preparar</Label>
                <Input id="edCocheras" type="number" value={edificio.cantidad_cocheras_total ?? ''} onChange={(e) => setEdificio({ ...edificio, cantidad_cocheras_total: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="edTipoUso">Tipo de uso</Label>
                <Input id="edTipoUso" placeholder="Residencial, mixto, comercial..." value={edificio.tipo_uso || ''} onChange={(e) => setEdificio({ ...edificio, tipo_uso: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="edObs">Observaciones</Label>
                <textarea
                  id="edObs"
                  rows={3}
                  className="flex w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={edificio.observaciones || ''}
                  onChange={(e) => setEdificio({ ...edificio, observaciones: e.target.value })}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="estructura">
          <div className="flex flex-col gap-3">
            {pisos.map((piso) => (
              <Card key={piso.id}>
                <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
                  <button type="button" onClick={() => toggleExpandido(piso.id)} className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left">
                    {expandido[piso.id] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    <Input
                      value={piso.nombre}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => updatePiso(piso.id, { nombre: e.target.value })}
                      className="h-8 max-w-xs"
                    />
                    <span className="text-xs text-muted-foreground">
                      {piso.troncales.length} troncal(es), {piso.troncales.reduce((a, t) => a + t.cocheras.length, 0)} cocheras
                    </span>
                  </button>
                  <Button size="sm" variant="ghost" onClick={() => eliminarPiso(piso.id)}><Trash2 className="h-4 w-4" /></Button>
                </CardHeader>
                {expandido[piso.id] && (
                  <CardContent className="flex flex-col gap-3">
                    {piso.troncales.map((troncal) => (
                      <div key={troncal.id} className="rounded-lg border border-border p-3">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <button type="button" onClick={() => toggleExpandido(troncal.id)} className="flex flex-1 cursor-pointer items-center gap-2 text-left">
                            {expandido[troncal.id] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            <Input
                              value={troncal.nombre}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => updateTroncal(piso.id, troncal.id, { nombre: e.target.value })}
                              className="h-8 max-w-xs"
                            />
                            <span className="text-xs text-muted-foreground">{troncal.cocheras.length} cocheras</span>
                            {troncal.calculo && (
                              <Badge variant="accent">
                                {troncal.calculo.seccion_mm2}mm2 / {troncal.calculo.calibre_termica_a != null ? `${troncal.calculo.calibre_termica_a}A` : 'termica a definir'}
                              </Badge>
                            )}
                          </button>
                          <Button size="sm" variant="ghost" onClick={() => eliminarTroncal(piso.id, troncal.id)}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                        {expandido[troncal.id] && (
                          <div className="flex flex-col gap-3">
                            <div className="grid gap-2 sm:grid-cols-3">
                              <div>
                                <Label>Distancia tablero a inicio (m)</Label>
                                <Input type="number" value={troncal.distancia_tablero_a_inicio_m} onChange={(e) => updateTroncal(piso.id, troncal.id, { distancia_tablero_a_inicio_m: e.target.value })} />
                              </div>
                              <div>
                                <Label>Longitud del troncal (m)</Label>
                                <Input type="number" value={troncal.longitud_troncal_m} onChange={(e) => updateTroncal(piso.id, troncal.id, { longitud_troncal_m: e.target.value })} />
                              </div>
                              <div>
                                <Label>Longitud ramal promedio (m)</Label>
                                <Input type="number" value={troncal.longitud_ramal_promedio_m} onChange={(e) => updateTroncal(piso.id, troncal.id, { longitud_ramal_promedio_m: e.target.value })} />
                              </div>
                              <div>
                                <Label>Potencia nominal wallbox (kW)</Label>
                                <Input type="number" value={troncal.potencia_nominal_wallbox_kw} onChange={(e) => updateTroncal(piso.id, troncal.id, { potencia_nominal_wallbox_kw: e.target.value })} />
                              </div>
                              <div>
                                <Label>Alimentacion</Label>
                                <select className={SELECT_CLASS} value={troncal.tipo_alimentacion} onChange={(e) => updateTroncal(piso.id, troncal.id, { tipo_alimentacion: e.target.value })}>
                                  <option value="mono">Monofasica</option>
                                  <option value="tri">Trifasica</option>
                                </select>
                              </div>
                              <div>
                                <Label>Factor de simultaneidad (0-1)</Label>
                                <Input type="number" step="0.05" min="0" max="1" value={troncal.factor_simultaneidad} onChange={(e) => updateTroncal(piso.id, troncal.id, { factor_simultaneidad: e.target.value })} />
                                <p className="mt-1 text-xs text-muted-foreground">% de wallboxes cargando al mismo tiempo. 0.3 = 30%, uso residencial tipico. Mas bajo = cable mas barato.</p>
                              </div>
                              <div>
                                <Label>Circuitos agrupados</Label>
                                <Input type="number" min="1" value={troncal.agrupamiento_circuitos} onChange={(e) => updateTroncal(piso.id, troncal.id, { agrupamiento_circuitos: e.target.value })} />
                                <p className="mt-1 text-xs text-muted-foreground">Cuantos cables van juntos en la misma bandeja/cano en este tramo. Si no sabes, dejalo en 1.</p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 rounded-lg bg-muted/40 p-2">
                              <Label className="mb-0">Cantidad de cocheras en este troncal</Label>
                              <Input
                                type="number"
                                min="0"
                                className="h-8 w-24"
                                defaultValue={troncal.cocheras.length}
                                onBlur={(e) => {
                                  const n = Math.max(0, Number(e.target.value) || 0);
                                  if (n !== troncal.cocheras.length) generarCocheras(piso.id, troncal.id, n);
                                }}
                              />
                              <span className="text-xs text-muted-foreground">Genera/renumera las filas de cocheras de este troncal.</span>
                            </div>

                            {troncal.cocheras.length > 0 && (
                              <div className="max-h-48 overflow-x-auto overflow-y-auto rounded-lg border border-border">
                                <table className="w-full min-w-[320px] text-xs">
                                  <thead className="bg-muted/50">
                                    <tr><th className="p-1.5 text-left">Cochera N°</th><th className="p-1.5 text-left">Wallbox inicial</th><th className="p-1.5 text-left">Distancia individual (m)</th><th /></tr>
                                  </thead>
                                  <tbody>
                                    {troncal.cocheras.map((c) => (
                                      <tr key={c.id} className="border-t border-border">
                                        <td className="p-1.5">{c.numero}</td>
                                        <td className="p-1.5">
                                          <input
                                            type="checkbox"
                                            checked={c.wallbox_inicial}
                                            onChange={(e) => updateTroncal(piso.id, troncal.id, {
                                              cocheras: troncal.cocheras.map((x) => (x.id === c.id ? { ...x, wallbox_inicial: e.target.checked } : x)),
                                            })}
                                          />
                                        </td>
                                        <td className="p-1.5">
                                          <Input
                                            type="number"
                                            className="h-7 w-24"
                                            value={c.distancia_individual_m ?? ''}
                                            onChange={(e) => updateTroncal(piso.id, troncal.id, {
                                              cocheras: troncal.cocheras.map((x) => (x.id === c.id ? { ...x, distancia_individual_m: e.target.value } : x)),
                                            })}
                                          />
                                        </td>
                                        <td className="p-1.5 text-right">
                                          <button type="button" onClick={() => eliminarCochera(piso.id, troncal.id, c.id)} className="cursor-pointer text-muted-foreground hover:text-destructive">
                                            <Trash2 className="h-3.5 w-3.5" />
                                          </button>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                    <Button size="sm" variant="outline" onClick={() => agregarTroncal(piso.id)}><Plus className="h-4 w-4" />Agregar troncal</Button>
                  </CardContent>
                )}
              </Card>
            ))}
            <Button size="sm" onClick={agregarPiso}><Plus className="h-4 w-4" />Agregar piso</Button>
            <Button size="sm" variant="outline" loading={saving} onClick={() => guardar({}, 'Estructura guardada.')} className="self-end">Guardar estructura</Button>
          </div>
        </TabsContent>

        <TabsContent value="electrico">
          <Card>
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2"><Zap className="h-4 w-4" />Calculo electrico por troncal</CardTitle>
              <Button size="sm" loading={recalculando} onClick={handleRecalcular}><Calculator className="h-4 w-4" />Recalcular ingenieria</Button>
            </CardHeader>
            <CardContent>
              <p className="mb-3 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700">{cot.disclaimer_predimensionado}</p>
              {pisos.flatMap((p) => p.troncales).length === 0 && <p className="text-sm text-muted-foreground">Todavia no hay troncales cargados.</p>}
              <div className="flex flex-col gap-2">
                {pisos.map((piso) => piso.troncales.map((t) => (
                  <div key={t.id} className="rounded-lg border border-border p-3 text-sm">
                    <p className="font-medium">{t.nombre} <span className="font-normal text-muted-foreground">({piso.nombre})</span></p>
                    {!t.calculo && <p className="text-xs text-muted-foreground">Sin calcular todavia - usa &quot;Recalcular ingenieria&quot;.</p>}
                    {t.calculo && (
                      <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
                        <span>Corriente diseno: <b>{t.calculo.corriente_diseno_a} A</b></span>
                        <span>Seccion: <b>{t.calculo.seccion_mm2} mm2</b></span>
                        <span>Termica: <b>{t.calculo.calibre_termica_a != null ? `${t.calculo.calibre_termica_a} A` : 'a definir'}</b></span>
                        <span>Caida tension: <b className={t.calculo.caida_tension_ok ? '' : 'text-destructive'}>{t.calculo.caida_tension_pct}%</b></span>
                        {t.calculo.advertencias?.map((a, i) => (
                          <span key={i} className="col-span-full text-amber-700">⚠ {a}</span>
                        ))}
                      </div>
                    )}
                  </div>
                )))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="red">
          <Card>
            <CardHeader><CardTitle>Infraestructura y red</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-4">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!infra.tablero_principal} onChange={(e) => setInfra({ ...infra, tablero_principal: e.target.checked })} />Tablero principal EV (marcar si el edificio necesita uno nuevo)</label>

              <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                <p className="mb-2 font-medium">Se agrega automaticamente al generar el presupuesto (no requiere tildar nada):</p>
                <ul className="flex flex-col gap-1 text-muted-foreground">
                  <li>• 1 Router WAN + 4G/LTE failover (fijo, todo el edificio)</li>
                  <li>• 1 Medidor trifasico general + Gateway Modbus TCP (kit, fijo, todo el edificio)</li>
                  <li>• 1 Fuente 24V DIN para el gateway</li>
                  {pisos.flatMap((p) => p.troncales || []).length === 0 && (
                    <li className="italic">Todavia no hay troncales cargados - los switches se calculan uno por troncal.</li>
                  )}
                  {pisos.flatMap((p) => (p.troncales || []).map((t) => ({ ...t, pisoNombre: p.nombre }))).map((t) => (
                    <li key={t.id}>
                      • 1 Switch {puertosNecesariosCliente((t.cocheras || []).length)} puertos - {t.nombre} ({t.pisoNombre}) - dimensionado a {(t.cocheras || []).length} cocheras
                    </li>
                  ))}
                  <li>• Por cada troncal: cable 220V + backbone UTP + conectores RJ-45 para su switch</li>
                </ul>
              </div>
              <Button size="sm" loading={saving} onClick={() => guardar({}, 'Infraestructura guardada.')} className="self-end">Guardar</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="wallboxes">
          <Card>
            <CardHeader><CardTitle>Wallboxes iniciales (Etapa 2)</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-4">
              <form onSubmit={handleAgregarWallbox} className="flex flex-wrap items-end gap-2 rounded-lg bg-muted/40 p-3">
                <div>
                  <Label>Cochera</Label>
                  <select
                    className={`${SELECT_CLASS} w-56`}
                    value={wbForm.cochera?.id || ''}
                    onChange={(e) => setWbForm({ ...wbForm, cochera: cocherasDisponibles.find((c) => c.id === e.target.value) || null })}
                  >
                    <option value="">Elegir cochera...</option>
                    {cocherasDisponibles.map((c) => (
                      <option key={c.id} value={c.id}>N° {c.numero} - {c.troncalNombre} ({c.pisoNombre})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Modelo</Label>
                  <select className={`${SELECT_CLASS} w-52`} value={wbForm.modeloIdx} onChange={(e) => setWbForm({ ...wbForm, modeloIdx: Number(e.target.value) })}>
                    {WALLBOX_MODELOS.map((m, i) => <option key={m.modelo} value={i}>{m.modelo}</option>)}
                  </select>
                </div>
                <div>
                  <Label>Longitud de cable (m)</Label>
                  <Input type="number" className="w-28" value={wbForm.longitud_cable_m} onChange={(e) => setWbForm({ ...wbForm, longitud_cable_m: e.target.value })} />
                </div>
                <Button type="submit" size="sm" disabled={!wbForm.cochera}><Plus className="h-4 w-4" />Agregar wallbox</Button>
              </form>

              {wallboxes.length === 0 && <p className="text-sm text-muted-foreground">Sin wallboxes iniciales todavia (la infraestructura se prepara igual al 100% de las cocheras).</p>}
              {wallboxes.length > 0 && (
                <div className="flex flex-col gap-2">
                  {wallboxes.map((wb) => (
                    <div key={wb.id} className="flex items-center justify-between rounded-lg border border-border p-2.5 text-sm">
                      <span>Cochera {wb.cochera_id} - {wb.modelo} ({wb.potencia_kw} kW)</span>
                      <button type="button" onClick={() => handleEliminarWallbox(wb.id)} className="cursor-pointer text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="presupuesto">
          <Card>
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
              <CardTitle>Presupuesto</CardTitle>
              <Button size="sm" variant="outline" loading={generandoBom} onClick={handleGenerarBom}>Generar desde configuracion</Button>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {bom.length === 0 && <p className="text-sm text-muted-foreground">Sin lineas todavia - usa &quot;Generar desde configuracion&quot;.</p>}
              {itemsPendientes > 0 && (
                <p className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs font-medium text-amber-800">
                  {itemsPendientes} item(s) sin precio cargado (resaltados abajo) - no se puede enviar ni imprimir hasta completarlos.
                </p>
              )}
              {CATEGORIAS_BOM.map((cat) => {
                const lineas = bomConTotales.map((l, i) => ({ ...l, idx: i })).filter((l) => l.categoria === cat);
                if (lineas.length === 0) return null;
                return (
                  <div key={cat}>
                    <p className="mb-1 text-sm font-semibold">{cat}</p>
                    <div className="overflow-x-auto rounded-lg border border-border">
                      <table className="w-full min-w-[640px] text-xs">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="p-1.5 text-left">Descripcion</th>
                            <th className="p-1.5 text-left">Item de catalogo</th>
                            <th className="p-1.5 text-right">Cant.</th>
                            <th className="p-1.5 text-right">P. unitario</th>
                            <th className="p-1.5 text-right">Subtotal</th>
                            <th className="p-1.5" />
                          </tr>
                        </thead>
                        <tbody>
                          {lineas.map((l) => (
                            <tr key={l.idx} className={`border-t border-border ${l.pendiente_precio ? 'bg-amber-50' : ''}`}>
                              <td className="p-1.5">
                                {l.estimado && <span title="Precio buscado por IA - revisar antes de enviar" className="mr-1 font-bold text-amber-600">*</span>}
                                {l.descripcion}
                              </td>
                              <td className="p-1.5">
                                <select className={`${SELECT_CLASS} h-8`} value={l.catalogo_item_id || ''} onChange={(e) => elegirCatalogoItem(l.idx, e.target.value)}>
                                  <option value="">{l.pendiente_precio ? 'Sin precio - elegir' : 'Elegir item...'}</option>
                                  {catalogo.map((c) => <option key={c.id} value={c.id}>{c.nombre} ({money(c.precio_unitario, cot.moneda)})</option>)}
                                </select>
                              </td>
                              <td className="p-1.5 text-right">
                                <Input type="number" className="h-8 w-20 text-right" value={l.cantidad} onChange={(e) => updateLineaBom(l.idx, { cantidad: e.target.value })} />
                              </td>
                              <td className="p-1.5 text-right">
                                <Input type="number" className="h-8 w-24 text-right" value={l.precio_unitario ?? ''} onChange={(e) => updateLineaBom(l.idx, { precio_unitario: e.target.value, pendiente_precio: false })} />
                              </td>
                              <td className="p-1.5 text-right tabular-nums">{money(l.subtotal, cot.moneda)}</td>
                              <td className="p-1.5">
                                {l.pendiente_precio && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8 whitespace-nowrap px-2 text-xs"
                                    loading={buscandoIA.has(l.idx)}
                                    onClick={() => handleBuscarIA(l.idx)}
                                    title="Buscar precio de referencia real en internet (IA con busqueda web)"
                                  >
                                    <Sparkles className="h-3.5 w-3.5" />IA
                                  </Button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="mt-1 text-right text-xs font-medium">Subtotal {cat}: {money(subtotalPorCategoria[cat], cot.moneda)}</p>
                  </div>
                );
              })}

              <div className="grid gap-3 rounded-lg bg-muted/40 p-3 sm:grid-cols-3">
                <div>
                  <Label>Margen BilOn (%)</Label>
                  <Input type="number" value={margenPct} onChange={(e) => setMargenPct(e.target.value)} />
                </div>
                <div>
                  <Label>IVA (%)</Label>
                  <Input type="number" value={ivaPct} onChange={(e) => setIvaPct(e.target.value)} />
                </div>
                <div className="flex flex-col justify-end text-right">
                  <p className="text-xs text-muted-foreground">Subtotal: {money(subtotalGeneral, cot.moneda)}</p>
                  <p className="text-xs text-muted-foreground">Margen: {money(margenMonto, cot.moneda)}</p>
                  <p className="text-xs text-muted-foreground">IVA: {money(ivaMonto, cot.moneda)}</p>
                  <p className="text-base font-semibold">Total: {money(totalGeneral, cot.moneda)}</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{cot.disclaimer_predimensionado}</p>
              <Button size="sm" loading={saving} onClick={handleGuardarPresupuesto} className="self-end">Guardar presupuesto</Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </AdminLayout>
  );
}
