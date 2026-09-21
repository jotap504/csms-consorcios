import { useEffect, useState } from 'react';
import { Plus, Eye, Handshake } from 'lucide-react';
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

const SELECT_CLASS = 'flex h-10 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

const EMPTY_PROVEEDOR_FORM = {
  nombre_empresa: '', cuit: '', contacto_nombre: '', contacto_email: '', contacto_telefono: '', direccion: '', nota: '',
};

// Selector de proveedor reutilizado donde haga falta elegir uno (Stock,
// Contabilidad): al elegir muestra sus datos de contacto para confirmar que
// es el correcto, y tiene un "+" para dar de alta uno nuevo sin salir del
// dialog en el que estas.
export function ProveedorPicker({
  proveedores, value, onChange, onProveedorCreado, label = 'Proveedor',
}) {
  const [nuevoOpen, setNuevoOpen] = useState(false);
  const [nuevoForm, setNuevoForm] = useState(EMPTY_PROVEEDOR_FORM);
  const [saving, setSaving] = useState(false);
  const seleccionado = proveedores.find((p) => String(p.id) === String(value));

  async function handleCrear(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.post('/admin/proveedores', nuevoForm);
      setNuevoOpen(false);
      setNuevoForm(EMPTY_PROVEEDOR_FORM);
      toast.success('Proveedor creado.');
      onProveedorCreado(data);
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo crear el proveedor.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <Label htmlFor="pvProveedor">{label}</Label>
      <div className="flex gap-2">
        <select id="pvProveedor" value={value} onChange={(e) => onChange(e.target.value)} className={SELECT_CLASS}>
          <option value="">Sin especificar</option>
          {proveedores.filter((p) => p.activo).map((p) => <option key={p.id} value={p.id}>{p.nombre_empresa}</option>)}
        </select>
        <Dialog open={nuevoOpen} onOpenChange={setNuevoOpen}>
          <DialogTrigger asChild>
            <Button type="button" size="sm" variant="outline" title="Nuevo proveedor"><Plus className="h-4 w-4" /></Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nuevo proveedor</DialogTitle></DialogHeader>
            <ProveedorForm form={nuevoForm} setForm={setNuevoForm} onSubmit={handleCrear} saving={saving} submitLabel="Crear proveedor" />
          </DialogContent>
        </Dialog>
      </div>
      {seleccionado && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          {[seleccionado.contacto_nombre, seleccionado.contacto_email, seleccionado.contacto_telefono].filter(Boolean).join(' · ') || 'Sin datos de contacto cargados.'}
        </p>
      )}
    </div>
  );
}

