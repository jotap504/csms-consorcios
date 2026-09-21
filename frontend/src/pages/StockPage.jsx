import { useEffect, useState } from 'react';
import { Plus, Package } from 'lucide-react';
import { api } from '@/lib/api';
import { getSession } from '@/lib/auth';
import AdminLayout from '@/components/AdminLayout';
import { toast } from '@/lib/toast';
import {
  Card, CardHeader, CardTitle, CardContent,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
  Badge, Button, Input, Label,
  Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui';
import { SUPERADMIN_NAV } from './superadmin/navConfig';
import { INSTALADOR_NAV } from './instalador/navConfig';
import { ProveedorPicker } from './superadmin/Proveedores';

const TEXTAREA_CLASS = 'flex w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const SELECT_CLASS = 'flex h-10 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

const CATEGORIAS = [
  { value: 'wallbox', label: 'Wallbox' },
  { value: 'medidor', label: 'Medidor' },
  { value: 'router', label: 'Router' },
  { value: 'otro', label: 'Otro' },
];

const EMPTY_PRODUCTO_FORM = {
  categoria: 'wallbox', marca: '', modelo: '', descripcion: '', serializado: true, unidad: 'unidad',
  potencia_kw: '', fases: '', conector: '', montaje: '', ocpp_protocolo: '', tipo_corriente: '',
};

const FASES = [
  { value: 'monofasico', label: 'Monofasico' },
  { value: 'trifasico', label: 'Trifasico' },
];
const CONECTORES = [
  { value: 'type2', label: 'Type 2' },
  { value: 'nacs', label: 'NACS (Tesla)' },
];
const MONTAJES = [
  { value: 'pared', label: 'Pared' },
  { value: 'pie', label: 'Pie' },
];
const OCPP_PROTOCOLOS = [
  { value: '1.6', label: 'OCPP 1.6J' },
  { value: '2.0.1', label: 'OCPP 2.0.1' },
  { value: 'ambos', label: 'Ambos' },
];
const TIPOS_CORRIENTE = [
  { value: 'AC', label: 'AC' },
  { value: 'DC', label: 'DC' },
];
const FASES_LABELS = Object.fromEntries(FASES.map((f) => [f.value, f.label]));
const CONECTORES_LABELS = Object.fromEntries(CONECTORES.map((c) => [c.value, c.label]));
const MONTAJES_LABELS = Object.fromEntries(MONTAJES.map((m) => [m.value, m.label]));
const OCPP_PROTOCOLOS_LABELS = Object.fromEntries(OCPP_PROTOCOLOS.map((o) => [o.value, o.label]));

export default function StockPage() {
  const session = getSession();
  const isSuperadmin = session?.rol === 'superadmin';
  const navItems = isSuperadmin ? SUPERADMIN_NAV : INSTALADOR_NAV;

  const [productos, setProductos] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [productoOpen, setProductoOpen] = useState(false);
  const [productoForm, setProductoForm] = useState(EMPTY_PRODUCTO_FORM);

  const [ingresoOpen, setIngresoOpen] = useState(null); // producto row, or null
  const [ingresoForm, setIngresoForm] = useState({ identificadores: '', costo_compra: '', proveedor_id: '' });

  const [movOpen, setMovOpen] = useState(null); // producto row, or null
  const [movForm, setMovForm] = useState({
    tipo: 'ingreso', cantidad: '', costo_unitario: '', nota: '', proveedor_id: '',
  });

  const [itemsOpen, setItemsOpen] = useState(null); // producto row, or null
  const [items, setItems] = useState([]);
  const [saving, setSaving] = useState(false);

  async function loadAll() {
    const [p, pv] = await Promise.all([
      api.get('/admin/productos-catalogo'),
      api.get('/admin/proveedores'),
    ]);
    setProductos(p.data);
    setProveedores(pv.data);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAll();
  }, []);

  async function handleCreateProducto(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/admin/productos-catalogo', {
        ...productoForm,
        potencia_kw: productoForm.potencia_kw === '' ? null : Number(productoForm.potencia_kw),
        fases: productoForm.fases || null,
        conector: productoForm.conector || null,
        montaje: productoForm.montaje || null,
        ocpp_protocolo: productoForm.ocpp_protocolo || null,
        tipo_corriente: productoForm.tipo_corriente || null,
      });
      setProductoOpen(false);
      setProductoForm(EMPTY_PRODUCTO_FORM);
      toast.success(`Producto "${productoForm.modelo}" creado.`);
      loadAll();
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo crear el producto.');
    } finally {
      setSaving(false);
    }
  }

  async function handleIngreso(e) {
    e.preventDefault();
    const identificadores = ingresoForm.identificadores
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    setSaving(true);
    try {
      const { data } = await api.post('/admin/stock-items', {
        producto_id: ingresoOpen.id,
        identificadores,
        costo_compra: ingresoForm.costo_compra === '' ? null : Number(ingresoForm.costo_compra),
        proveedor_id: ingresoForm.proveedor_id ? Number(ingresoForm.proveedor_id) : null,
      });
      if (data.errores?.length > 0) {
        toast.error(`${data.creados.length} ingresados. Con error: ${data.errores.map((e2) => e2.identificador).join(', ')}`);
      } else {
        toast.success(`${data.creados.length} unidad(es) ingresadas al stock.`);
      }
      setIngresoOpen(null);
      setIngresoForm({ identificadores: '', costo_compra: '', proveedor_id: '' });
      loadAll();
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo ingresar el stock.');
    } finally {
      setSaving(false);
    }
  }

  async function handleMovimiento(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/admin/stock-movimientos', {
        producto_id: movOpen.id,
        tipo: movForm.tipo,
        cantidad: Number(movForm.cantidad),
        costo_unitario: movForm.costo_unitario === '' ? null : Number(movForm.costo_unitario),
        nota: movForm.nota || null,
        proveedor_id: movForm.proveedor_id ? Number(movForm.proveedor_id) : null,
      });
      setMovOpen(null);
      setMovForm({
        tipo: 'ingreso', cantidad: '', costo_unitario: '', nota: '', proveedor_id: '',
      });
      toast.success('Movimiento registrado.');
      loadAll();
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo registrar el movimiento.');
    } finally {
      setSaving(false);
    }
  }

  async function openItems(producto) {
    setItemsOpen(producto);
    const { data } = await api.get('/admin/stock-items', { params: { producto_id: producto.id } });
    setItems(data);
  }

  return (
    <AdminLayout title="Stock" navItems={navItems}>
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2"><Package className="h-4 w-4" />Catalogo de productos</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Wallbox/medidor/router se ingresan con serie individual. Consumibles (cables, conectores) solo por cantidad.
            </p>
          </div>
          {isSuperadmin && (
          <Dialog open={productoOpen} onOpenChange={setProductoOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4" />Nuevo producto</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Nuevo producto</DialogTitle></DialogHeader>
              <form onSubmit={handleCreateProducto} className="flex flex-col gap-3">
                <div>
                  <Label htmlFor="pCategoria">Categoria</Label>
                  <select
                    id="pCategoria"
                    value={productoForm.categoria}
                    onChange={(e) => setProductoForm({ ...productoForm, categoria: e.target.value })}
                    className={SELECT_CLASS}
                  >
                    {CATEGORIAS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <Label htmlFor="pMarca">Marca</Label>
                  <Input id="pMarca" value={productoForm.marca} onChange={(e) => setProductoForm({ ...productoForm, marca: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="pModelo">Modelo</Label>
                  <Input id="pModelo" required value={productoForm.modelo} onChange={(e) => setProductoForm({ ...productoForm, modelo: e.target.value })} placeholder="Ej: ASCAER10" />
                </div>
                {productoForm.categoria === 'wallbox' && (
                  <>
                    <div>
                      <Label htmlFor="pPotencia">Potencia (kW)</Label>
                      <Input
                        id="pPotencia"
                        type="number"
                        step="0.1"
                        min="0"
                        value={productoForm.potencia_kw}
                        onChange={(e) => setProductoForm({ ...productoForm, potencia_kw: e.target.value })}
                        placeholder="Ej: 7.4"
                      />
                    </div>
                    <div>
                      <Label htmlFor="pFases">Fases</Label>
                      <select
                        id="pFases"
                        value={productoForm.fases}
                        onChange={(e) => setProductoForm({ ...productoForm, fases: e.target.value })}
                        className={SELECT_CLASS}
                      >
                        <option value="">Sin especificar</option>
                        {FASES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="pConector">Conector</Label>
                      <select
                        id="pConector"
                        value={productoForm.conector}
                        onChange={(e) => setProductoForm({ ...productoForm, conector: e.target.value })}
                        className={SELECT_CLASS}
                      >
                        <option value="">Sin especificar</option>
                        {CONECTORES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="pMontaje">Montaje</Label>
                      <select
                        id="pMontaje"
                        value={productoForm.montaje}
                        onChange={(e) => setProductoForm({ ...productoForm, montaje: e.target.value })}
                        className={SELECT_CLASS}
                      >
                        <option value="">Sin especificar</option>
                        {MONTAJES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="pOcppProtocolo">Protocolo OCPP</Label>
                      <select
                        id="pOcppProtocolo"
                        value={productoForm.ocpp_protocolo}
                        onChange={(e) => setProductoForm({ ...productoForm, ocpp_protocolo: e.target.value })}
                        className={SELECT_CLASS}
                      >
                        <option value="">Sin especificar</option>
                        {OCPP_PROTOCOLOS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="pTipoCorriente">Tipo de corriente</Label>
                      <select
                        id="pTipoCorriente"
                        value={productoForm.tipo_corriente}
                        onChange={(e) => setProductoForm({ ...productoForm, tipo_corriente: e.target.value })}
                        className={SELECT_CLASS}
                      >
                        <option value="">Sin especificar</option>
                        {TIPOS_CORRIENTE.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                  </>
                )}
                <div>
                  <Label htmlFor="pDescripcion">Descripcion</Label>
                  <textarea
                    id="pDescripcion"
                    rows={3}
                    value={productoForm.descripcion}
                    onChange={(e) => setProductoForm({ ...productoForm, descripcion: e.target.value })}
                    className={TEXTAREA_CLASS}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    id="pSerializado"
                    type="checkbox"
                    checked={productoForm.serializado}
                    onChange={(e) => setProductoForm({ ...productoForm, serializado: e.target.checked })}
                    className="h-4 w-4"
                  />
                  <Label htmlFor="pSerializado" className="!mb-0">Lleva numero de serie individual (wallbox/medidor/router)</Label>
                </div>
                {!productoForm.serializado && (
                  <div>
                    <Label htmlFor="pUnidad">Unidad</Label>
                    <Input id="pUnidad" value={productoForm.unidad} onChange={(e) => setProductoForm({ ...productoForm, unidad: e.target.value })} placeholder="metro, unidad, caja..." />
                  </div>
                )}
                <Button type="submit" className="mt-2" loading={saving}>Crear producto</Button>
              </form>
            </DialogContent>
          </Dialog>
          )}
        </CardHeader>
        <CardContent>
          {productos.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay productos cargados todavia.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Marca / Modelo</TableHead>
                  <TableHead className="text-right">Disponible</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {productos.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell><Badge variant="muted">{CATEGORIAS.find((c) => c.value === p.categoria)?.label ?? p.categoria}</Badge></TableCell>
                    <TableCell className="font-medium">
                      {p.marca} {p.modelo}
                      {p.categoria === 'wallbox' && (p.potencia_kw || p.fases || p.conector || p.montaje) && (
                        <p className="mt-0.5 text-xs font-normal text-muted-foreground">
                          {[
                            p.potencia_kw ? `${p.potencia_kw}kW` : null,
                            p.tipo_corriente ?? null,
                            FASES_LABELS[p.fases] ?? null,
                            CONECTORES_LABELS[p.conector] ?? null,
                            MONTAJES_LABELS[p.montaje] ?? null,
                            OCPP_PROTOCOLOS_LABELS[p.ocpp_protocolo] ?? null,
                          ].filter(Boolean).join(' / ')}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums text-right">{Number(p.stock_disponible)} {p.serializado ? 'un.' : p.unidad}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {p.serializado ? (
                          <>
                            {isSuperadmin && <Button size="sm" variant="outline" onClick={() => setIngresoOpen(p)}>Ingresar</Button>}
                            <Button size="sm" variant="outline" onClick={() => openItems(p)}>Ver unidades</Button>
                          </>
                        ) : (
                          isSuperadmin && <Button size="sm" variant="outline" onClick={() => setMovOpen(p)}>Movimiento</Button>
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

      <Dialog open={ingresoOpen != null} onOpenChange={(o) => !o && setIngresoOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ingresar unidades - {ingresoOpen?.marca} {ingresoOpen?.modelo}</DialogTitle>
            <DialogDescription>Un identificador (numero de serie / ID) por linea.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleIngreso} className="flex flex-col gap-3">
            <div>
              <Label htmlFor="ingIds">Identificadores</Label>
              <textarea
                id="ingIds"
                required
                rows={6}
                value={ingresoForm.identificadores}
                onChange={(e) => setIngresoForm({ ...ingresoForm, identificadores: e.target.value })}
                placeholder={'WB-0001\nWB-0002\nWB-0003'}
                className={`${TEXTAREA_CLASS} font-mono text-xs`}
              />
            </div>
            <div>
              <Label htmlFor="ingCosto">Costo de compra por unidad (opcional)</Label>
              <Input id="ingCosto" type="number" step="0.01" min="0" value={ingresoForm.costo_compra} onChange={(e) => setIngresoForm({ ...ingresoForm, costo_compra: e.target.value })} />
            </div>
            <ProveedorPicker
              proveedores={proveedores}
              value={ingresoForm.proveedor_id}
              onChange={(v) => setIngresoForm({ ...ingresoForm, proveedor_id: v })}
              onProveedorCreado={(p) => { setProveedores([...proveedores, p]); setIngresoForm({ ...ingresoForm, proveedor_id: String(p.id) }); }}
            />
            <Button type="submit" className="mt-2" loading={saving}>Ingresar al stock</Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={movOpen != null} onOpenChange={(o) => !o && setMovOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Movimiento de stock - {movOpen?.marca} {movOpen?.modelo}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleMovimiento} className="flex flex-col gap-3">
            <div>
              <Label htmlFor="movTipo">Tipo</Label>
              <select
                id="movTipo"
                value={movForm.tipo}
                onChange={(e) => setMovForm({ ...movForm, tipo: e.target.value })}
                className={SELECT_CLASS}
              >
                <option value="ingreso">Ingreso (compra)</option>
                <option value="ajuste">Ajuste</option>
                <option value="devolucion">Devolucion</option>
              </select>
            </div>
            <div>
              <Label htmlFor="movCantidad">Cantidad</Label>
              <Input id="movCantidad" type="number" step="0.01" required value={movForm.cantidad} onChange={(e) => setMovForm({ ...movForm, cantidad: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="movCosto">Costo unitario (opcional)</Label>
              <Input id="movCosto" type="number" step="0.01" min="0" value={movForm.costo_unitario} onChange={(e) => setMovForm({ ...movForm, costo_unitario: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="movNota">Nota</Label>
              <Input id="movNota" value={movForm.nota} onChange={(e) => setMovForm({ ...movForm, nota: e.target.value })} />
            </div>
            {movForm.tipo === 'ingreso' && (
              <ProveedorPicker
                proveedores={proveedores}
                value={movForm.proveedor_id}
                onChange={(v) => setMovForm({ ...movForm, proveedor_id: v })}
                onProveedorCreado={(p) => { setProveedores([...proveedores, p]); setMovForm({ ...movForm, proveedor_id: String(p.id) }); }}
              />
            )}
            <Button type="submit" className="mt-2" loading={saving}>Registrar movimiento</Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={itemsOpen != null} onOpenChange={(o) => !o && setItemsOpen(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Unidades - {itemsOpen?.marca} {itemsOpen?.modelo}</DialogTitle>
          </DialogHeader>
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin unidades cargadas.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Identificador</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Costo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((it) => (
                  <TableRow key={it.id}>
                    <TableCell className="font-mono text-xs">{it.identificador}</TableCell>
                    <TableCell><Badge variant={it.estado === 'en_stock' ? 'accent' : 'muted'}>{it.estado}</Badge></TableCell>
                    <TableCell className="tabular-nums text-right">{it.costo_compra ? `$${Number(it.costo_compra).toFixed(2)}` : '-'}</TableCell>
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
