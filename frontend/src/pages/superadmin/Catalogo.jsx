import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Percent } from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import AdminLayout from '@/components/AdminLayout';
import {
  Card, CardHeader, CardTitle, CardContent,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
  Badge, Button, Input, Label,
  Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui';
import { SUPERADMIN_NAV } from './navConfig';

const TIPOS_ABONO_ITEM = [
  { value: 'fijo_por_edificio', label: 'Fijo por edificio' },
  { value: 'fijo_por_cochera', label: 'Fijo por cochera' },
  { value: 'prorrateado_activos', label: 'Prorrateado entre activos' },
  { value: 'unico', label: 'Unico (no recurrente)' },
];
const EMPTY_CATALOGO_FORM = {
  nombre: '', tipo: 'fijo_por_cochera', monto_sugerido: '', tipo_cliente: '',
};
const SELECT_CLASS = 'flex h-10 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export default function Catalogo() {
  const [catalogo, setCatalogo] = useState([]);
  const [consorcios, setConsorcios] = useState([]);
  const [catalogoOpen, setCatalogoOpen] = useState(false);
  const [catalogoForm, setCatalogoForm] = useState(EMPTY_CATALOGO_FORM);
  const [editCatalogo, setEditCatalogo] = useState(null);
  const [editCatalogoForm, setEditCatalogoForm] = useState(EMPTY_CATALOGO_FORM);
  const [ajusteOpen, setAjusteOpen] = useState(false);
  const [ajusteForm, setAjusteForm] = useState({ alcance: 'catalogo', porcentaje: '', consorcio_id: '' });
  const [saving, setSaving] = useState(false);

  async function loadAll() {
    const [cat, c] = await Promise.all([
      api.get('/admin/abono-items-catalogo'),
      api.get('/superadmin/consorcios'),
    ]);
    setCatalogo(cat.data);
    setConsorcios(c.data);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAll();
  }, []);

  async function handleCreateCatalogo(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/admin/abono-items-catalogo', {
        nombre: catalogoForm.nombre,
        tipo: catalogoForm.tipo,
        monto_sugerido: Number(catalogoForm.monto_sugerido),
        tipo_cliente: catalogoForm.tipo_cliente || null,
      });
      setCatalogoOpen(false);
      setCatalogoForm(EMPTY_CATALOGO_FORM);
      toast.success('Plantilla creada.');
      loadAll();
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo crear la plantilla.');
    } finally {
      setSaving(false);
    }
  }

  function openEditCatalogo(item) {
    setEditCatalogo(item);
    setEditCatalogoForm({
      nombre: item.nombre, tipo: item.tipo, monto_sugerido: item.monto_sugerido, tipo_cliente: item.tipo_cliente ?? '',
    });
  }

  async function handleEditCatalogo(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put(`/admin/abono-items-catalogo/${editCatalogo.id}`, {
        nombre: editCatalogoForm.nombre,
        tipo: editCatalogoForm.tipo,
        monto_sugerido: Number(editCatalogoForm.monto_sugerido),
        tipo_cliente: editCatalogoForm.tipo_cliente || null,
      });
      setEditCatalogo(null);
      toast.success('Plantilla actualizada.');
      loadAll();
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo actualizar la plantilla.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteCatalogo(catalogoId) {
    if (!confirm('Borrar esta plantilla del catalogo? No afecta los abonos ya clonados en edificios.')) return;
    await api.delete(`/admin/abono-items-catalogo/${catalogoId}`);
    toast.success('Plantilla borrada.');
    loadAll();
  }

  async function handleAjusteMasivo(e) {
    e.preventDefault();
    const porcentaje = Number(ajusteForm.porcentaje);
    if (!porcentaje) return;
    const alcanceLabel = ajusteForm.alcance === 'catalogo'
      ? 'el catalogo de plantillas'
      : ajusteForm.consorcio_id
        ? 'el edificio seleccionado'
        : 'TODOS los edificios';
    if (!confirm(`Aplicar ${porcentaje}% a ${alcanceLabel}? Esta accion no se puede deshacer.`)) return;

    setSaving(true);
    try {
      const { data } = ajusteForm.alcance === 'catalogo'
        ? await api.post('/admin/abono-items-catalogo/ajuste-masivo', { porcentaje })
        : await api.post('/admin/abono-items/ajuste-masivo', {
          porcentaje,
          consorcio_id: ajusteForm.consorcio_id ? Number(ajusteForm.consorcio_id) : null,
        });
      toast.success(`${data.actualizados} item(s) actualizados.`);
      setAjusteOpen(false);
      setAjusteForm({ alcance: 'catalogo', porcentaje: '', consorcio_id: '' });
      loadAll();
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo aplicar el ajuste.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminLayout title="Catalogo de abonos" navItems={SUPERADMIN_NAV}>
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Valores predeterminados</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Plantillas que se clonan al configurar un edificio nuevo. Editar precios aca no cambia lo ya clonado en edificios existentes.
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setAjusteOpen(true)}><Percent className="h-4 w-4" />Ajuste masivo %</Button>
            <Dialog open={catalogoOpen} onOpenChange={setCatalogoOpen}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="h-4 w-4" />Nueva plantilla</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Nueva plantilla de abono</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreateCatalogo} className="flex flex-col gap-3">
                  <div>
                    <Label htmlFor="catNombre">Nombre</Label>
                    <Input id="catNombre" required value={catalogoForm.nombre} onChange={(e) => setCatalogoForm({ ...catalogoForm, nombre: e.target.value })} placeholder="Ej: Canon por wallbox" />
                  </div>
                  <div>
                    <Label htmlFor="catTipo">Tipo</Label>
                    <select
                      id="catTipo"
                      value={catalogoForm.tipo}
                      onChange={(e) => setCatalogoForm({ ...catalogoForm, tipo: e.target.value })}
                      className={SELECT_CLASS}
                    >
                      {TIPOS_ABONO_ITEM.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="catMonto">Monto sugerido</Label>
                    <Input id="catMonto" type="number" step="0.01" min="0" required value={catalogoForm.monto_sugerido} onChange={(e) => setCatalogoForm({ ...catalogoForm, monto_sugerido: e.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="catTipoCliente">Aplica a</Label>
                    <select
                      id="catTipoCliente"
                      value={catalogoForm.tipo_cliente}
                      onChange={(e) => setCatalogoForm({ ...catalogoForm, tipo_cliente: e.target.value })}
                      className={SELECT_CLASS}
                    >
                      <option value="">Ambos (residencial y comercial)</option>
                      <option value="residencial">Solo residencial</option>
                      <option value="comercial">Solo comercial</option>
                    </select>
                  </div>
                  <Button type="submit" className="mt-2" loading={saving}>Crear plantilla</Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {catalogo.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay plantillas cargadas todavia.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Aplica a</TableHead>
                  <TableHead className="text-right">Monto sugerido</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {catalogo.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.nombre}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{TIPOS_ABONO_ITEM.find((t) => t.value === item.tipo)?.label ?? item.tipo}</TableCell>
                    <TableCell><Badge variant="muted">{item.tipo_cliente ?? 'ambos'}</Badge></TableCell>
                    <TableCell className="tabular-nums text-right">${Number(item.monto_sugerido).toFixed(2)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="outline" onClick={() => openEditCatalogo(item)} title="Editar">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="destructive" aria-label={`Borrar plantilla ${item.nombre}`} onClick={() => handleDeleteCatalogo(item.id)}>
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

      <Dialog open={editCatalogo != null} onOpenChange={(o) => !o && setEditCatalogo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar plantilla</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditCatalogo} className="flex flex-col gap-3">
            <div>
              <Label htmlFor="editCatNombre">Nombre</Label>
              <Input id="editCatNombre" value={editCatalogoForm.nombre} onChange={(e) => setEditCatalogoForm({ ...editCatalogoForm, nombre: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="editCatTipo">Tipo</Label>
              <select
                id="editCatTipo"
                value={editCatalogoForm.tipo}
                onChange={(e) => setEditCatalogoForm({ ...editCatalogoForm, tipo: e.target.value })}
                className={SELECT_CLASS}
              >
                {TIPOS_ABONO_ITEM.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <Label htmlFor="editCatMonto">Monto sugerido</Label>
              <Input id="editCatMonto" type="number" step="0.01" min="0" value={editCatalogoForm.monto_sugerido} onChange={(e) => setEditCatalogoForm({ ...editCatalogoForm, monto_sugerido: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="editCatTipoCliente">Aplica a</Label>
              <select
                id="editCatTipoCliente"
                value={editCatalogoForm.tipo_cliente}
                onChange={(e) => setEditCatalogoForm({ ...editCatalogoForm, tipo_cliente: e.target.value })}
                className={SELECT_CLASS}
              >
                <option value="">Ambos (residencial y comercial)</option>
                <option value="residencial">Solo residencial</option>
                <option value="comercial">Solo comercial</option>
              </select>
            </div>
            <Button type="submit" className="mt-2" loading={saving}>Guardar cambios</Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={ajusteOpen} onOpenChange={setAjusteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajuste masivo por porcentaje</DialogTitle>
            <DialogDescription>Accion manual - la disparas vos cuando haces el cierre de mes. No hay forma de deshacerla automaticamente.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAjusteMasivo} className="flex flex-col gap-3">
            <div>
              <Label htmlFor="ajusteAlcance">Alcance</Label>
              <select
                id="ajusteAlcance"
                value={ajusteForm.alcance}
                onChange={(e) => setAjusteForm({ ...ajusteForm, alcance: e.target.value })}
                className={SELECT_CLASS}
              >
                <option value="catalogo">Catalogo de plantillas</option>
                <option value="edificios">Locaciones (abonos ya configurados)</option>
              </select>
            </div>
            {ajusteForm.alcance === 'edificios' && (
              <div>
                <Label htmlFor="ajusteConsorcio">Instalacion (vacio = TODOS)</Label>
                <select
                  id="ajusteConsorcio"
                  value={ajusteForm.consorcio_id}
                  onChange={(e) => setAjusteForm({ ...ajusteForm, consorcio_id: e.target.value })}
                  className={SELECT_CLASS}
                >
                  <option value="">Todos los edificios</option>
                  {consorcios.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
            )}
            <div>
              <Label htmlFor="ajustePorcentaje">Porcentaje (ej: 10 o -5)</Label>
              <Input
                id="ajustePorcentaje"
                type="number"
                step="0.01"
                required
                value={ajusteForm.porcentaje}
                onChange={(e) => setAjusteForm({ ...ajusteForm, porcentaje: e.target.value })}
              />
            </div>
            <Button type="submit" className="mt-2" loading={saving}>Aplicar ajuste</Button>
          </form>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
