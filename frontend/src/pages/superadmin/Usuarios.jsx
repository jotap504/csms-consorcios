import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import AdminLayout from '@/components/AdminLayout';
import {
  Card, CardHeader, CardTitle, CardContent,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
  Badge, Button, Input, Label, Switch,
  Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui';
import { SUPERADMIN_NAV } from './navConfig';

// Solo roles "admin-facing" (superadmin/instalador/comercial) - residente,
// consorcio_admin y proveedor ya tienen su propio flujo de alta (UF, consorcio,
// fabrica) y no pertenecen a esta pantalla. Ver admin.js ROLES_SYSTEM_USER.
const ROLES_SYSTEM_USER = ['superadmin', 'instalador', 'comercial'];

// Referencia de solo lectura: hoy los permisos NO son granulares (requireRole
// contra 6 strings fijos con CHECK constraint en la DB), asi que se documenta
// que puede hacer cada rol en vez de fingir checkboxes editables que no existen.
const PERMISOS_POR_ROL = [
  { rol: 'superadmin', desc: 'Acceso total: cargadores, consorcios, facturacion, fabricas, stock, usuarios del sistema.' },
  { rol: 'instalador', desc: 'Alta y configuracion tecnica de cargadores y consorcios.' },
  { rol: 'comercial', desc: 'Bandeja, campanias, presupuestos e informes comerciales.' },
  { rol: 'consorcio_admin', desc: 'Panel del consorcio propio: unidades funcionales, tarjetas RFID, vehiculos.' },
  { rol: 'proveedor', desc: 'Panel de fabrica: sus propios cargadores emparejados y tests OCPP.' },
  { rol: 'residente', desc: 'Su propio cargador: iniciar/detener carga, reservas, tarjeta prepaga.' },
];

export default function Usuarios() {
  const [usuarios, setUsuarios] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: '', nombre: '', rol: 'instalador' });
  const [creando, setCreando] = useState(false);

  async function loadUsuarios() {
    const { data } = await api.get('/admin/usuarios');
    setUsuarios(data);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadUsuarios();
  }, []);

  async function handleCrear(e) {
    e.preventDefault();
    setCreando(true);
    try {
      await api.post('/admin/usuarios', form);
      toast.success('Usuario invitado por email.');
      setOpen(false);
      setForm({ email: '', nombre: '', rol: 'instalador' });
      await loadUsuarios();
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo crear el usuario.');
    } finally {
      setCreando(false);
    }
  }

  async function toggleActivo(u) {
    try {
      await api.put(`/admin/usuarios/${u.id}`, { activo: !u.activo });
      await loadUsuarios();
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo cambiar el estado.');
    }
  }

  async function cambiarRol(u, rol) {
    try {
      await api.put(`/admin/usuarios/${u.id}`, { rol });
      await loadUsuarios();
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo cambiar el rol.');
    }
  }

  return (
    <AdminLayout title="Usuarios" navItems={SUPERADMIN_NAV}>
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>System User (superadmin / instalador / comercial)</CardTitle>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4" /> Nuevo usuario</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nuevo usuario del sistema</DialogTitle>
                <DialogDescription>Se le manda un mail para que elija su contraseña.</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCrear} className="flex flex-col gap-3">
                <div>
                  <Label htmlFor="u_email">Email</Label>
                  <Input id="u_email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="u_nombre">Nombre</Label>
                  <Input id="u_nombre" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
                </div>
                <div>
                  <Label>Rol</Label>
                  <Select value={form.rol} onValueChange={(v) => setForm({ ...form, rol: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ROLES_SYSTEM_USER.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" disabled={creando} className="mt-2">Invitar por mail</Button>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {usuarios.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay usuarios del sistema cargados todavia.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Activo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usuarios.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="text-xs">{u.email}</TableCell>
                    <TableCell className="text-xs">{u.nombre || '-'}</TableCell>
                    <TableCell>
                      <Select value={u.rol} onValueChange={(v) => cambiarRol(u, v)}>
                        <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ROLES_SYSTEM_USER.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell><Badge variant={u.activo ? 'accent' : 'muted'}>{u.activo ? 'Activo' : 'Inactivo'}</Badge></TableCell>
                    <TableCell className="text-right">
                      <Switch checked={u.activo} onCheckedChange={() => toggleActivo(u)} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Permission (referencia)</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-xs text-muted-foreground">
            Los permisos hoy son fijos por rol (no granulares/editables) - esta tabla es solo de consulta.
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rol</TableHead>
                <TableHead>Que puede hacer</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {PERMISOS_POR_ROL.map((p) => (
                <TableRow key={p.rol}>
                  <TableCell className="font-mono text-xs">{p.rol}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{p.desc}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </AdminLayout>
  );
}
