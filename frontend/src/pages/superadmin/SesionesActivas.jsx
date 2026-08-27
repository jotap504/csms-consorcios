import { useEffect, useState } from 'react';
import { Zap } from 'lucide-react';
import { api } from '@/lib/api';
import AdminLayout from '@/components/AdminLayout';
import {
  Card, CardHeader, CardTitle, CardContent,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell, Input,
} from '@/components/ui';
import { SUPERADMIN_NAV } from './navConfig';

// Equivalente a "Charging" de GRASEN (Monitoring): monitor en vivo de
// sesiones activas ahora mismo, todas las consorcios, buscable por serie.
// No es historico - eso ya lo tiene cada consorcio en su tab "Facturacion".
const POLL_MS = 10000;

function elapsed(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  return `${hours} h ${mins % 60} min`;
}

export default function SesionesActivas() {
  const [sesiones, setSesiones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');

  useEffect(() => {
    let cancelled = false;
    function load() {
      api.get('/superadmin/sesiones-activas').then(({ data }) => {
        if (!cancelled) { setSesiones(data); setLoading(false); }
      });
    }
    load();
    const interval = setInterval(load, POLL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const filtradas = sesiones.filter((s) => s.cargador_ocpp_id.toLowerCase().includes(busqueda.toLowerCase()));

  return (
    <AdminLayout title="Carga en vivo" navItems={SUPERADMIN_NAV}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Zap className="h-4 w-4" />Sesiones activas ahora ({sesiones.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            placeholder="Buscar por serie (OCPP ID)"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="mb-4 w-64"
          />
          {loading ? (
            <p className="text-sm text-muted-foreground">Cargando...</p>
          ) : filtradas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin sesiones de carga activas en este momento.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cargador</TableHead>
                  <TableHead>Ubicacion</TableHead>
                  <TableHead>Tiempo cargando</TableHead>
                  <TableHead>Potencia actual</TableHead>
                  <TableHead>kWh acumulados</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtradas.map((s) => (
                  <TableRow key={s.cargador_ocpp_id}>
                    <TableCell className="font-mono text-xs">{s.cargador_ocpp_id}</TableCell>
                    <TableCell className="text-xs">{s.consorcio_nombre}</TableCell>
                    <TableCell className="text-xs">{elapsed(s.fecha_inicio)}</TableCell>
                    <TableCell className="tabular-nums">{s.potencia_kw != null ? `${Number(s.potencia_kw).toFixed(1)} kW` : '-'}</TableCell>
                    <TableCell className="tabular-nums">{s.kwh_acumulado != null ? Number(s.kwh_acumulado).toFixed(2) : '-'}</TableCell>
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
