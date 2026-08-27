import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';
import AdminLayout from '@/components/AdminLayout';
import {
  Card, CardHeader, CardTitle, CardContent,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
  Badge, Button, Input, Label,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui';
import { SUPERADMIN_NAV } from './navConfig';

// Equivalente al tab "Station" de "Real-time Alarm" de GRASEN. No hay tab
// "Module Fault" - no reportamos fallas de submodulo de hardware via OCPP,
// solo StatusNotification=Faulted (cargador_alarmas). A diferencia del feed
// de 10 del Dashboard, esta pagina es historial completo filtrable.
export default function Alarmas() {
  const [cargadores, setCargadores] = useState([]);
  const [alarmas, setAlarmas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroCargador, setFiltroCargador] = useState('todos');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

  async function loadAlarmas() {
    setLoading(true);
    const params = {};
    if (filtroCargador !== 'todos') params.cargador_ocpp_id = filtroCargador;
    if (desde) params.desde = desde;
    if (hasta) params.hasta = hasta;
    const { data } = await api.get('/superadmin/alarmas', { params });
    setAlarmas(data);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    api.get('/superadmin/cargadores').then(({ data }) => setCargadores(data));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAlarmas();
  }, []);

  return (
    <AdminLayout title="Alarmas" navItems={SUPERADMIN_NAV}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-destructive" />Alarmas (historial global)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <div>
              <Label>Cargador</Label>
              <Select value={filtroCargador} onValueChange={setFiltroCargador}>
                <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {cargadores.map((c) => (
                    <SelectItem key={c.ocpp_id} value={c.ocpp_id}>{c.ocpp_id} - {c.consorcio_nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="desde">Desde</Label>
              <Input id="desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="h-10" />
            </div>
            <div>
              <Label htmlFor="hasta">Hasta</Label>
              <Input id="hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="h-10" />
            </div>
            <Button onClick={loadAlarmas} disabled={loading}>Buscar</Button>
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground">Cargando...</p>
          ) : alarmas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin alarmas para este filtro.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cargador</TableHead>
                  <TableHead>Ubicacion</TableHead>
                  <TableHead>Codigo de error</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Hora</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {alarmas.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-mono text-xs">{a.cargador_ocpp_id}</TableCell>
                    <TableCell className="text-xs">
                      {a.consorcio_nombre}{a.sector_nombre ? <span className="text-muted-foreground"> - {a.sector_nombre}</span> : null}
                    </TableCell>
                    <TableCell className="text-xs font-mono">{a.error_code ?? '-'}</TableCell>
                    <TableCell><Badge variant="destructive">{a.status_ocpp}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(a.creado_en).toLocaleString()}</TableCell>
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
