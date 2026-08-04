import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Zap, Cable, AlertTriangle, Gauge, ShieldCheck, TrendingUp, Wifi, BarChart3,
  Users, CheckCircle2, ArrowRight, MessageCircle, X, Send, Car, Cpu, Building2,
  Wallet, Settings2, FileText, PlugZap, Menu, PlayCircle,
} from 'lucide-react';
import { api } from '@/lib/api';
import EnergyFlowDiagram, { FlowLine } from '@/components/landing/EnergyFlowDiagram';

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } },
};

function Reveal({ children, className = '', delay = 0 }) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '-80px' }}
      variants={fadeUp}
      transition={{ delay }}
    >
      {children}
    </motion.div>
  );
}

// --- Hero graphic: 5 wallboxes wired to a central EVMS hub. Cycles through
// the DLM story - 3 cars sharing 33% each, a 4th arrives and all drop to
// 25%, a 5th arrives and gets queued instead of dropping everyone further.
// Only opacity/color transitions (no layout-affecting properties - see the
// horizontal-overflow bug this page already shipped once from an animation
// that touched layout).
const HERO_STEPS = [
  { active: 3, queued: false, pct: 33 },
  { active: 4, queued: false, pct: 25 },
  { active: 4, queued: true, pct: 25 },
];
const HERO_CYCLE_MS = 2600;

function HeroGraphic() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStep((s) => (s + 1) % HERO_STEPS.length), HERO_CYCLE_MS);
    return () => clearInterval(id);
  }, []);
  const { active, queued, pct } = HERO_STEPS[step];

  return (
    <div className="relative mx-auto w-full max-w-md lp-float">
      <div className="flex items-stretch gap-3 sm:gap-5">
        <div className="flex flex-1 flex-col gap-1.5 rounded-2xl border border-[var(--lp-border)] bg-white p-2.5 shadow-sm">
          <div className="mb-1 flex items-center gap-1.5 px-1.5 text-[10px] font-semibold text-[var(--lp-muted)]">
            <Building2 className="h-3.5 w-3.5" /> Edificio
          </div>
          {[0, 1, 2, 3, 4].map((i) => {
            const isQueuedSlot = queued && i === active;
            const isCharging = i < active;
            return (
              <div
                key={i}
                className={`flex items-center gap-2 rounded-lg px-2.5 py-2 transition-colors duration-500 ${
                  isQueuedSlot ? 'bg-amber-50' : 'bg-[var(--lp-surface)]'
                } ${!isCharging && !isQueuedSlot ? 'opacity-40' : ''}`}
              >
                <PlugZap
                  className={`h-4 w-4 shrink-0 transition-colors duration-500 ${
                    isCharging ? 'text-[var(--lp-blue)] lp-node' : isQueuedSlot ? 'text-amber-500' : 'text-[var(--lp-muted)]'
                  }`}
                  style={isCharging ? { animationDelay: `${i * 0.3}s` } : undefined}
                />
                <Car className={`h-4 w-4 shrink-0 transition-colors duration-500 ${isQueuedSlot ? 'text-amber-600' : 'text-[var(--lp-fg)]'}`} />
                <span className="text-[10px] font-medium text-[var(--lp-muted)]">WB{i + 1}</span>
                <span className="ml-auto min-w-[52px] text-right text-[10px] font-bold">
                  {isCharging && <span className="text-[var(--lp-blue)]">{pct}%</span>}
                  {isQueuedSlot && <span className="text-amber-600">En cola</span>}
                </span>
                <div className="w-5 sm:w-8">
                  <FlowLine />
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex shrink-0 flex-col items-center justify-center gap-1 self-center rounded-full border-2 border-[var(--lp-blue)] bg-white p-4 shadow-md lp-node text-[var(--lp-blue)]">
          <Cpu className="h-7 w-7" />
          <span className="text-[9px] font-bold text-[var(--lp-fg)]">EVMS</span>
        </div>
      </div>
      <div className="relative mt-4 flex justify-center">
        <div className="rounded-full border border-[var(--lp-border)] bg-white px-4 py-1.5 text-xs font-medium text-[var(--lp-fg)] shadow-sm">
          Balanceo dinamico en tiempo real
        </div>
      </div>
    </div>
  );
}

function Nav() {
  const [open, setOpen] = useState(false);
  const links = [
    { href: '#inicio', label: 'Inicio' },
    { href: '#solucion', label: 'Solucion' },
    { href: '#plataforma', label: 'Plataforma' },
    { href: '#videos', label: 'Videos' },
    { href: '#contacto', label: 'Contacto' },
  ];
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--lp-border)] bg-white/95">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <a href="#inicio" className="flex items-center">
          <img src="/logo.png" alt="BILON Smart Buildings" className="h-8 w-auto" />
        </a>
        <nav className="hidden items-center gap-8 md:flex">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="text-sm text-[var(--lp-muted)] transition-colors hover:text-[var(--lp-fg)]">
              {l.label}
            </a>
          ))}
        </nav>
        <div className="hidden items-center md:flex">
          <Link
            to="/login"
            className="inline-flex h-10 cursor-pointer items-center rounded-lg bg-[var(--lp-fg)] px-4 text-sm font-medium text-white transition-colors hover:bg-black"
          >
            Acceso Clientes
          </Link>
        </div>
        <button
          type="button"
          className="cursor-pointer md:hidden"
          aria-label="Abrir menu"
          onClick={() => setOpen((v) => !v)}
        >
          <Menu className="h-6 w-6" />
        </button>
      </div>
      {open && (
        <div className="flex flex-col gap-1 border-t border-[var(--lp-border)] px-6 py-4 md:hidden">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="py-2 text-sm text-[var(--lp-muted)]" onClick={() => setOpen(false)}>
              {l.label}
            </a>
          ))}
          <Link to="/login" className="mt-2 inline-flex h-10 items-center justify-center rounded-lg bg-[var(--lp-fg)] text-sm font-medium text-white">
            Acceso Clientes
          </Link>
        </div>
      )}
    </header>
  );
}

