import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus, Pencil, Search, Upload, Sparkles,
} from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import AdminLayout from '@/components/AdminLayout';
import {
  Card, CardHeader, CardTitle, CardContent,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
  Button, Input, Label,
  Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui';
import { SUPERADMIN_NAV } from '../superadmin/navConfig';

const money = (n) => `$${Number(n ?? 0).toFixed(2)}`;
const EMPTY_FORM = {
  nombre: '', unidad: 'unidad', precio_unitario: '', costo: '', categoria: '', proveedor: '',
};

const RUBROS = [
  { value: '', label: 'Todos los rubros' },
  { value: 'electricidad', label: 'Electricidad' },
  { value: 'redes', label: 'Redes' },
  { value: 'mano_obra', label: 'Mano de obra' },
  { value: 'otros', label: 'Otros' },
];

// La categoria libre del item (Tableros, Cableado, Red Ethernet...) se
// agrupa en rubros gruesos para el filtro - sin tocar el dato guardado.
function categoriaARubro(categoria) {
  const c = (categoria || '').toLowerCase();
  if (/mano de obra|instalacion/.test(c)) return 'mano_obra';
  if (/red ethernet|ethernet|comunicaciones/.test(c)) return 'redes';
  if (/cable|tablero|proteccion|acometida|medici|termica/.test(c)) return 'electricidad';
  return 'otros';
}

export default function Catalogo() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [rubroFiltro, setRubroFiltro] = useState('');

  const importFileRef = useRef(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importCandidatos, setImportCandidatos] = useState(null);
  const [importSaving, setImportSaving] = useState(false);

  const itemsFiltrados = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      if (rubroFiltro && categoriaARubro(i.categoria) !== rubroFiltro) return false;
      if (q && !i.nombre.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, search, rubroFiltro]);

  async function load() {
    setLoading(true);
    const { data } = await api.get('/comercial/catalogo-items');
    setItems(data);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  function abrirNuevo() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setOpen(true);
  }

  function abrirEditar(item) {
    setEditingId(item.id);
    setForm({
      nombre: item.nombre,
      unidad: item.unidad || 'unidad',
      precio_unitario: item.precio_unitario ?? '',
      costo: item.costo ?? '',
      categoria: item.categoria || '',
      proveedor: item.proveedor || '',
    });
    setOpen(true);
  }

  async function handleGuardar(e) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      ...form,
      precio_unitario: Number(form.precio_unitario),
      costo: form.costo === '' ? null : Number(form.costo),
    };
    try {
      if (editingId) {
        await api.put(`/comercial/catalogo-items/${editingId}`, payload);
        toast.success('Item actualizado.');
      } else {
        await api.post('/comercial/catalogo-items', payload);
        toast.success('Item agregado al catalogo.');
      }
      setOpen(false);
      setForm(EMPTY_FORM);
      setEditingId(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo guardar el item.');
    } finally {
      setSaving(false);
    }
  }

  async function handleImportarPreview(file) {
    if (!file) return;
    setImportLoading(true);
    setImportCandidatos(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await api.post('/comercial/catalogo-items/importar-preview', formData);
      setImportCandidatos(data.map((c) => ({ ...c, incluir: true })));
      if (data.length === 0) toast.error('No se reconocio ningun item del catalogo en ese archivo.');
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo analizar el archivo.');
    } finally {
      setImportLoading(false);
    }
  }

  function updateCandidato(idx, patch) {
    setImportCandidatos((prev) => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  }

  async function handleImportarConfirmar() {
    const seleccionados = importCandidatos.filter((c) => c.incluir);
    if (seleccionados.length === 0) {
      toast.error('Selecciona al menos un item.');
      return;
    }
    setImportSaving(true);
    try {
      const { data } = await api.post('/comercial/catalogo-items/importar-confirmar', {
        items: seleccionados.map((c) => ({
          catalogo_item_id: c.catalogo_item_id, precio_nuevo: c.precio_nuevo, proveedor: c.proveedor,
        })),
      });
      toast.success(`${data.actualizados} precio(s) actualizado(s).`);
      setImportOpen(false);
      setImportCandidatos(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo actualizar los precios.');
    } finally {
      setImportSaving(false);
    }
  }

  return (
    <AdminLayout title="Catalogo de items" navItems={SUPERADMIN_NAV}>
      <Card>
        <CardHeader className="flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <CardTitle>Materiales y servicios reutilizables</CardTitle>
          <div className="flex flex-col flex-wrap items-stretch gap-2 sm:flex-row sm:items-center">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar producto..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 sm:w-56"
              />
            </div>
            <select
              className="flex h-10 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-48"
              value={rubroFiltro}
              onChange={(e) => setRubroFiltro(e.target.value)}
            >
              {RUBROS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={importFileRef}
              type="file"
              accept=".xlsx,.xls,.csv,.pdf,.txt,image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) { setImportOpen(true); handleImportarPreview(file); }
              }}
            />
            <Button size="sm" variant="outline" onClick={() => importFileRef.current?.click()}>
              <Upload className="h-4 w-4" />Subir lista de precios
            </Button>
            <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setForm(EMPTY_FORM); setEditingId(null); } }}>
              <DialogTrigger asChild>
                <Button size="sm" onClick={abrirNuevo}><Plus className="h-4 w-4" />Nuevo item</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingId ? 'Editar item de catalogo' : 'Nuevo item de catalogo'}</DialogTitle>
                  <DialogDescription>Se usa para armar presupuestos rapido, multiplicando cantidad x precio.</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleGuardar} className="flex flex-col gap-3">
                  <div>
                    <Label htmlFor="iNombre">Nombre</Label>
                    <Input id="iNombre" required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="iUnidad">Unidad</Label>
                      <Input id="iUnidad" placeholder="unidad / metro / servicio" value={form.unidad} onChange={(e) => setForm({ ...form, unidad: e.target.value })} />
                    </div>
                    <div>
                      <Label htmlFor="iPrecio">Precio unitario (venta)</Label>
                      <Input id="iPrecio" type="number" step="0.01" min="0" required value={form.precio_unitario} onChange={(e) => setForm({ ...form, precio_unitario: e.target.value })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="iCosto">Costo (opcional)</Label>
                      <Input id="iCosto" type="number" step="0.01" min="0" value={form.costo} onChange={(e) => setForm({ ...form, costo: e.target.value })} />
                    </div>
                    <div>
                      <Label htmlFor="iCategoria">Categoria</Label>
                      <Input id="iCategoria" placeholder="Tableros / Protecciones / Cableado..." value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="iProveedor">Proveedor (opcional)</Label>
                    <Input id="iProveedor" placeholder="Ej: Diloc, Baw, Tra-Color..." value={form.proveedor} onChange={(e) => setForm({ ...form, proveedor: e.target.value })} />
                  </div>
                  <Button type="submit" className="mt-2" loading={saving}>{editingId ? 'Guardar cambios' : 'Agregar'}</Button>
                </form>
              </DialogContent>
            </Dialog>

            <Dialog open={importOpen} onOpenChange={(o) => { setImportOpen(o); if (!o) setImportCandidatos(null); }}>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4" />Actualizar precios desde lista de proveedor</DialogTitle>
                  <DialogDescription>
                    Excel, CSV, PDF o imagen - la IA compara contra el catalogo actual y detecta que items reconoce, con su precio nuevo y proveedor.
                  </DialogDescription>
                </DialogHeader>

                {importLoading && <p className="text-sm text-muted-foreground">Analizando archivo...</p>}

                {importCandidatos && (
                  <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
                    {importCandidatos.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No se reconocio ningun item del catalogo en ese archivo.</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead />
                            <TableHead>Item del catalogo</TableHead>
                            <TableHead className="text-right">Precio actual</TableHead>
                            <TableHead className="text-right">Precio nuevo</TableHead>
                            <TableHead>Proveedor</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {importCandidatos.map((c, i) => (
                            <TableRow key={i}>
                              <TableCell>
                                <input type="checkbox" checked={c.incluir} onChange={(e) => updateCandidato(i, { incluir: e.target.checked })} />
                              </TableCell>
                              <TableCell className="text-sm">{c.nombre}</TableCell>
                              <TableCell className="tabular-nums text-right text-xs text-muted-foreground">{money(c.precio_actual)}</TableCell>
                              <TableCell className="text-right">
                                <Input
                                  className={`h-8 w-28 text-right ${Number(c.precio_nuevo) !== Number(c.precio_actual) ? 'font-semibold text-emerald-700' : ''}`}
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={c.precio_nuevo}
                                  onChange={(e) => updateCandidato(i, { precio_nuevo: e.target.value })}
                                />
                              </TableCell>
                              <TableCell>
                                <Input className="h-8 w-32" value={c.proveedor || ''} onChange={(e) => updateCandidato(i, { proveedor: e.target.value })} placeholder="Proveedor" />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                    {importCandidatos.length > 0 && (
                      <Button loading={importSaving} onClick={handleImportarConfirmar} className="self-end">
                        Actualizar {importCandidatos.filter((c) => c.incluir).length} precio(s)
                      </Button>
                    )}
                  </div>
                )}
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Cargando...</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin items todavia.</p>
          ) : itemsFiltrados.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ningun item coincide con la busqueda/filtro.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead className="hidden sm:table-cell">Categoria</TableHead>
                  <TableHead className="hidden sm:table-cell">Unidad</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Costo</TableHead>
                  <TableHead className="text-right">Precio unitario</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {itemsFiltrados.map((i) => (
                  <TableRow key={i.id} className="cursor-pointer" onClick={() => abrirEditar(i)}>
                    <TableCell>
                      {i.nombre}
                      {i.proveedor && <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{i.proveedor}</span>}
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground sm:table-cell">{i.categoria || '-'}</TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground sm:table-cell">{i.unidad}</TableCell>
                    <TableCell className="hidden tabular-nums text-right text-muted-foreground md:table-cell">{i.costo != null ? money(i.costo) : '-'}</TableCell>
                    <TableCell className="tabular-nums text-right">{money(i.precio_unitario)}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => abrirEditar(i)}>
                          <Pencil className="h-3.5 w-3.5" />
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
    </AdminLayout>
  );
}
