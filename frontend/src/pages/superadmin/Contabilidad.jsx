import { useEffect, useState } from 'react';
import {
  Plus, Wallet, TrendingUp, TrendingDown, Sparkles, Upload,
} from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import AdminLayout from '@/components/AdminLayout';
import {
  Card, CardHeader, CardTitle, CardContent,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
  Badge, Button, Input, Label, StatCard,
  Tabs, TabsList, TabsTrigger, TabsContent,
  Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui';
import { SUPERADMIN_NAV } from './navConfig';
import { ProveedorPicker } from './Proveedores';

const SELECT_CLASS = 'flex h-10 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const hoy = () => new Date().toISOString().slice(0, 10);
const mesActual = () => new Date().toISOString().slice(0, 7);
const money = (n) => `$${Number(n ?? 0).toFixed(2)}`;

const EMPTY_CUENTA_FORM = {
  nombre: '', tipo: 'banco', banco: '', numero_cuenta: '', cbu_alias: '', saldo_inicial: '0', fecha_saldo_inicial: hoy(),
};
const EMPTY_GASTO_FORM = {
  fecha: hoy(), proveedor_nombre: '', categoria_id: '', monto: '', nota: '',
};
const EMPTY_MOV_FORM = {
  cuenta_bancaria_id: '', fecha: hoy(), tipo: 'ingreso', monto: '', concepto: '',
};

export default function Contabilidad() {
  const [cuentas, setCuentas] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [gastos, setGastos] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [facturasPendientes, setFacturasPendientes] = useState([]);
  const [resultado, setResultado] = useState(null);
  const [balance, setBalance] = useState(null);
  const [rangoResultado, setRangoResultado] = useState({ desde: mesActual(), hasta: mesActual() });
  const [fechaBalance, setFechaBalance] = useState(hoy());
  const [saving, setSaving] = useState(false);

  const [cuentaOpen, setCuentaOpen] = useState(false);
  const [cuentaForm, setCuentaForm] = useState(EMPTY_CUENTA_FORM);

  const [gastoOpen, setGastoOpen] = useState(false);
  const [gastoForm, setGastoForm] = useState(EMPTY_GASTO_FORM);
  const [editGasto, setEditGasto] = useState(null); // gasto row, or null
  const [editGastoForm, setEditGastoForm] = useState(EMPTY_GASTO_FORM);
  const [pagarGasto, setPagarGasto] = useState(null); // gasto row, or null
  const [pagarForm, setPagarForm] = useState({ cuenta_bancaria_id: '', fecha: hoy() });

  const [productos, setProductos] = useState([]);
  const [proveedores, setProveedores] = useState([]);

  const [facturaIaOpen, setFacturaIaOpen] = useState(false);
  const [facturaIaLoading, setFacturaIaLoading] = useState(false);
  const [facturaIaConfirming, setFacturaIaConfirming] = useState(false);
  const [facturaIaItems, setFacturaIaItems] = useState(null); // items extraidos, editables, cada uno puede cargarse a stock
  const [facturaIaForm, setFacturaIaForm] = useState({ ...EMPTY_GASTO_FORM, proveedor_id: '' });

  const [movOpen, setMovOpen] = useState(false);
  const [movForm, setMovForm] = useState(EMPTY_MOV_FORM);

  const [cobrarFactura, setCobrarFactura] = useState(null); // factura row, or null
  const [cobrarForm, setCobrarForm] = useState({ cuenta_bancaria_id: '', fecha: hoy() });

  async function loadAll() {
    const [cu, cat, ga, mo, fa, pr, pv] = await Promise.all([
      api.get('/contabilidad/cuentas'),
      api.get('/contabilidad/categorias-gasto'),
      api.get('/contabilidad/gastos'),
      api.get('/contabilidad/movimientos'),
      api.get('/contabilidad/facturas-pendientes'),
      api.get('/admin/productos-catalogo'),
      api.get('/admin/proveedores'),
    ]);
    setCuentas(cu.data);
    setCategorias(cat.data);
    setGastos(ga.data);
    setMovimientos(mo.data);
    setFacturasPendientes(fa.data);
    setProductos(pr.data);
    setProveedores(pv.data);
  }

  async function loadResultado(desde, hasta) {
    const { data } = await api.get('/contabilidad/resultado', { params: { desde, hasta } });
    setResultado(data);
  }

  async function loadBalance(fecha) {
    const { data } = await api.get('/contabilidad/balance', { params: { fecha } });
    setBalance(data);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAll();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadResultado(mesActual(), mesActual());
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadBalance(hoy());
  }, []);

  async function handleCreateCuenta(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/contabilidad/cuentas', {
        ...cuentaForm,
        saldo_inicial: cuentaForm.saldo_inicial === '' ? 0 : Number(cuentaForm.saldo_inicial),
      });
      setCuentaOpen(false);
      setCuentaForm(EMPTY_CUENTA_FORM);
      toast.success('Cuenta creada.');
      loadAll();
      loadBalance(fechaBalance);
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo crear la cuenta.');
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateGasto(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/contabilidad/gastos', {
        ...gastoForm,
        categoria_id: gastoForm.categoria_id ? Number(gastoForm.categoria_id) : null,
        monto: Number(gastoForm.monto),
      });
      setGastoOpen(false);
      setGastoForm(EMPTY_GASTO_FORM);
      toast.success('Gasto registrado (pendiente de pago).');
      loadAll();
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo registrar el gasto.');
    } finally {
      setSaving(false);
    }
  }

  async function handleAnalizarFactura(file) {
    if (!file) return;
    setFacturaIaLoading(true);
    setFacturaIaItems(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await api.post('/admin/facturas-ia/preview', formData);
      const items = (Array.isArray(data.items) ? data.items : []).map((it) => ({
        descripcion: it.descripcion ?? '',
        cantidad: it.cantidad ?? 1,
        precio_unitario: it.precio_unitario ?? '',
        monto: it.monto ?? '',
        cargar_stock: false,
        producto_id: '',
        identificadores: '',
      }));
      setFacturaIaItems(items);

      // Si el nombre extraido matchea (parcial, sin distinguir mayus/minus)
      // algun proveedor ya cargado, lo preseleccionamos.
      const proveedorMatch = data.proveedor_nombre
        ? proveedores.find((p) => p.nombre_empresa.toLowerCase().includes(data.proveedor_nombre.toLowerCase())
          || data.proveedor_nombre.toLowerCase().includes(p.nombre_empresa.toLowerCase()))
        : null;

      const notaItems = items.map((it) => `${it.cantidad}x ${it.descripcion}${it.monto ? ` ($${Number(it.monto).toFixed(2)})` : ''}`).join('; ');
      setFacturaIaForm({
        fecha: data.fecha || hoy(),
        proveedor_nombre: data.proveedor_nombre || '',
        proveedor_id: proveedorMatch ? String(proveedorMatch.id) : '',
        categoria_id: '',
        monto: data.monto_total != null ? String(data.monto_total) : '',
        nota: [data.numero_factura ? `Factura ${data.numero_factura}` : null, notaItems].filter(Boolean).join(' — '),
      });
      toast.success('Factura analizada. Revisa los datos antes de confirmar.');
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo analizar la factura.');
    } finally {
      setFacturaIaLoading(false);
    }
  }

  function updateFacturaIaItem(idx, patch) {
    setFacturaIaItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  async function handleConfirmarFacturaIa(e) {
    e.preventDefault();
    if (!facturaIaForm.monto) return;

    const itemsAStock = facturaIaItems.filter((it) => it.cargar_stock && it.producto_id);
    const sinSerie = itemsAStock.filter((it) => {
      const producto = productos.find((p) => String(p.id) === String(it.producto_id));
      return producto?.serializado && it.identificadores.split('\n').map((s) => s.trim()).filter(Boolean).length === 0;
    });
    if (sinSerie.length > 0) {
      toast.error(`Falta el numero de serie de: ${sinSerie.map((it) => it.descripcion).join(', ')}`);
      return;
    }

    setFacturaIaConfirming(true);
    try {
      await api.post('/contabilidad/gastos', {
        fecha: facturaIaForm.fecha,
        proveedor_nombre: facturaIaForm.proveedor_nombre,
        categoria_id: facturaIaForm.categoria_id ? Number(facturaIaForm.categoria_id) : null,
        monto: Number(facturaIaForm.monto),
        nota: facturaIaForm.nota,
      });

      for (const item of itemsAStock) {
        const producto = productos.find((p) => String(p.id) === String(item.producto_id));
        if (!producto) continue;
        if (producto.serializado) {
          const identificadores = item.identificadores.split('\n').map((s) => s.trim()).filter(Boolean);
          await api.post('/admin/stock-items', {
            producto_id: producto.id,
            identificadores,
            costo_compra: item.precio_unitario ? Number(item.precio_unitario) : null,
            proveedor_id: facturaIaForm.proveedor_id ? Number(facturaIaForm.proveedor_id) : null,
          });
        } else {
          await api.post('/admin/stock-movimientos', {
            producto_id: producto.id,
            tipo: 'ingreso',
            cantidad: Number(item.cantidad) || 1,
            costo_unitario: item.precio_unitario ? Number(item.precio_unitario) : null,
            nota: item.descripcion,
            proveedor_id: facturaIaForm.proveedor_id ? Number(facturaIaForm.proveedor_id) : null,
          });
        }
      }

      setFacturaIaOpen(false);
      setFacturaIaItems(null);
      setFacturaIaForm({ ...EMPTY_GASTO_FORM, proveedor_id: '' });
      toast.success(`Gasto registrado.${itemsAStock.length > 0 ? ` ${itemsAStock.length} item(s) cargados a stock.` : ''}`);
      loadAll();
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo completar la carga.');
    } finally {
      setFacturaIaConfirming(false);
    }
  }

  async function handlePagarGasto(e) {
    e.preventDefault();
    if (!pagarForm.cuenta_bancaria_id) return;
    setSaving(true);
    try {
      await api.post(`/contabilidad/gastos/${pagarGasto.id}/pagar`, {
        cuenta_bancaria_id: Number(pagarForm.cuenta_bancaria_id),
        fecha: pagarForm.fecha,
      });
      setPagarGasto(null);
      toast.success('Gasto pagado.');
      loadAll();
      loadBalance(fechaBalance);
      loadResultado(rangoResultado.desde, rangoResultado.hasta);
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo registrar el pago.');
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateGasto(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put(`/contabilidad/gastos/${editGasto.id}`, {
        ...editGastoForm,
        categoria_id: editGastoForm.categoria_id ? Number(editGastoForm.categoria_id) : null,
        monto: Number(editGastoForm.monto),
      });
      setEditGasto(null);
      toast.success('Gasto actualizado.');
      loadAll();
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo actualizar el gasto.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteGasto(gastoId) {
    if (!confirm('Borrar este gasto pendiente?')) return;
    try {
      await api.delete(`/contabilidad/gastos/${gastoId}`);
      loadAll();
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo borrar.');
    }
  }

  async function handleCreateMov(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/contabilidad/movimientos', { ...movForm, monto: Number(movForm.monto) });
      setMovOpen(false);
      setMovForm(EMPTY_MOV_FORM);
      toast.success('Movimiento registrado.');
      loadAll();
      loadBalance(fechaBalance);
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo registrar el movimiento.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteMov(movId) {
    if (!confirm('Borrar este movimiento?')) return;
    try {
      await api.delete(`/contabilidad/movimientos/${movId}`);
      loadAll();
      loadBalance(fechaBalance);
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo borrar.');
    }
  }

  async function handleCobrarFactura(e) {
    e.preventDefault();
    if (!cobrarForm.cuenta_bancaria_id) return;
    setSaving(true);
    try {
      await api.post(`/contabilidad/facturas/${cobrarFactura.id}/cobrar`, {
        cuenta_bancaria_id: Number(cobrarForm.cuenta_bancaria_id),
        fecha: cobrarForm.fecha,
      });
      setCobrarFactura(null);
      toast.success('Factura cobrada.');
      loadAll();
      loadBalance(fechaBalance);
      loadResultado(rangoResultado.desde, rangoResultado.hasta);
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo registrar el cobro.');
    } finally {
      setSaving(false);
    }
  }

  const totalDisponible = cuentas.filter((c) => c.activa).reduce((sum, c) => sum + Number(c.saldo_actual), 0);
  const totalPorCobrar = facturasPendientes.reduce((sum, f) => sum + Number(f.monto_total), 0);
  const totalPorPagar = gastos.filter((g) => g.estado === 'pendiente').reduce((sum, g) => sum + Number(g.monto), 0);

  return (
    <AdminLayout title="Contabilidad" navItems={SUPERADMIN_NAV}>
      <p className="mb-6 text-sm text-muted-foreground">Plata propia de Bilon - separada de la facturacion a los edificios.</p>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard color="emerald" icon={Wallet} label="Disponible (caja + bancos)" value={money(totalDisponible)} />
        <StatCard color="blue" icon={TrendingUp} label="Por cobrar (facturas pendientes)" value={money(totalPorCobrar)} />
        <StatCard color="amber" icon={TrendingDown} label="Por pagar (gastos pendientes)" value={money(totalPorPagar)} />
      </div>

      <Tabs defaultValue="cuentas">
        <TabsList>
          <TabsTrigger value="cuentas">Cuentas</TabsTrigger>
          <TabsTrigger value="movimientos">Movimientos</TabsTrigger>
          <TabsTrigger value="gastos">Gastos</TabsTrigger>
          <TabsTrigger value="cta-cte">Cuenta corriente clientes</TabsTrigger>
          <TabsTrigger value="resultado">Estado de resultado</TabsTrigger>
          <TabsTrigger value="balance">Balance</TabsTrigger>
        </TabsList>

        <TabsContent value="cuentas">
          <Card>
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
              <CardTitle>Cuentas bancarias y caja</CardTitle>
              <Dialog open={cuentaOpen} onOpenChange={(o) => { setCuentaOpen(o); if (!o) setCuentaForm(EMPTY_CUENTA_FORM); }}>
                <DialogTrigger asChild>
                  <Button size="sm"><Plus className="h-4 w-4" />Nueva cuenta</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Nueva cuenta</DialogTitle></DialogHeader>
                  <form onSubmit={handleCreateCuenta} className="flex flex-col gap-3">
                    <div>
                      <Label htmlFor="cNombre">Nombre</Label>
                      <Input id="cNombre" required placeholder="Ej: Caja chica, Banco Galicia" value={cuentaForm.nombre} onChange={(e) => setCuentaForm({ ...cuentaForm, nombre: e.target.value })} />
                    </div>
                    <div>
                      <Label htmlFor="cTipo">Tipo</Label>
                      <select id="cTipo" value={cuentaForm.tipo} onChange={(e) => setCuentaForm({ ...cuentaForm, tipo: e.target.value })} className={SELECT_CLASS}>
                        <option value="banco">Banco</option>
                        <option value="efectivo">Efectivo</option>
                      </select>
                    </div>
                    {cuentaForm.tipo === 'banco' && (
                      <>
                        <div>
                          <Label htmlFor="cBanco">Banco</Label>
                          <Input id="cBanco" value={cuentaForm.banco} onChange={(e) => setCuentaForm({ ...cuentaForm, banco: e.target.value })} />
                        </div>
                        <div>
                          <Label htmlFor="cNumero">Numero de cuenta</Label>
                          <Input id="cNumero" value={cuentaForm.numero_cuenta} onChange={(e) => setCuentaForm({ ...cuentaForm, numero_cuenta: e.target.value })} />
                        </div>
                        <div>
                          <Label htmlFor="cCbu">CBU / Alias</Label>
                          <Input id="cCbu" value={cuentaForm.cbu_alias} onChange={(e) => setCuentaForm({ ...cuentaForm, cbu_alias: e.target.value })} />
                        </div>
                      </>
                    )}
                    <div>
                      <Label htmlFor="cSaldo">Saldo inicial</Label>
                      <Input id="cSaldo" type="number" step="0.01" value={cuentaForm.saldo_inicial} onChange={(e) => setCuentaForm({ ...cuentaForm, saldo_inicial: e.target.value })} />
                    </div>
                    <div>
                      <Label htmlFor="cFechaSaldo">Fecha del saldo inicial</Label>
                      <Input id="cFechaSaldo" type="date" value={cuentaForm.fecha_saldo_inicial} onChange={(e) => setCuentaForm({ ...cuentaForm, fecha_saldo_inicial: e.target.value })} />
                    </div>
                    <Button type="submit" className="mt-2" loading={saving}>Crear cuenta</Button>
                  </form>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {cuentas.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay cuentas cargadas. Cargá la caja y/o tus cuentas bancarias.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Banco</TableHead>
                      <TableHead className="text-right">Saldo inicial</TableHead>
                      <TableHead className="text-right">Saldo actual</TableHead>
                      <TableHead>Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cuentas.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.nombre}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{c.tipo === 'banco' ? 'Banco' : 'Efectivo'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{c.banco || '-'}{c.cbu_alias ? ` · ${c.cbu_alias}` : ''}</TableCell>
                        <TableCell className="tabular-nums text-right">{money(c.saldo_inicial)}</TableCell>
                        <TableCell className="tabular-nums text-right font-semibold">{money(c.saldo_actual)}</TableCell>
                        <TableCell><Badge variant={c.activa ? 'accent' : 'muted'}>{c.activa ? 'Activa' : 'Inactiva'}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="movimientos">
          <Card>
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
              <CardTitle>Movimientos de caja/banco</CardTitle>
              <Dialog open={movOpen} onOpenChange={(o) => { setMovOpen(o); if (!o) setMovForm(EMPTY_MOV_FORM); }}>
                <DialogTrigger asChild>
                  <Button size="sm"><Plus className="h-4 w-4" />Movimiento manual</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Nuevo movimiento manual</DialogTitle>
                    <DialogDescription>Para lo que no venga de pagar un gasto o cobrar una factura (aporte de capital, retiro, ajuste, etc).</DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleCreateMov} className="flex flex-col gap-3">
                    <div>
                      <Label htmlFor="mCuenta">Cuenta</Label>
                      <select id="mCuenta" required value={movForm.cuenta_bancaria_id} onChange={(e) => setMovForm({ ...movForm, cuenta_bancaria_id: e.target.value })} className={SELECT_CLASS}>
                        <option value="">Selecciona una cuenta</option>
                        {cuentas.filter((c) => c.activa).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="mTipo">Tipo</Label>
                      <select id="mTipo" value={movForm.tipo} onChange={(e) => setMovForm({ ...movForm, tipo: e.target.value })} className={SELECT_CLASS}>
                        <option value="ingreso">Ingreso</option>
                        <option value="egreso">Egreso</option>
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="mFecha">Fecha</Label>
                      <Input id="mFecha" type="date" value={movForm.fecha} onChange={(e) => setMovForm({ ...movForm, fecha: e.target.value })} />
                    </div>
                    <div>
                      <Label htmlFor="mMonto">Monto</Label>
                      <Input id="mMonto" type="number" step="0.01" min="0.01" required value={movForm.monto} onChange={(e) => setMovForm({ ...movForm, monto: e.target.value })} />
                    </div>
                    <div>
                      <Label htmlFor="mConcepto">Concepto</Label>
                      <Input id="mConcepto" required value={movForm.concepto} onChange={(e) => setMovForm({ ...movForm, concepto: e.target.value })} />
                    </div>
                    <Button type="submit" className="mt-2" loading={saving}>Registrar</Button>
                  </form>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {movimientos.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin movimientos todavia.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Cuenta</TableHead>
                      <TableHead>Concepto</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {movimientos.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="text-xs text-muted-foreground">{m.fecha}</TableCell>
                        <TableCell>{m.cuenta_nombre}</TableCell>
                        <TableCell>{m.concepto}</TableCell>
                        <TableCell className={`tabular-nums text-right font-medium ${m.tipo === 'ingreso' ? 'text-accent' : 'text-destructive'}`}>
                          {m.tipo === 'ingreso' ? '+' : '-'}{money(m.monto)}
                        </TableCell>
                        <TableCell className="text-right">
                          {!m.gasto_id && !m.factura_bilon_id && (
                            <Button size="sm" variant="destructive" onClick={() => handleDeleteMov(m.id)}>Borrar</Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="gastos">
          <Card>
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
              <CardTitle>Gastos</CardTitle>
              <div className="flex gap-2">
                <Dialog
                  open={facturaIaOpen}
                  onOpenChange={(o) => { setFacturaIaOpen(o); if (!o) { setFacturaIaItems(null); setFacturaIaForm(EMPTY_GASTO_FORM); } }}
                >
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline"><Sparkles className="h-4 w-4" />Cargar factura (IA)</Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-xl">
                    <DialogHeader>
                      <DialogTitle>Cargar factura con IA</DialogTitle>
                      <DialogDescription>Subi una foto o PDF de la factura del proveedor - la IA extrae los datos, revisalos antes de confirmar.</DialogDescription>
                    </DialogHeader>
                    {!facturaIaItems ? (
                      <div className="flex flex-col gap-3">
                        <label
                          htmlFor="facturaFile"
                          className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground hover:bg-muted"
                        >
                          <Upload className="h-6 w-6" />
                          {facturaIaLoading ? 'Analizando factura...' : 'Click para elegir una imagen o PDF'}
                          <input
                            id="facturaFile"
                            type="file"
                            accept="image/*,.pdf"
                            className="hidden"
                            disabled={facturaIaLoading}
                            onChange={(e) => handleAnalizarFactura(e.target.files?.[0])}
                          />
                        </label>
                      </div>
                    ) : (
                      <form onSubmit={handleConfirmarFacturaIa} className="flex flex-col gap-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label htmlFor="fiaFecha">Fecha</Label>
                            <Input id="fiaFecha" type="date" value={facturaIaForm.fecha} onChange={(e) => setFacturaIaForm({ ...facturaIaForm, fecha: e.target.value })} />
                          </div>
                          <div>
                            <Label htmlFor="fiaCategoria">Categoria del gasto</Label>
                            <select id="fiaCategoria" value={facturaIaForm.categoria_id} onChange={(e) => setFacturaIaForm({ ...facturaIaForm, categoria_id: e.target.value })} className={SELECT_CLASS}>
                              <option value="">Sin categoria</option>
                              {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                            </select>
                          </div>
                        </div>
                        <ProveedorPicker
                          proveedores={proveedores}
                          value={facturaIaForm.proveedor_id}
                          onChange={(v) => setFacturaIaForm({
                            ...facturaIaForm, proveedor_id: v, proveedor_nombre: proveedores.find((p) => String(p.id) === v)?.nombre_empresa ?? facturaIaForm.proveedor_nombre,
                          })}
                          onProveedorCreado={(p) => {
                            setProveedores([...proveedores, p]);
                            setFacturaIaForm({ ...facturaIaForm, proveedor_id: String(p.id), proveedor_nombre: p.nombre_empresa });
                          }}
                        />
                        {facturaIaForm.proveedor_nombre && !facturaIaForm.proveedor_id && (
                          <p className="-mt-2 text-xs text-amber-600">La IA leyo "{facturaIaForm.proveedor_nombre}" - no matchea con ningun proveedor cargado. Elegi uno o crea uno nuevo con el +.</p>
                        )}
                        <div>
                          <Label htmlFor="fiaMonto">Monto total del gasto</Label>
                          <Input id="fiaMonto" type="number" step="0.01" min="0.01" required value={facturaIaForm.monto} onChange={(e) => setFacturaIaForm({ ...facturaIaForm, monto: e.target.value })} />
                        </div>
                        <div>
                          <Label htmlFor="fiaNota">Nota</Label>
                          <Input id="fiaNota" value={facturaIaForm.nota} onChange={(e) => setFacturaIaForm({ ...facturaIaForm, nota: e.target.value })} />
                        </div>

                        {facturaIaItems.length > 0 && (
                          <div className="rounded-lg border border-border p-3">
                            <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                              Items detectados - tildá los que son productos para cargar en Stock (wallbox, medidores, etc)
                            </p>
                            <div className="flex flex-col gap-3">
                              {facturaIaItems.map((it, i) => {
                                const productoElegido = productos.find((p) => String(p.id) === String(it.producto_id));
                                return (
                                  // eslint-disable-next-line react/no-array-index-key
                                  <div key={i} className="rounded-lg border border-border p-2.5">
                                    <label className="flex cursor-pointer items-start gap-2 text-sm">
                                      <input
                                        type="checkbox"
                                        className="mt-0.5 h-4 w-4"
                                        checked={it.cargar_stock}
                                        onChange={(e) => updateFacturaIaItem(i, { cargar_stock: e.target.checked })}
                                      />
                                      <span className="flex-1">
                                        {it.cantidad}x {it.descripcion}
                                        {it.monto ? <span className="text-muted-foreground"> — ${Number(it.monto).toFixed(2)}</span> : null}
                                      </span>
                                    </label>
                                    {it.cargar_stock && (
                                      <div className="mt-2 flex flex-col gap-2 pl-6">
                                        <select
                                          value={it.producto_id}
                                          onChange={(e) => updateFacturaIaItem(i, { producto_id: e.target.value, identificadores: '' })}
                                          className={SELECT_CLASS}
                                        >
                                          <option value="">Elegi el producto del catalogo</option>
                                          {productos.map((p) => <option key={p.id} value={p.id}>{p.marca} {p.modelo}</option>)}
                                        </select>
                                        {productoElegido?.serializado && (
                                          <textarea
                                            required
                                            rows={2}
                                            placeholder={'Numero de serie por linea, ej:\nWB-0001\nWB-0002'}
                                            value={it.identificadores}
                                            onChange={(e) => updateFacturaIaItem(i, { identificadores: e.target.value })}
                                            className="flex w-full rounded-lg border border-border bg-card px-3 py-2 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                          />
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        <div className="mt-2 flex gap-2">
                          <Button type="button" variant="outline" onClick={() => setFacturaIaItems(null)}>Volver a subir</Button>
                          <Button type="submit" loading={facturaIaConfirming}>Confirmar</Button>
                        </div>
                      </form>
                    )}
                  </DialogContent>
                </Dialog>
                <Dialog open={gastoOpen} onOpenChange={(o) => { setGastoOpen(o); if (!o) setGastoForm(EMPTY_GASTO_FORM); }}>
                  <DialogTrigger asChild>
                    <Button size="sm"><Plus className="h-4 w-4" />Nuevo gasto</Button>
                  </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Nuevo gasto</DialogTitle>
                    <DialogDescription>Se registra como pendiente. Se marca pagado (y descuenta de una cuenta) despues.</DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleCreateGasto} className="flex flex-col gap-3">
                    <div>
                      <Label htmlFor="gFecha">Fecha</Label>
                      <Input id="gFecha" type="date" value={gastoForm.fecha} onChange={(e) => setGastoForm({ ...gastoForm, fecha: e.target.value })} />
                    </div>
                    <div>
                      <Label htmlFor="gProveedor">Proveedor</Label>
                      <Input id="gProveedor" value={gastoForm.proveedor_nombre} onChange={(e) => setGastoForm({ ...gastoForm, proveedor_nombre: e.target.value })} />
                    </div>
                    <div>
                      <Label htmlFor="gCategoria">Categoria</Label>
                      <select id="gCategoria" value={gastoForm.categoria_id} onChange={(e) => setGastoForm({ ...gastoForm, categoria_id: e.target.value })} className={SELECT_CLASS}>
                        <option value="">Sin categoria</option>
                        {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="gMonto">Monto</Label>
                      <Input id="gMonto" type="number" step="0.01" min="0.01" required value={gastoForm.monto} onChange={(e) => setGastoForm({ ...gastoForm, monto: e.target.value })} />
                    </div>
                    <div>
                      <Label htmlFor="gNota">Nota</Label>
                      <Input id="gNota" value={gastoForm.nota} onChange={(e) => setGastoForm({ ...gastoForm, nota: e.target.value })} />
                    </div>
                    <Button type="submit" className="mt-2" loading={saving}>Registrar gasto</Button>
                  </form>
                </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {gastos.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin gastos registrados.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Proveedor</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {gastos.map((g) => (
                      <TableRow key={g.id}>
                        <TableCell className="text-xs text-muted-foreground">{g.fecha}</TableCell>
                        <TableCell>{g.proveedor_nombre || '-'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{g.categoria_nombre || '-'}</TableCell>
                        <TableCell className="tabular-nums text-right">{money(g.monto)}</TableCell>
                        <TableCell>
                          <Badge variant={g.estado === 'pagado' ? 'accent' : g.estado === 'anulado' ? 'destructive' : 'muted'}>{g.estado}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {g.estado === 'pendiente' && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setEditGasto(g);
                                    setEditGastoForm({
                                      fecha: g.fecha, proveedor_nombre: g.proveedor_nombre || '', categoria_id: g.categoria_id ? String(g.categoria_id) : '', monto: String(g.monto), nota: g.nota || '',
                                    });
                                  }}
                                >
                                  Editar
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => { setPagarGasto(g); setPagarForm({ cuenta_bancaria_id: '', fecha: hoy() }); }}>Pagar</Button>
                                <Button size="sm" variant="destructive" onClick={() => handleDeleteGasto(g.id)}>Borrar</Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Dialog open={editGasto != null} onOpenChange={(o) => !o && setEditGasto(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Editar gasto - {editGasto?.proveedor_nombre || `#${editGasto?.id}`}</DialogTitle>
                <DialogDescription>Solo se puede editar mientras el gasto esta pendiente de pago.</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleUpdateGasto} className="flex flex-col gap-3">
                <div>
                  <Label htmlFor="egFecha">Fecha</Label>
                  <Input id="egFecha" type="date" value={editGastoForm.fecha} onChange={(e) => setEditGastoForm({ ...editGastoForm, fecha: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="egProveedor">Proveedor</Label>
                  <Input id="egProveedor" value={editGastoForm.proveedor_nombre} onChange={(e) => setEditGastoForm({ ...editGastoForm, proveedor_nombre: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="egCategoria">Categoria</Label>
                  <select id="egCategoria" value={editGastoForm.categoria_id} onChange={(e) => setEditGastoForm({ ...editGastoForm, categoria_id: e.target.value })} className={SELECT_CLASS}>
                    <option value="">Sin categoria</option>
                    {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <Label htmlFor="egMonto">Monto</Label>
                  <Input id="egMonto" type="number" step="0.01" min="0.01" required value={editGastoForm.monto} onChange={(e) => setEditGastoForm({ ...editGastoForm, monto: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="egNota">Nota</Label>
                  <Input id="egNota" value={editGastoForm.nota} onChange={(e) => setEditGastoForm({ ...editGastoForm, nota: e.target.value })} />
                </div>
                <Button type="submit" className="mt-2" loading={saving}>Guardar cambios</Button>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={pagarGasto != null} onOpenChange={(o) => !o && setPagarGasto(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Pagar gasto - {pagarGasto?.proveedor_nombre || `#${pagarGasto?.id}`}</DialogTitle>
                <DialogDescription>{pagarGasto && money(pagarGasto.monto)}</DialogDescription>
              </DialogHeader>
              <form onSubmit={handlePagarGasto} className="flex flex-col gap-3">
                <div>
                  <Label htmlFor="pgCuenta">Pagar desde</Label>
                  <select id="pgCuenta" required value={pagarForm.cuenta_bancaria_id} onChange={(e) => setPagarForm({ ...pagarForm, cuenta_bancaria_id: e.target.value })} className={SELECT_CLASS}>
                    <option value="">Selecciona una cuenta</option>
                    {cuentas.filter((c) => c.activa).map((c) => <option key={c.id} value={c.id}>{c.nombre} ({money(c.saldo_actual)})</option>)}
                  </select>
                </div>
                <div>
                  <Label htmlFor="pgFecha">Fecha de pago</Label>
                  <Input id="pgFecha" type="date" value={pagarForm.fecha} onChange={(e) => setPagarForm({ ...pagarForm, fecha: e.target.value })} />
                </div>
                <Button type="submit" className="mt-2" loading={saving}>Confirmar pago</Button>
              </form>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="cta-cte">
          <Card>
            <CardHeader>
              <CardTitle>Cuenta corriente clientes</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">Facturas Bilon pendientes de cobro, de todos los edificios.</p>
            </CardHeader>
            <CardContent>
              {facturasPendientes.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay facturas pendientes. Todo cobrado.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Instalacion</TableHead>
                      <TableHead>UF</TableHead>
                      <TableHead>Periodo</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {facturasPendientes.map((f) => (
                      <TableRow key={f.id}>
                        <TableCell className="font-medium">{f.consorcio_nombre}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{f.numero_departamento || 'Administrador'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{f.periodo}</TableCell>
                        <TableCell className="tabular-nums text-right">{money(f.monto_total)}</TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline" onClick={() => { setCobrarFactura(f); setCobrarForm({ cuenta_bancaria_id: '', fecha: hoy() }); }}>Cobrar</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Dialog open={cobrarFactura != null} onOpenChange={(o) => !o && setCobrarFactura(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Cobrar factura - {cobrarFactura?.consorcio_nombre}</DialogTitle>
                <DialogDescription>{cobrarFactura && `${cobrarFactura.periodo} · ${money(cobrarFactura.monto_total)}`}</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCobrarFactura} className="flex flex-col gap-3">
                <div>
                  <Label htmlFor="cfCuenta">Recibir en</Label>
                  <select id="cfCuenta" required value={cobrarForm.cuenta_bancaria_id} onChange={(e) => setCobrarForm({ ...cobrarForm, cuenta_bancaria_id: e.target.value })} className={SELECT_CLASS}>
                    <option value="">Selecciona una cuenta</option>
                    {cuentas.filter((c) => c.activa).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <Label htmlFor="cfFecha">Fecha de cobro</Label>
                  <Input id="cfFecha" type="date" value={cobrarForm.fecha} onChange={(e) => setCobrarForm({ ...cobrarForm, fecha: e.target.value })} />
                </div>
                <Button type="submit" className="mt-2" loading={saving}>Confirmar cobro</Button>
              </form>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="resultado">
          <Card>
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
              <CardTitle>Estado de resultado</CardTitle>
              <div className="flex items-center gap-2">
                <Input type="month" value={rangoResultado.desde} onChange={(e) => setRangoResultado({ ...rangoResultado, desde: e.target.value })} className="h-9 w-36" />
                <span className="text-sm text-muted-foreground">a</span>
                <Input type="month" value={rangoResultado.hasta} onChange={(e) => setRangoResultado({ ...rangoResultado, hasta: e.target.value })} className="h-9 w-36" />
                <Button size="sm" variant="outline" onClick={() => loadResultado(rangoResultado.desde, rangoResultado.hasta)}>Calcular</Button>
              </div>
            </CardHeader>
            <CardContent>
              {!resultado ? (
                <p className="text-sm text-muted-foreground">Selecciona un rango y calculá.</p>
              ) : (
                <div className="flex flex-col gap-4">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <StatCard color="emerald" label="Ingresos (facturas cobradas)" value={money(resultado.ingresos)} />
                    <StatCard color="amber" label="Egresos (gastos pagados)" value={money(resultado.egresos)} />
                    <StatCard color={resultado.resultado >= 0 ? 'blue' : 'rose'} label="Resultado" value={money(resultado.resultado)} />
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Egresos por categoria</p>
                    {resultado.egresos_por_categoria.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Sin egresos en el periodo.</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Categoria</TableHead>
                            <TableHead className="text-right">Monto</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {resultado.egresos_por_categoria.map((r) => (
                            <TableRow key={r.categoria ?? 'sin-categoria'}>
                              <TableCell>{r.categoria || 'Sin categoria'}</TableCell>
                              <TableCell className="tabular-nums text-right">{money(r.total)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="balance">
          <Card>
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
              <CardTitle>Balance</CardTitle>
              <div className="flex items-center gap-2">
                <Input type="date" value={fechaBalance} onChange={(e) => setFechaBalance(e.target.value)} className="h-9 w-40" />
                <Button size="sm" variant="outline" onClick={() => loadBalance(fechaBalance)}>Calcular</Button>
              </div>
            </CardHeader>
            <CardContent>
              {!balance ? (
                <p className="text-sm text-muted-foreground">Selecciona una fecha y calculá.</p>
              ) : (
                <div className="flex flex-col gap-4">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <StatCard color="blue" label="Activo" value={money(balance.activo.total)} hint={`Disponible ${money(balance.activo.disponible)} + Por cobrar ${money(balance.activo.por_cobrar)}`} />
                    <StatCard color="amber" label="Pasivo" value={money(balance.pasivo.total)} hint={`Por pagar ${money(balance.pasivo.por_pagar)}`} />
                    <StatCard color={balance.patrimonio >= 0 ? 'emerald' : 'rose'} label="Patrimonio" value={money(balance.patrimonio)} hint="Activo - Pasivo" />
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Saldo por cuenta a esta fecha</p>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Cuenta</TableHead>
                          <TableHead className="text-right">Saldo</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {balance.cuentas.map((c) => (
                          <TableRow key={c.id}>
                            <TableCell>{c.nombre}</TableCell>
                            <TableCell className="tabular-nums text-right">{money(c.saldo)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </AdminLayout>
  );
}