function Hero() {
  return (
    <section id="inicio" className="relative overflow-hidden px-6 pt-16 pb-24 md:pt-24 md:pb-32">
      <div className="mx-auto grid max-w-6xl items-center gap-16 md:grid-cols-2">
        <Reveal>
          <h1 className="lp-heading text-4xl font-bold leading-[1.1] tracking-tight text-[var(--lp-fg)] md:text-5xl lg:text-6xl">
            Los edificios no fueron diseñados para cargar autos electricos.{' '}
            <span className="text-[var(--lp-blue)]">Nosotros si.</span>
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-relaxed text-[var(--lp-muted)]">
            Cada año mas propietarios compran vehiculos electricos. Las instalaciones tradicionales no estan preparadas
            para soportar esa demanda. BILON instala una infraestructura inteligente preparada para el presente y para
            el futuro.
          </p>
          <div className="mt-9 flex flex-wrap gap-4">
            <a
              href="#contacto"
              className="inline-flex h-12 cursor-pointer items-center gap-2 rounded-lg bg-[var(--lp-blue)] px-6 text-sm font-semibold text-white transition-transform duration-200 hover:scale-[1.02] hover:bg-[#0052cc]"
            >
              Solicitar asesoramiento <ArrowRight className="h-4 w-4" />
            </a>
            <a
              href="#solucion"
              className="inline-flex h-12 cursor-pointer items-center rounded-lg border border-[var(--lp-border)] px-6 text-sm font-semibold text-[var(--lp-fg)] transition-colors hover:bg-[var(--lp-surface)]"
            >
              Ver como funciona
            </a>
          </div>
        </Reveal>
        <Reveal delay={0.15}>
          <HeroGraphic />
        </Reveal>
      </div>
    </section>
  );
}

const PROBLEMS = [
  { icon: Cable, text: 'Cada propietario instala su propio cable, sin planificacion.' },
  { icon: AlertTriangle, text: 'Las cañerias y ductos del edificio se llenan sin control.' },
  { icon: PlugZap, text: 'Aparecen instalaciones improvisadas y riesgosas.' },
  { icon: Gauge, text: 'No existe control real del consumo electrico.' },
  { icon: Zap, text: 'Se supera la capacidad electrica disponible del edificio.' },
  { icon: FileText, text: 'La administracion no puede facturar correctamente el consumo.' },
  { icon: TrendingUp, text: 'El crecimiento futuro de la demanda se vuelve imposible de sostener.' },
];

