import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2, Zap, Receipt, Factory, Handshake, Package, ChevronRight, Users, Wallet, AlertTriangle,
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { api } from '@/lib/api';
import AdminLayout from '@/components/AdminLayout';
import {
  StatCard, Card, CardHeader, CardTitle, CardContent, Badge,
} from '@/components/ui';
import { SUPERADMIN_NAV } from './navConfig';

const SHORTCUT_COLORS = {
  blue: 'bg-blue-500/10 text-blue-600',
  emerald: 'bg-accent/10 text-accent',
  violet: 'bg-violet-500/10 text-violet-600',
  amber: 'bg-amber-500/10 text-amber-600',
};

const SHORTCUTS = [
  {
    to: '/superadmin/edificios', label: 'Locaciones', description: 'Alta y gestion de instalaciones', icon: Building2, color: 'blue',
  },
  {
    to: '/comercial', label: 'Comercial', description: 'CRM, seguimiento y presupuestos de venta', icon: Users, color: 'blue',
  },
  {
    to: '/superadmin/contabilidad', label: 'Contabilidad', description: 'Caja, gastos, cuentas y resultado', icon: Wallet, color: 'amber',
  },
  {
    to: '/superadmin/cargadores', label: 'Cargadores', description: 'Vista global en tiempo real', icon: Zap, color: 'emerald',
  },
  {
    to: '/superadmin/proveedores', label: 'Proveedores', description: 'Empresas y compras de material', icon: Handshake, color: 'violet',
  },
  {
    to: '/superadmin/stock', label: 'Stock', description: 'Productos, ingresos, instalaciones', icon: Package, color: 'violet',
  },
  {
    to: '/superadmin/catalogo', label: 'Catalogo de abonos', description: 'Plantillas de facturacion', icon: Receipt, color: 'amber',
  },
];

const ESTADO_LABELS = {
  disponible: 'Disponible', cargando: 'Cargando', falla: 'Falla', offline: 'Offline',
};
const ESTADO_COLORS = {
  disponible: '#14b8c6', cargando: '#3b82f6', falla: '#dc2626', offline: '#94a3b8',
};

// Se refresca solo (poll) en vez de websocket - la vista es un resumen de
// operador, no necesita latencia de segundos, 15s alcanza y evita meter
// otra dependencia de tiempo real en el frontend.
const RESUMEN_POLL_MS = 15000;

function timeAgo(iso) {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'recien';
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.floor(hours / 24)} d`;
}

export default function SuperAdminHome() {
  const [consorcios, setConsorcios] = useState([]);
  const [cargadores, setCargadores] = useState([]);
  const [planes, setPlanes] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resumenVivo, setResumenVivo] = useState(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    Promise.all([
      api.get('/superadmin/consorcios'),
      api.get('/superadmin/cargadores'),
      api.get('/superadmin/planes'),
      api.get('/superadmin/proveedores'),
    ]).then(([c, ch, p, pr]) => {
      setConsorcios(c.data);
      setCargadores(ch.data);
      setPlanes(p.data);
      setProveedores(pr.data);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    function loadResumen() {
      api.get('/superadmin/resumen-vivo').then(({ data }) => {
        if (!cancelled) setResumenVivo(data);
      });
    }
    loadResumen();
    const interval = setInterval(loadResumen, RESUMEN_POLL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const cargadoresConectados = cargadores.filter((c) => c.conectado_citrineos).length;

  const donutData = resumenVivo
    ? Object.entries(resumenVivo.estado_counts)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => ({ key: k, name: ESTADO_LABELS[k], value: v }))
    : [];

  return (
    <AdminLayout title="Dashboard" navItems={SUPERADMIN_NAV}>
      <p className="mb-6 text-sm text-muted-foreground">Resumen general de la operacion.</p>

      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Resumen</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard color="blue" icon={Building2} label="Instalaciones activas" value={loading ? '-' : consorcios.length} />
        <StatCard color="emerald" icon={Zap} label="Cargadores conectados" value={loading ? '-' : `${cargadoresConectados} / ${cargadores.length}`} />
        <StatCard color="amber" icon={Receipt} label="Planes disponibles" value={loading ? '-' : planes.length} />
        <StatCard color="violet" icon={Factory} label="Fabricas" value={loading ? '-' : proveedores.length} />
      </div>

      <h2 className="mb-3 mt-8 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Operacion en vivo</h2>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Estado de la flota</CardTitle>
          </CardHeader>
          <CardContent>
            {donutData.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin cargadores registrados todavia.</p>
            ) : (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={donutData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={80} paddingAngle={2}>
                      {donutData.map((d) => <Cell key={d.key} fill={ESTADO_COLORS[d.key]} />)}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <StatCard
            color="primary"
            icon={Zap}
            label="Potencia en tiempo real"
            value={resumenVivo ? `${resumenVivo.potencia_total_kw.toFixed(1)} kW` : '-'}
            hint={resumenVivo ? `${resumenVivo.cargadores_conectados} de ${resumenVivo.cargadores_total} equipos conectados` : undefined}
          />
          <Card className="flex-1">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-destructive" />Fallas recientes</CardTitle>
            </CardHeader>
            <CardContent>
              {!resumenVivo || resumenVivo.fallas_recientes.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin fallas registradas.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {resumenVivo.fallas_recientes.map((f, i) => (
                    <li key={i} className="flex items-center justify-between gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{f.cargador_ocpp_id}</p>
                        <p className="truncate text-muted-foreground">{f.consorcio_nombre} {f.error_code ? `- ${f.error_code}` : ''}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <Badge variant="destructive">{f.status_ocpp}</Badge>
                        <p className="mt-0.5 text-muted-foreground">{timeAgo(f.creado_en)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <h2 className="mb-3 mt-8 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Accesos rapidos</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {SHORTCUTS.map(({
          to, label, description, icon: Icon, color,
        }) => (
          <Link key={to} to={to}>
            <Card className="h-full transition-colors hover:border-primary">
              <CardContent className="flex items-center justify-between gap-3 p-5">
                <div className="flex items-center gap-3">
                  <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${SHORTCUT_COLORS[color]}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium">{label}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </AdminLayout>
  );
}
