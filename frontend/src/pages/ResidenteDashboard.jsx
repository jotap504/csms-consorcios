import { useEffect, useState } from 'react';
import { Home, Zap, Receipt, CreditCard, ChevronDown, ChevronUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { api } from '@/lib/api';
import Layout from '@/components/Layout';
import CargadorControl from '@/components/CargadorControl';
import {
  StatCard, Card, CardHeader, CardTitle, CardContent,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
  Badge, Button, Input,
} from '@/components/ui';

const navItems = [{ to: '/residente', label: 'Mi consumo', icon: Home, end: true }];

export default function ResidenteDashboard() {
  const [consumos, setConsumos] = useState([]);
  const [tarjetas, setTarjetas] = useState([]);
  const [cargadores, setCargadores] = useState([]);
  const [periodo, setPeriodo] = useState('');
  const [historialExpanded, setHistorialExpanded] = useState(false);
  const HISTORIAL_VISIBLE = 15;

  async function loadAll(currentPeriodo) {
    const [c, t, ca] = await Promise.all([
      api.get('/residente/consumos', { params: currentPeriodo ? { periodo: currentPeriodo } : {} }),
      api.get('/residente/tarjetas'),
      api.get('/residente/cargadores'),
    ]);
    setConsumos(c.data);
    setTarjetas(t.data);
    setCargadores(ca.data);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
    loadAll(periodo);
  }, []);

  function handleFilter(e) {
    e.preventDefault();
    setHistorialExpanded(false);
    loadAll(periodo);
  }

  const totalKwh = consumos.reduce((sum, c) => sum + Number(c.kwh_consumidos), 0);
  const totalMonto = consumos.reduce((sum, c) => sum + Number(c.monto_total_expensa), 0);
  const chartData = [...consumos]
    .reverse()
    .map((c) => ({
      fecha: new Date(c.fecha_inicio).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' }),
      kwh: Number(c.kwh_consumidos),
    }));

  return (
    <Layout title="Mi consumo" navItems={navItems}>
      {cargadores.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Mis cargadores</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cargadores.map((c) => (
              <div key={c.ocpp_id} className="max-w-sm">
                <CargadorControl ocppId={c.ocpp_id} />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={Zap} label="Sesiones de carga" value={consumos.length} />
        <StatCard icon={Receipt} label="kWh consumidos" value={totalKwh.toFixed(2)} />
        <StatCard icon={CreditCard} label="Total del periodo" value={`$${totalMonto.toFixed(2)}`} />
      </div>

      {chartData.length > 0 && (
        <Card className="mt-6">
          <CardHeader><CardTitle>Consumo por sesion (kWh)</CardTitle></CardHeader>
          <CardContent>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e4e7eb" vertical={false} />
                  <XAxis dataKey="fecha" tick={{ fontSize: 12 }} stroke="#64748b" />
                  <YAxis tick={{ fontSize: 12 }} stroke="#64748b" />
                  <Tooltip formatter={(value) => [`${value} kWh`, 'Consumo']} />
                  <Bar dataKey="kwh" fill="#059669" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="mt-6">
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle>Historial de consumos</CardTitle>
          <form onSubmit={handleFilter} className="flex items-center gap-2">
            <Input type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)} className="w-40" />
            <Button type="submit" variant="outline" size="sm">Filtrar</Button>
          </form>
        </CardHeader>
        <CardContent>
          {consumos.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay sesiones de carga registradas para este periodo.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cargador</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="text-right">kWh</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(historialExpanded ? consumos : consumos.slice(0, HISTORIAL_VISIBLE)).map((c) => (
                  <TableRow key={c.transaction_id_ocpp}>
                    <TableCell className="font-mono text-xs">{c.cargador_ocpp_id}</TableCell>
                    <TableCell>{new Date(c.fecha_inicio).toLocaleDateString('es-AR')}</TableCell>
                    <TableCell className="tabular-nums text-right">{Number(c.kwh_consumidos).toFixed(2)}</TableCell>
                    <TableCell className="tabular-nums text-right">${Number(c.monto_total_expensa).toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {consumos.length > HISTORIAL_VISIBLE && (
            <button
              onClick={() => setHistorialExpanded((v) => !v)}
              className="mt-3 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {historialExpanded ? (
                <>Ver menos <ChevronUp className="h-4 w-4" /></>
              ) : (
                <>Ver {consumos.length - HISTORIAL_VISIBLE} mas <ChevronDown className="h-4 w-4" /></>
              )}
            </button>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader><CardTitle>Mis tarjetas RFID</CardTitle></CardHeader>
        <CardContent>
          {tarjetas.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tenes tarjetas RFID asignadas.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID Tag</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tarjetas.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-mono text-xs">{t.id_tag_ocpp}</TableCell>
                    <TableCell>
                      <Badge variant={t.activa ? 'accent' : 'muted'}>{t.activa ? 'Activa' : 'Inactiva'}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </Layout>
  );
}