function Problem() {
  return (
    <section className="bg-[var(--lp-surface)] px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <h2 className="lp-heading text-3xl font-bold tracking-tight text-[var(--lp-fg)] md:text-4xl">El problema</h2>
          <p className="mt-4 max-w-2xl text-[var(--lp-muted)]">
            Hoy, la mayoria de los edificios resuelve la carga de autos electricos de la peor manera posible.
          </p>
        </Reveal>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PROBLEMS.map((p, i) => (
            <Reveal key={p.text} delay={i * 0.05}>
              <div className="flex h-full items-start gap-3 rounded-xl border border-[var(--lp-border)] bg-white p-5">
                <p.icon className="mt-0.5 h-5 w-5 shrink-0 text-[var(--lp-blue)]" />
                <p className="text-sm leading-relaxed text-[var(--lp-fg)]">{p.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

const STEPS = [
  {
    n: '01',
    title: 'Infraestructura electrica completa',
    text: 'Realizamos toda la infraestructura electrica del edificio. La instalacion queda preparada desde el primer dia para conectar el ultimo vehiculo electrico que llegue en el futuro. No sera necesario volver a romper paredes ni realizar nuevas obras importantes.',
    icon: Cable,
  },
  {
    n: '02',
    title: 'Medicion en tiempo real',
    text: 'Instalamos un sistema de medicion electrica en tiempo real. Conocemos permanentemente el consumo del edificio y el de cada cargador.',
    icon: Gauge,
  },
  {
    n: '03',
    title: 'Balanceo dinamico de carga',
    text: 'Implementamos un sistema inteligente de balanceo dinamico de carga (Dynamic Load Balancing). Nunca se supera la capacidad electrica disponible. Toda la potencia se distribuye automaticamente entre los vehiculos conectados.',
    icon: BarChart3,
  },
  {
    n: '04',
    title: 'Conectividad con respaldo',
    text: 'Instalamos una conexion permanente a Internet: la conexion principal del edificio, mas una conexion 4G de respaldo instalada por BILON. El sistema permanece operativo incluso ante fallas de conectividad.',
    icon: Wifi,
  },
];

function Solution() {
  return (
    <section id="solucion" className="px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <h2 className="lp-heading text-3xl font-bold tracking-tight text-[var(--lp-fg)] md:text-4xl">
            Una unica infraestructura preparada para todos los vehiculos del edificio.
          </h2>
        </Reveal>
        <div className="mt-14 grid gap-8 md:grid-cols-2">
          {STEPS.map((s, i) => (
            <Reveal key={s.n} delay={i * 0.08}>
              <div className="h-full rounded-2xl border border-[var(--lp-border)] p-8">
                <div className="flex items-center gap-4">
                  <span className="lp-heading text-sm font-semibold text-[var(--lp-blue)]">{s.n}</span>
                  <s.icon className="h-5 w-5 text-[var(--lp-green)]" />
                </div>
                <h3 className="lp-heading mt-4 text-xl font-semibold text-[var(--lp-fg)]">{s.title}</h3>
                <p className="mt-3 leading-relaxed text-[var(--lp-muted)]">{s.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function LiveDemo() {
  return (
    <section className="bg-[var(--lp-surface)] px-6 py-24">
      <div className="mx-auto max-w-4xl">
        <Reveal>
          <h2 className="lp-heading text-center text-3xl font-bold tracking-tight text-[var(--lp-fg)] md:text-4xl">
            El balanceo de carga, en accion
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-center text-[var(--lp-muted)]">
            Mira como el sistema reparte la energia disponible en tiempo real, sin superar nunca la capacidad del edificio.
          </p>
        </Reveal>
        <Reveal delay={0.1} className="mt-12">
          <EnergyFlowDiagram />
        </Reveal>
      </div>
    </section>
  );
}

function HowItWorks() {
  const items = [
    'Solicita su incorporacion al sistema.',
    'Realizamos la instalacion hasta su cochera.',
    'Instalamos un cargador compatible, o integramos uno existente si cumple con los requisitos tecnicos.',
    'Queda listo para cargar desde el primer dia, sin afectar al resto del edificio.',
  ];
  return (
    <section className="bg-[var(--lp-surface)] px-6 py-24">
      <div className="mx-auto max-w-4xl text-center">
        <Reveal>
          <h2 className="lp-heading text-3xl font-bold tracking-tight text-[var(--lp-fg)] md:text-4xl">
            ¿Como funciona para los propietarios?
          </h2>
          <p className="mt-4 text-[var(--lp-muted)]">Muy simple. Cuando un propietario compra un vehiculo electrico:</p>
        </Reveal>
        <div className="mt-12 grid gap-6 text-left sm:grid-cols-2">
          {items.map((t, i) => (
            <Reveal key={t} delay={i * 0.08}>
              <div className="flex items-start gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--lp-blue)] text-xs font-semibold text-white">
                  {i + 1}
                </div>
                <p className="text-[var(--lp-fg)]">{t}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

const BENEFITS = [
  { icon: Wallet, title: 'Sin inversion inicial del consorcio', text: 'La infraestructura se financia con quienes realmente utilizan el sistema.' },
  { icon: TrendingUp, title: 'Preparado para el futuro', text: 'El edificio queda listo para incorporar nuevos vehiculos electricos durante muchos años.' },
  { icon: Settings2, title: 'Instalacion ordenada', text: 'Sin cables improvisados. Sin modificaciones permanentes. Todo planificado desde el inicio.' },
  { icon: ShieldCheck, title: 'Seguridad electrica', text: 'El sistema controla permanentemente la potencia disponible.' },
  { icon: FileText, title: 'Administracion sencilla', text: 'Cada usuario paga unicamente la energia que consume.' },
  { icon: Users, title: 'Escalable', text: 'Agregar nuevos usuarios lleva muy poco tiempo.' },
];

function Benefits() {
  return (
    <section className="px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <h2 className="lp-heading text-3xl font-bold tracking-tight text-[var(--lp-fg)] md:text-4xl">Beneficios para el edificio</h2>
        </Reveal>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {BENEFITS.map((b, i) => (
            <Reveal key={b.title} delay={i * 0.06}>
              <div className="h-full rounded-2xl border border-[var(--lp-border)] p-7 transition-shadow duration-200 hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)]">
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--lp-surface)]">
                  <b.icon className="h-5 w-5 text-[var(--lp-blue)]" />
                </div>
                <h3 className="lp-heading mt-5 text-base font-semibold text-[var(--lp-fg)]">{b.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--lp-muted)]">{b.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function MockScreen({ title, items }) {
  return (
    <div className="rounded-2xl border border-[var(--lp-border)] bg-white p-2 shadow-[0_20px_60px_rgb(0,0,0,0.08)]">
      <div className="rounded-xl bg-[var(--lp-surface)] p-6">
        <div className="mb-4 flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--lp-border)]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--lp-border)]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--lp-border)]" />
        </div>
        <p className="lp-heading mb-4 text-sm font-semibold text-[var(--lp-fg)]">{title}</p>
        <div className="space-y-2.5">
          {items.map((it) => (
            <div key={it} className="flex items-center gap-2 rounded-lg bg-white px-3 py-2.5 text-xs text-[var(--lp-fg)] shadow-sm">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[var(--lp-green)]" />
              {it}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Platform() {
  return (
    <section id="plataforma" className="bg-[var(--lp-surface)] px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <h2 className="lp-heading text-3xl font-bold tracking-tight text-[var(--lp-fg)] md:text-4xl">Plataforma inteligente</h2>
          <p className="mt-4 max-w-2xl text-[var(--lp-muted)]">
            Un panel para cada rol: el propietario controla su carga, el administrador controla el edificio entero.
          </p>
        </Reveal>
        <div className="mt-14 grid gap-10 lg:grid-cols-2">
          <Reveal>
            <MockScreen
              title="Portal Propietario"
              items={['Iniciar / detener carga', 'Consumos diarios y mensuales', 'Historial de cargas', 'Costo de su energia', 'Administrar su cargador']}
            />
          </Reveal>
          <Reveal delay={0.1}>
            <MockScreen
              title="Portal Administrador"
              items={['Todos los cargadores en vivo', 'Habilitar nuevos usuarios', 'Consumos generales y reportes', 'Exportar informacion', 'Liquidacion de expensas por unidad']}
            />
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function WhoPays() {
  const items = ['Su instalacion', 'Su cargador (cuando corresponda)', 'El mantenimiento y operacion mediante un abono mensual'];
  return (
    <section className="px-6 py-24">
      <div className="mx-auto max-w-4xl">
        <Reveal>
          <h2 className="lp-heading text-3xl font-bold tracking-tight text-[var(--lp-fg)] md:text-4xl">¿Quien paga?</h2>
          <p className="mt-4 leading-relaxed text-[var(--lp-muted)]">
            El edificio no necesita realizar una inversion importante. Cada propietario que incorpora un vehiculo electrico financia:
          </p>
        </Reveal>
        <div className="mt-8 space-y-3">
          {items.map((t, i) => (
            <Reveal key={t} delay={i * 0.08}>
              <div className="flex items-center gap-3 rounded-xl border border-[var(--lp-border)] p-4">
                <Wallet className="h-5 w-5 shrink-0 text-[var(--lp-green)]" />
                <p className="text-[var(--lp-fg)]">{t}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal delay={0.3}>
          <p className="mt-6 font-medium text-[var(--lp-fg)]">De esta manera, unicamente pagan quienes utilizan el servicio.</p>
        </Reveal>
      </div>
    </section>
  );
}

function Compatibility() {
  return (
    <section className="bg-[var(--lp-surface)] px-6 py-24">
      <div className="mx-auto max-w-4xl text-center">
        <Reveal>
          <Car className="mx-auto h-8 w-8 text-[var(--lp-blue)]" />
          <h2 className="lp-heading mt-4 text-3xl font-bold tracking-tight text-[var(--lp-fg)] md:text-4xl">
            Compatible con multiples cargadores
          </h2>
          <p className="mt-4 leading-relaxed text-[var(--lp-muted)]">
            Si el propietario ya posee un Wallbox compatible con los protocolos soportados por la plataforma, podra
            integrarse al sistema. En caso contrario, BILON provee un cargador totalmente compatible.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

function Videos() {
  const items = [
    { title: 'Instalaciones', video: '/intromob.mp4' },
    { title: 'Funcionamiento del sistema', video: null },
    { title: 'Demostracion de la plataforma', video: null },
    { title: 'Edificios conectados', video: null },
  ];
  return (
    <section id="videos" className="px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <h2 className="lp-heading text-3xl font-bold tracking-tight text-[var(--lp-fg)] md:text-4xl">Videos</h2>
        </Reveal>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((v, i) => (
            <Reveal key={v.title} delay={i * 0.06}>
              <div className="group relative aspect-[9/12] overflow-hidden rounded-2xl border border-[var(--lp-border)] bg-[var(--lp-surface)]">
                {v.video ? (
                  <video src={v.video} className="h-full w-full object-cover" muted loop playsInline autoPlay />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-2 text-[var(--lp-muted)]">
                    <PlayCircle className="h-8 w-8" />
                    <span className="text-xs">Proximamente</span>
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-3 text-xs font-medium text-white">
                  {v.title}
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function LeadForm() {
  const [form, setForm] = useState({ nombre: '', email: '', edificio: '', cocheras: '', ubicacion: '', mensaje: '' });
  const [status, setStatus] = useState('idle');

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus('sending');
    try {
      await api.post('/public/leads', form);
      setStatus('sent');
      setForm({ nombre: '', email: '', edificio: '', cocheras: '', ubicacion: '', mensaje: '' });
    } catch {
      setStatus('error');
    }
  }

  if (status === 'sent') {
    return (
      <div className="rounded-2xl border border-[var(--lp-border)] bg-white p-8 text-center">
        <CheckCircle2 className="mx-auto h-8 w-8 text-[var(--lp-green)]" />
        <p className="lp-heading mt-3 font-semibold text-[var(--lp-fg)]">Listo, recibimos tu consulta.</p>
        <p className="mt-1 text-sm text-[var(--lp-muted)]">Te contactamos a la brevedad.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-[var(--lp-border)] bg-white p-8">
      <div className="grid gap-4 sm:grid-cols-2">
        <input required placeholder="Tu nombre" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })}
          className="h-11 rounded-lg border border-[var(--lp-border)] px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-blue)]" />
        <input required type="email" placeholder="Tu email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
          className="h-11 rounded-lg border border-[var(--lp-border)] px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-blue)]" />
        <input placeholder="Nombre del edificio" value={form.edificio} onChange={(e) => setForm({ ...form, edificio: e.target.value })}
          className="h-11 rounded-lg border border-[var(--lp-border)] px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-blue)]" />
        <input placeholder="Cantidad de cocheras" value={form.cocheras} onChange={(e) => setForm({ ...form, cocheras: e.target.value })}
          className="h-11 rounded-lg border border-[var(--lp-border)] px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-blue)]" />
        <input placeholder="Ubicacion" value={form.ubicacion} onChange={(e) => setForm({ ...form, ubicacion: e.target.value })}
          className="h-11 rounded-lg border border-[var(--lp-border)] px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-blue)] sm:col-span-2" />
        <textarea placeholder="Contanos un poco mas (opcional)" value={form.mensaje} onChange={(e) => setForm({ ...form, mensaje: e.target.value })}
          rows={3} className="rounded-lg border border-[var(--lp-border)] px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-blue)] sm:col-span-2" />
      </div>
      {status === 'error' && <p className="mt-3 text-sm text-red-600">No pudimos enviar tu consulta. Proba de nuevo.</p>}
      <button type="submit" disabled={status === 'sending'}
        className="mt-5 inline-flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-[var(--lp-blue)] text-sm font-semibold text-white transition-colors hover:bg-[#0052cc] disabled:opacity-50 sm:w-auto sm:px-8">
        {status === 'sending' ? 'Enviando...' : 'Solicitar una visita tecnica'}
      </button>
    </form>
  );
}

function FinalCta() {
  return (
    <section id="contacto" className="px-6 py-24">
      <div className="mx-auto max-w-3xl text-center">
        <Reveal>
          <h2 className="lp-heading text-3xl font-bold tracking-tight text-[var(--lp-fg)] md:text-4xl">
            Prepara hoy tu edificio para la movilidad del futuro.
          </h2>
          <p className="mt-4 leading-relaxed text-[var(--lp-muted)]">
            La cantidad de vehiculos electricos crecera año tras año. Los edificios que comiencen a prepararse hoy
            evitaran problemas tecnicos y costos mucho mayores en el futuro.
          </p>
        </Reveal>
        <Reveal delay={0.1} className="mt-10">
          <LeadForm />
        </Reveal>
        <Reveal delay={0.15}>
          <a
            href="https://wa.me/5491100000000"
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex h-11 cursor-pointer items-center gap-2 text-sm font-medium text-[var(--lp-green)] hover:underline"
          >
            <MessageCircle className="h-4 w-4" /> Hablar por WhatsApp
          </a>
        </Reveal>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-[var(--lp-border)] px-6 py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
        <span className="lp-heading text-sm font-bold">BILON</span>
        <p className="text-xs text-[var(--lp-muted)]">© {new Date().getFullYear()} BILON. Infraestructura inteligente para movilidad electrica.</p>
      </div>
    </footer>
  );
}

function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hola! Soy Jimena, CEO de BILON y ademas la rompo toda al padel. Pero si viniste aca es para hablar de vehiculos electricos, o no? Contame como te llamas y cual es tu consulta.' },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, open]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    const next = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setLoading(true);
    try {
      const { data } = await api.post('/public/chat', { messages: next });
      setMessages([...next, { role: 'assistant', content: data.reply || 'No pude responder eso, proba de nuevo.' }]);
    } catch {
      setMessages([...next, { role: 'assistant', content: 'Hubo un problema. Proba de nuevo en un rato, o escribinos por WhatsApp.' }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 sm:bottom-6 sm:right-6">
      {open && (
        <div className="mb-3 flex h-[min(28rem,70dvh)] w-[min(20rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-[var(--lp-border)] bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-[var(--lp-border)] bg-[var(--lp-fg)] px-4 py-3">
            <span className="text-sm font-semibold text-white">Asistente BILON</span>
            <button type="button" onClick={() => setOpen(false)} className="cursor-pointer text-white/80 hover:text-white" aria-label="Cerrar chat">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.map((m, i) => (
              <div key={i} className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
                m.role === 'user' ? 'ml-auto bg-[var(--lp-blue)] text-white' : 'bg-[var(--lp-surface)] text-[var(--lp-fg)]'
              }`}>
                {m.content}
              </div>
            ))}
            {loading && <div className="w-fit rounded-xl bg-[var(--lp-surface)] px-3 py-2 text-sm text-[var(--lp-muted)]">Escribiendo...</div>}
          </div>
          <div className="flex items-center gap-2 border-t border-[var(--lp-border)] p-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
              placeholder="Escribi tu consulta..."
              className="h-10 flex-1 rounded-lg border border-[var(--lp-border)] px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-blue)]"
            />
            <button type="button" onClick={send} disabled={loading} className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-[var(--lp-blue)] text-white disabled:opacity-50" aria-label="Enviar">
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-14 w-14 cursor-pointer items-center justify-center rounded-full bg-[var(--lp-blue)] text-white shadow-lg transition-transform duration-200 hover:scale-105"
        aria-label="Abrir chat"
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>
    </div>
  );
}

export default function Landing() {
  return (
    <div className="landing min-h-dvh">
      <Nav />
      <Hero />
      <Problem />
      <Solution />
      <LiveDemo />
      <HowItWorks />
      <Benefits />
      <Platform />
      <WhoPays />
      <Compatibility />
      <Videos />
      <FinalCta />
      <Footer />
      <ChatWidget />
    </div>
  );
}