export default function Proveedores() {
  const [proveedores, setProveedores] = useState([]);
  const [proveedorOpen, setProveedorOpen] = useState(false);
  const [proveedorForm, setProveedorForm] = useState(EMPTY_PROVEEDOR_FORM);
  const [editProveedor, setEditProveedor] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_PROVEEDOR_FORM);
  const [detalle, setDetalle] = useState(null); // proveedor row, or null
  const [compras, setCompras] = useState([]);
  const [saving, setSaving] = useState(false);

  async function loadAll() {
    const { data } = await api.get('/admin/proveedores');
    setProveedores(data);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAll();
  }, []);

  async function handleCreateProveedor(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/admin/proveedores', proveedorForm);
      setProveedorOpen(false);
      setProveedorForm(EMPTY_PROVEEDOR_FORM);
      toast.success('Proveedor creado.');
      loadAll();
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo crear el proveedor.');
    } finally {
      setSaving(false);
    }
  }

  function openEdit(p) {
    setEditProveedor(p);
    setEditForm({
      nombre_empresa: p.nombre_empresa ?? '',
      cuit: p.cuit ?? '',
      contacto_nombre: p.contacto_nombre ?? '',
      contacto_email: p.contacto_email ?? '',
      contacto_telefono: p.contacto_telefono ?? '',
      direccion: p.direccion ?? '',
      nota: p.nota ?? '',
    });
  }

  async function handleEditProveedor(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put(`/admin/proveedores/${editProveedor.id}`, editForm);
      setEditProveedor(null);
      toast.success('Proveedor actualizado.');
      loadAll();
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo actualizar.');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActivo(p) {
    await api.put(`/admin/proveedores/${p.id}`, { activo: !p.activo });
    loadAll();
  }

  async function openDetalle(p) {
    setDetalle(p);
    const { data } = await api.get(`/admin/proveedores/${p.id}/compras`);
    setCompras(data);
  }

  return (
    <AdminLayout title="Proveedores" navItems={SUPERADMIN_NAV}>
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2"><Handshake className="h-4 w-4" />Proveedores</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Empresas a las que Bilon les compra material.</p>
          </div>
          <Dialog open={proveedorOpen} onOpenChange={(o) => { setProveedorOpen(o); if (!o) setProveedorForm(EMPTY_PROVEEDOR_FORM); }}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4" />Nuevo proveedor</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Nuevo proveedor</DialogTitle></DialogHeader>
              <ProveedorForm form={proveedorForm} setForm={setProveedorForm} onSubmit={handleCreateProveedor} saving={saving} submitLabel="Crear proveedor" />
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {proveedores.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay proveedores cargados todavia.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Contacto</TableHead>
                  <TableHead>Telefono</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {proveedores.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.nombre_empresa}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{p.contacto_nombre || '-'}{p.contacto_email ? ` · ${p.contacto_email}` : ''}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{p.contacto_telefono || '-'}</TableCell>
                    <TableCell>
                      <button onClick={() => handleToggleActivo(p)} className="cursor-pointer">
                        <Badge variant={p.activo ? 'accent' : 'muted'}>{p.activo ? 'Activo' : 'Inactivo'}</Badge>
                      </button>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="outline" onClick={() => openDetalle(p)}><Eye className="h-3.5 w-3.5" />Compras</Button>
                        <Button size="sm" variant="outline" onClick={() => openEdit(p)}>Editar</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={editProveedor != null} onOpenChange={(o) => !o && setEditProveedor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar proveedor</DialogTitle></DialogHeader>
          <ProveedorForm form={editForm} setForm={setEditForm} onSubmit={handleEditProveedor} saving={saving} submitLabel="Guardar cambios" />
        </DialogContent>
      </Dialog>

      <Dialog open={detalle != null} onOpenChange={(o) => !o && setDetalle(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{detalle?.nombre_empresa}</DialogTitle>
            <DialogDescription>Historial de compras (ingresos de stock registrados a este proveedor).</DialogDescription>
          </DialogHeader>
          {compras.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin compras registradas todavia.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead>Serie</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead className="text-right">Costo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {compras.map((c, i) => (
                  // eslint-disable-next-line react/no-array-index-key
                  <TableRow key={i}>
                    <TableCell className="text-xs text-muted-foreground">{new Date(c.fecha).toLocaleDateString('es-AR')}</TableCell>
                    <TableCell>{c.marca} {c.modelo}</TableCell>
                    <TableCell className="font-mono text-xs">{c.identificador || '-'}</TableCell>
                    <TableCell className="tabular-nums text-right">{c.cantidad}</TableCell>
                    <TableCell className="tabular-nums text-right">{c.costo ? `$${Number(c.costo).toFixed(2)}` : '-'}</TableCell>
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

export function ProveedorForm({
  form, setForm, onSubmit, saving, submitLabel,
}) {
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div>
        <Label htmlFor="provNombre">Nombre de la empresa</Label>
        <Input id="provNombre" required value={form.nombre_empresa} onChange={(e) => setForm({ ...form, nombre_empresa: e.target.value })} />
      </div>
      <div>
        <Label htmlFor="provCuit">CUIT</Label>
        <Input id="provCuit" value={form.cuit} onChange={(e) => setForm({ ...form, cuit: e.target.value })} />
      </div>
      <div>
        <Label htmlFor="provContactoNombre">Contacto</Label>
        <Input id="provContactoNombre" value={form.contacto_nombre} onChange={(e) => setForm({ ...form, contacto_nombre: e.target.value })} />
      </div>
      <div>
        <Label htmlFor="provEmail">Email</Label>
        <Input id="provEmail" type="email" value={form.contacto_email} onChange={(e) => setForm({ ...form, contacto_email: e.target.value })} />
      </div>
      <div>
        <Label htmlFor="provTelefono">Telefono</Label>
        <Input id="provTelefono" value={form.contacto_telefono} onChange={(e) => setForm({ ...form, contacto_telefono: e.target.value })} />
      </div>
      <div>
        <Label htmlFor="provDireccion">Direccion</Label>
        <Input id="provDireccion" value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} />
      </div>
      <div>
        <Label htmlFor="provNota">Nota</Label>
        <Input id="provNota" value={form.nota} onChange={(e) => setForm({ ...form, nota: e.target.value })} />
      </div>
      <Button type="submit" className="mt-2" loading={saving}>{submitLabel}</Button>
    </form>
  );
}
