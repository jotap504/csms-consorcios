import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users, Target, Clock, AlertTriangle, CalendarClock, Package,
} from 'lucide-react';
import { api } from '@/lib/api';
import AdminLayout from '@/components/AdminLayout';
import {
  StatCard, Card, CardHeader, CardTitle, CardContent, Button,
} from '@/components/ui';
import { SUPERADMIN_NAV } from '../superadmin/navConfig';

const PIPELINE = [
  'Nuevo', 'Contactado', 'Interesado', 'Reunion agendada', 'Relevamiento tecnico',
  'Presupuesto enviado', 'Negociacion', 'Ganado', 'Perdido', 'Pausado',
];

const ALERTA_COLOR = {
  Vencido: 'text-destructive',
  Hoy: 'text-amber-600',
  'Proximos 7 dias': 'text-accent',
  'Sin fecha': 'text-muted-foreground',
  'No contactar': 'text-muted-foreground',
};

export default function ComercialDashboard() {
  const [data, setData] = useState(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    api.get('/comercial/dashboard').then(({ data: d }) => setData(d));
  }, []);

  const porEstado = Object.fromEntries((data?.por_estado ?? []).map((r) => [r.estado_comercial, Number(r.n)]));
  const alertas = Object.fromEntries((data?.alertas ?? []).map((r) => [r.alerta, Number(r.n)]));

  return (
    <AdminLayout title="Comercial" navItems={SUPERADMIN_NAV}>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Panel comercial - contactos, embudo de ventas y seguimientos pendientes.</p>
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/comercial/catalogo">
            <Button size="sm" variant="outline"><Package className="h-4 w-4" />Ver catalogo</Button>
          </Link>
          <Link to="/comercial/contactos">
            <Button size="sm"><Users className="h-4 w-4" />Ver todos los contactos</Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard color="primary" icon={Users} label="Contactos totales" value={data ? data.contactos_totales : '-'} />
        <StatCard color="rose" icon={AlertTriangle} label="Vencidos" value={data ? (alertas.Vencido ?? 0) : '-'} />
        <StatCard color="amber" icon={Clock} label="Para hoy" value={data ? (alertas.Hoy ?? 0) : '-'} />
        <StatCard color="emerald" icon={CalendarClock} label="Proximos 7 dias" value={data ? (alertas['Proximos 7 dias'] ?? 0) : '-'} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Target className="h-4 w-4" />Embudo comercial</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {PIPELINE.map((estado) => (
              <Link
                key={estado}
                to={`/comercial/contactos?estado=${encodeURIComponent(estado)}`}
                className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-muted/50"
              >
                <span>{estado}</span>
                <span className="tabular-nums font-semibold">{porEstado[estado] ?? 0}</span>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" />Seguimientos por atender</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {['Vencido', 'Hoy', 'Proximos 7 dias', 'Sin fecha', 'No contactar'].map((alerta) => (
              <div key={alerta} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm">
                <span className={ALERTA_COLOR[alerta]}>{alerta}</span>
                <span className="tabular-nums font-semibold">{alertas[alerta] ?? 0}</span>
              </div>
            ))}
            <Link to="/comercial/contactos" className="mt-2 text-sm font-medium text-accent hover:underline">
              Ver todos los contactos →
            </Link>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
