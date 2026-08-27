import { useEffect, useState } from 'react';
import { Building2 } from 'lucide-react';
import { api } from '@/lib/api';
import AdminLayout from '@/components/AdminLayout';
import {
  Card, CardHeader, CardTitle, CardContent,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell, Badge, Button,
} from '@/components/ui';
import { SUPERADMIN_NAV } from './navConfig';

// Equivalente a "Location Status" de GRASEN: resumen agregado por
// ubicacion (consorcio) - potencia real, ratio de uso, cantidad de
// estaciones/conectores por sitio. Distinto de "Locaciones" (Edificios.jsx),
// que es el ABM; esto es solo lectura, vista de operador.
const POLL_MS = 15000;

export default function Ubicaciones() {
  const [ubicaciones, setUbicaciones] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    function load() {
      api.get('/superadmin/ubicaciones-estado').then(({ data }) => {
        if (!cancelled) { setUbicaciones(data); setLoading(false); }
      });
    }
    load();
    const interval = setInterval(load, POLL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  return (
    <AdminLayout title="Location Status" navItems={SUPERADMIN_NAV}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Building2 className="h-4 w-4" />Estado por ubicacion</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Cargando...</p>
          ) : ubicaciones.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay ubicaciones registradas todavia.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ubicacion</TableHead>
                  <TableHead>Estaciones</TableHead>
                  <TableHead>Conectadas</TableHead>
                  <TableHead>Cargando ahora</TableHead>
                  <TableHead>Ratio de uso</TableHead>
                  <TableHead>Potencia actual</TableHead>
                  <TableHead>Contratado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ubicaciones.map((u) => {
                  const total = Number(u.cargadores_total);
                  const activos = Number(u.cargadores_activos);
                  const ratio = total > 0 ? ((activos / total) * 100).toFixed(0) : '0';
                  return (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.nombre}</TableCell>
                      <TableCell className="tabular-nums">{total}</TableCell>
                      <TableCell>
                        <Badge variant={Number(u.cargadores_conectados) > 0 ? 'accent' : 'muted'}>
                          {u.cargadores_conectados} / {total}
                        </Badge>
                      </TableCell>
                      <TableCell className="tabular-nums">{activos}</TableCell>
                      <TableCell className="tabular-nums">{ratio}%</TableCell>
                      <TableCell className="tabular-nums">{Number(u.potencia_actual_kw).toFixed(1)} kW</TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">{u.limite_amperios_totales ?? '-'} A</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </AdminLayout>
  );
}
