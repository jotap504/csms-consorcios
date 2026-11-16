import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Zap, Cable, AlertTriangle, Gauge, ShieldCheck, TrendingUp, Wifi, BarChart3,
  Users, CheckCircle2, MessageCircle, X, Send, Car,
  Wallet, Settings2, FileText, PlugZap, Menu, PlayCircle,
  Building2, Handshake,
} from 'lucide-react';
import { api } from '@/lib/api';
import EnergyFlowDiagram from '@/components/landing/EnergyFlowDiagram';
import ShaderHero from '@/components/landing/ShaderHero';
import MarketGrowthChart from '@/components/landing/MarketGrowthChart';
import BrandsCarousel from '@/components/landing/BrandsCarousel';
import Logo from '@/components/Logo';
import { useLanguage } from '@/lib/language';

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

function Nav() {
  const [open, setOpen] = useState(false);
  const { language, setLanguage } = useLanguage();
  const en = language === 'en';
  const links = [
    { href: '#inicio', label: en ? 'Home' : 'Inicio' },
    { href: '#solucion', label: en ? 'Solution' : 'Solución' },
    { href: '#plataforma', label: en ? 'Platform' : 'Plataforma' },
    { href: '#contacto', label: en ? 'Contact' : 'Contacto' },
  ];
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--lp-border)] bg-[var(--lp-bg)]/95">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <a href="#inicio" className="flex items-center">
          <Logo alt="BILON Smart Buildings" className="h-8 w-auto" />
        </a>
        <nav className="hidden items-center gap-8 md:flex">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="text-sm text-[var(--lp-muted)] transition-colors hover:text-[var(--lp-fg)]">
              {l.label}
            </a>
          ))}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          <button
            type="button"
            onClick={() => setLanguage(en ? 'es' : 'en')}
            className="group inline-flex h-10 items-center gap-2 rounded-lg border border-[var(--lp-border)] px-2.5 text-sm font-medium text-[var(--lp-fg)] transition-colors hover:border-[var(--lp-blue)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-blue)]"
            aria-label={en ? 'Cambiar a español' : 'Switch to English'}
            title={en ? 'Cambiar a español' : 'Switch to English'}
          >
            <span className={`language-flag ${en ? 'language-flag-gb' : 'language-flag-ar'}`} aria-hidden="true" />
            <span className="sr-only">{en ? 'English' : 'Español'}</span>
          </button>
          <Link
            to="/login"
            className="inline-flex h-10 cursor-pointer items-center rounded-lg bg-[var(--lp-fg)] px-4 text-sm font-medium text-[var(--lp-bg)] transition-colors hover:opacity-90"
          >
            {en ? 'Client access' : 'Acceso clientes'}
          </Link>
        </div>
        <div className="flex items-center gap-1 md:hidden">
          <button
            type="button"
            onClick={() => setLanguage(en ? 'es' : 'en')}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--lp-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-blue)]"
            aria-label={en ? 'Cambiar a español' : 'Switch to English'}
          >
            <span className={`language-flag ${en ? 'language-flag-gb' : 'language-flag-ar'}`} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="cursor-pointer p-2"
            aria-label={en ? 'Open menu' : 'Abrir menú'}
            onClick={() => setOpen((v) => !v)}
          >
            <Menu className="h-6 w-6" />
          </button>
        </div>
      </div>
      {open && (
        <div className="flex flex-col gap-1 border-t border-[var(--lp-border)] px-6 py-4 md:hidden">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="py-2 text-sm text-[var(--lp-muted)]" onClick={() => setOpen(false)}>
              {l.label}
            </a>
          ))}
          <Link to="/login" className="mt-2 inline-flex h-10 items-center justify-center rounded-lg bg-[var(--lp-fg)] text-sm font-medium text-[var(--lp-bg)]">
            {en ? 'Client access' : 'Acceso clientes'}
          </Link>
        </div>
      )}
    </header>
  );
}

function scrollToId(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
}

function Hero() {
  const { language } = useLanguage();
  const en = language === 'en';
  return (
    <section id="inicio">
      <h1 className="sr-only">{en ? 'Electric vehicle charging management system' : 'Sistema de gestión de carga de vehículos eléctricos'}</h1>
      <ShaderHero
        stages={[
          { text: en ? 'Have you bought, or are you considering buying, an electric car?' : '¿Compraste o estás por comprar un auto eléctrico?' },
          { text: en ? 'Do you know whether you can charge it in your building?' : '¿Sabés si lo podés cargar en tu edificio?' },
          { text: en ? 'And what will happen when there are 3, 7, or 10 EVs?' : '¿Y qué pasará cuando haya 3, 7 o 10 autos?' },
          {
            text: en ? 'Bilon analyses available power and prepares your building with a smart, safe load-balancing system.' : 'Bilon analiza la potencia y prepara tu edificio con un sistema de balanceo inteligente y seguro.',
            emphasis: true,
          },
        ]}
        buttons={{
          primary: { text: en ? 'Request a consultation' : 'Solicitar asesoramiento', onClick: () => scrollToId('contacto') },
          secondary: { text: en ? 'How it works' : 'Ver cómo funciona', onClick: () => scrollToId('solucion') },
        }}
      />
    </section>
  );
}

function MarketGrowth() {
  const { language } = useLanguage(); const en = language === 'en';
  return (
    <section className="px-6 py-24">
      <div className="mx-auto max-w-5xl">
        <Reveal>
          <h2 className="lp-heading text-3xl font-bold tracking-tight text-[var(--lp-fg)] md:text-4xl">
            {en ? 'The market has already taken off. Infrastructure has not.' : 'El mercado ya explotó. La infraestructura, todavía no.'}
          </h2>
          <p className="mt-4 max-w-2xl text-[var(--lp-muted)]">
            {en ? 'Year-over-year registrations of electric and plug-in hybrid vehicles in Argentina. The curve is exponential — buildings that prepare now will be ahead.' : 'Patentamientos de vehículos eléctricos e híbridos enchufables en Argentina, año a año. La curva es exponencial — los edificios que se preparen ahora van a estar un paso adelante.'}
          </p>
        </Reveal>
        <Reveal delay={0.1} className="mt-12">
          <MarketGrowthChart language={language} />
        </Reveal>
      </div>
    </section>
  );
}

const PROBLEMS = {
  es: [
  { icon: Cable, text: 'Cada propietario instala su propio cable, sin planificacion.' },
  { icon: AlertTriangle, text: 'Las cañerias y ductos del edificio se llenan sin control.' },
  { icon: PlugZap, text: 'Aparecen instalaciones improvisadas y riesgosas.' },
  { icon: Gauge, text: 'No existe control real del consumo electrico.' },
  { icon: Zap, text: 'Se supera la capacidad electrica disponible del edificio.' },
  { icon: FileText, text: 'La administracion no puede facturar correctamente el consumo.' },
  { icon: TrendingUp, text: 'El crecimiento futuro de la demanda se vuelve imposible de sostener.' },
  ],
  en: [
    { icon: Cable, text: 'Each owner installs their own cable, without a plan.' },
    { icon: AlertTriangle, text: 'The building’s conduits and ducts fill up without control.' },
    { icon: PlugZap, text: 'Improvised and unsafe installations start to appear.' },
    { icon: Gauge, text: 'There is no real control of electricity consumption.' },
    { icon: Zap, text: 'The building’s available electrical capacity is exceeded.' },
    { icon: FileText, text: 'Management cannot accurately bill each user’s consumption.' },
    { icon: TrendingUp, text: 'Future demand growth becomes impossible to sustain.' },
  ],
};

function Problem() {
  const { language } = useLanguage(); const en = language === 'en';
  return (
    <section className="bg-[var(--lp-surface)] px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <h2 className="lp-heading text-3xl font-bold tracking-tight text-[var(--lp-fg)] md:text-4xl">{en ? 'The problem' : 'El problema'}</h2>
          <p className="mt-4 max-w-2xl text-[var(--lp-muted)]">
            {en ? 'Today, most buildings handle EV charging in the worst possible way.' : 'Hoy, la mayoría de los edificios resuelve la carga de autos eléctricos de la peor manera posible.'}
          </p>
        </Reveal>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PROBLEMS[language].map((p, i) => (
            <Reveal key={p.text} delay={i * 0.05}>
              <div className="flex h-full items-start gap-3 rounded-xl border border-[var(--lp-border)] bg-[var(--lp-bg)] p-5">
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

const STEPS = {
  es: [
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
  ],
  en: [
    { n: '01', title: 'Complete electrical infrastructure', text: 'We build the building’s complete electrical infrastructure. From day one, it is ready to connect the last EV that arrives in the future—without breaking walls or carrying out major new works.', icon: Cable },
    { n: '02', title: 'Real-time metering', text: 'We install a real-time electricity metering system. We continuously monitor both the building’s consumption and that of every charger.', icon: Gauge },
    { n: '03', title: 'Dynamic load balancing', text: 'We implement an intelligent Dynamic Load Balancing system. Available electrical capacity is never exceeded, and power is automatically distributed among connected vehicles.', icon: BarChart3 },
    { n: '04', title: 'Backup connectivity', text: 'We install a permanent internet connection: the building’s main connection plus a BILON-installed 4G backup. The system keeps operating even if connectivity fails.', icon: Wifi },
  ],
};

function Solution() {
  const { language } = useLanguage(); const en = language === 'en';
  return (
    <section id="solucion" className="px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <h2 className="lp-heading text-3xl font-bold tracking-tight text-[var(--lp-fg)] md:text-4xl">
            {en ? 'One infrastructure, ready for every vehicle in the building.' : 'Una única infraestructura preparada para todos los vehículos del edificio.'}
          </h2>
        </Reveal>
        <div className="mt-14 grid gap-8 md:grid-cols-2">
          {STEPS[language].map((s, i) => (
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
  const { language } = useLanguage(); const en = language === 'en';
  return (
    <section className="bg-[var(--lp-surface)] px-6 py-24">
      <div className="mx-auto max-w-4xl">
        <Reveal>
          <h2 className="lp-heading text-center text-3xl font-bold tracking-tight text-[var(--lp-fg)] md:text-4xl">
            {en ? 'Load balancing, in action' : 'El balanceo de carga, en acción'}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-center text-[var(--lp-muted)]">
            {en ? 'See how the system distributes available energy in real time without ever exceeding building capacity.' : 'Mirá cómo el sistema reparte la energía disponible en tiempo real, sin superar nunca la capacidad del edificio.'}
          </p>
        </Reveal>
        <Reveal delay={0.1} className="mt-12">
          <EnergyFlowDiagram language={language} />
        </Reveal>
      </div>
    </section>
  );
}

function HowItWorks() {
  const { language } = useLanguage(); const en = language === 'en';
  const items = en ? [
    'They request to join the system.',
    'We carry out the installation up to their parking space.',
    'We install a compatible charger, or integrate an existing one if it meets the technical requirements.',
    'They are ready to charge from day one, without affecting the rest of the building.',
  ] : [
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
            {en ? 'How does it work for owners?' : '¿Cómo funciona para los propietarios?'}
          </h2>
          <p className="mt-4 text-[var(--lp-muted)]">{en ? 'It is very simple. When an owner buys an electric vehicle:' : 'Muy simple. Cuando un propietario compra un vehículo eléctrico:'}</p>
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

const BENEFITS = {
  es: [
  { icon: TrendingUp, title: 'Preparado para el futuro', text: 'El edificio queda listo para incorporar nuevos vehiculos electricos durante muchos años.' },
  { icon: Settings2, title: 'Instalacion ordenada', text: 'Sin cables improvisados. Sin modificaciones permanentes. Todo planificado desde el inicio.' },
  { icon: ShieldCheck, title: 'Seguridad electrica', text: 'El sistema controla permanentemente la potencia disponible.' },
  { icon: FileText, title: 'Administracion sencilla', text: 'Cada usuario paga unicamente la energia que consume.' },
  { icon: Users, title: 'Escalable', text: 'Agregar nuevos usuarios lleva muy poco tiempo.' },
  ],
  en: [
    { icon: TrendingUp, title: 'Ready for the future', text: 'The building is ready to add new electric vehicles for many years to come.' },
    { icon: Settings2, title: 'Orderly installation', text: 'No improvised wiring. No permanent alterations. Everything is planned from the start.' },
    { icon: ShieldCheck, title: 'Electrical safety', text: 'The system continuously controls the available power.' },
    { icon: FileText, title: 'Simple management', text: 'Each user pays only for the energy they consume.' },
    { icon: Users, title: 'Scalable', text: 'Adding new users takes very little time.' },
  ],
};

function Benefits() {
  const { language } = useLanguage(); const en = language === 'en';
  return (
    <section className="px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <h2 className="lp-heading text-3xl font-bold tracking-tight text-[var(--lp-fg)] md:text-4xl">{en ? 'Benefits for your building' : 'Beneficios para el edificio'}</h2>
        </Reveal>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {BENEFITS[language].map((b, i) => (
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
    <div className="rounded-2xl border border-[var(--lp-border)] bg-[var(--lp-bg)] p-2 shadow-[0_20px_60px_rgb(0,0,0,0.08)]">
      <div className="rounded-xl bg-[var(--lp-surface)] p-6">
        <div className="mb-4 flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--lp-border)]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--lp-border)]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--lp-border)]" />
        </div>
        <p className="lp-heading mb-4 text-sm font-semibold text-[var(--lp-fg)]">{title}</p>
        <div className="space-y-2.5">
          {items.map((it) => (
            <div key={it} className="flex items-center gap-2 rounded-lg bg-[var(--lp-bg)] px-3 py-2.5 text-xs text-[var(--lp-fg)] shadow-sm">
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
  const { language } = useLanguage(); const en = language === 'en';
  return (
    <section id="plataforma" className="bg-[var(--lp-surface)] px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <h2 className="lp-heading text-3xl font-bold tracking-tight text-[var(--lp-fg)] md:text-4xl">{en ? 'Smart platform' : 'Plataforma inteligente'}</h2>
          <p className="mt-4 max-w-2xl text-[var(--lp-muted)]">
            {en ? 'One dashboard for every role: owners control their charging, while managers oversee the entire building.' : 'Un panel para cada rol: el propietario controla su carga, el administrador controla el edificio entero.'}
          </p>
        </Reveal>
        <div className="mt-14 grid gap-10 lg:grid-cols-2">
          <Reveal>
            <MockScreen
              title={en ? 'Owner portal' : 'Portal propietario'}
              items={en ? ['Start / stop charging', 'Daily and monthly consumption', 'Charging history', 'Energy cost', 'Manage your charger'] : ['Iniciar / detener carga', 'Consumos diarios y mensuales', 'Historial de cargas', 'Costo de su energía', 'Administrar su cargador']}
            />
          </Reveal>
          <Reveal delay={0.1}>
            <MockScreen
              title={en ? 'Manager portal' : 'Portal administrador'}
              items={en ? ['All chargers, live', 'Enable new users', 'Total consumption and reports', 'Export information', 'Fees settlement by unit'] : ['Todos los cargadores en vivo', 'Habilitar nuevos usuarios', 'Consumos generales y reportes', 'Exportar información', 'Liquidación de expensas por unidad']}
            />
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function WhoPays() {
  const { language } = useLanguage(); const en = language === 'en';
  const schemes = en ? [
    { icon: Building2, title: 'Building-funded investment', desc: 'The condominium funds the complete backbone installation and retains ownership of the asset from day one.' },
    { icon: Handshake, title: 'Shared funding', desc: 'Together with the condominium, we assess the most convenient investment mix and split the cost of the backbone installation.' },
  ] : [
    {
      icon: Building2,
      title: 'Inversion a cargo del edificio',
      desc: 'El consorcio financia la instalacion troncal completa y mantiene la propiedad del activo desde el primer momento.',
    },
    {
      icon: Handshake,
      title: 'Financiamiento mixto',
      desc: 'Analizamos junto al consorcio la combinacion de inversion mas conveniente, repartiendo el costo de la instalacion troncal entre ambas partes.',
    },
  ];
  return (
    <section className="px-6 py-24">
      <div className="mx-auto max-w-4xl">
        <Reveal>
          <h2 className="lp-heading text-3xl font-bold tracking-tight text-[var(--lp-fg)] md:text-4xl">{en ? 'Who funds the installation?' : '¿Quién financia la instalación?'}</h2>
          <p className="mt-4 leading-relaxed text-[var(--lp-muted)]">
            {en ? 'We evaluate each building individually and propose the model that best fits its needs. There is no one-size-fits-all formula.' : 'Analizamos cada edificio puntualmente y proponemos el esquema que mejor se ajusta a su caso. No hay una fórmula única.'}
          </p>
        </Reveal>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {schemes.map(({ icon: Icon, title, desc }, i) => (
            <Reveal key={title} delay={i * 0.08}>
              <div className="h-full rounded-xl border border-[var(--lp-border)] p-5">
                <Icon className="h-6 w-6 text-[var(--lp-green)]" />
                <p className="mt-3 font-semibold text-[var(--lp-fg)]">{title}</p>
                <p className="mt-2 text-sm leading-relaxed text-[var(--lp-muted)]">{desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal delay={0.2}>
          <div className="mt-6 flex items-center gap-3 rounded-xl border border-[var(--lp-border)] p-4">
            <Wallet className="h-5 w-5 shrink-0 text-[var(--lp-green)]" />
            <p className="text-[var(--lp-fg)]">
              {en ? 'In every case, each owner who adds an electric vehicle pays for their individual charger and the monthly use and maintenance fee.' : 'En todos los casos, cada propietario que incorpora un vehículo eléctrico paga su cargador individual y el abono mensual de uso y mantenimiento.'}
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function BrandsWall() {
  const { language } = useLanguage();
  return (
    <section className="px-6 py-16">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <p className="text-center text-sm font-semibold uppercase tracking-wide text-[var(--lp-muted)]">
            {language === 'en' ? 'Compatible with leading electric and plug-in hybrid vehicle brands' : 'Compatible con las principales marcas de vehículos eléctricos e híbridos enchufables'}
          </p>
        </Reveal>
        <Reveal delay={0.1} className="mt-8">
          <BrandsCarousel />
        </Reveal>
      </div>
    </section>
  );
}

function Compatibility() {
  const { language } = useLanguage(); const en = language === 'en';
  return (
    <section className="bg-[var(--lp-surface)] px-6 py-24">
      <div className="mx-auto max-w-4xl text-center">
        <Reveal>
          <Car className="mx-auto h-8 w-8 text-[var(--lp-blue)]" />
          <h2 className="lp-heading mt-4 text-3xl font-bold tracking-tight text-[var(--lp-fg)] md:text-4xl">
            {en ? 'Compatible with multiple chargers' : 'Compatible con múltiples cargadores'}
          </h2>
          <p className="mt-4 leading-relaxed text-[var(--lp-muted)]">
            {en ? 'If the owner already has a wallbox compatible with the platform’s supported protocols, it can be integrated into the system. Otherwise, BILON provides a fully compatible charger.' : 'Si el propietario ya posee un Wallbox compatible con los protocolos soportados por la plataforma, podrá integrarse al sistema. En caso contrario, BILON provee un cargador totalmente compatible.'}
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
  const { language } = useLanguage(); const en = language === 'en';
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
      <div className="rounded-2xl border border-[var(--lp-border)] bg-[var(--lp-bg)] p-8 text-center">
        <CheckCircle2 className="mx-auto h-8 w-8 text-[var(--lp-green)]" />
        <p className="lp-heading mt-3 font-semibold text-[var(--lp-fg)]">{en ? 'Thanks, we received your enquiry.' : 'Listo, recibimos tu consulta.'}</p>
        <p className="mt-1 text-sm text-[var(--lp-muted)]">{en ? 'We will get in touch shortly.' : 'Te contactamos a la brevedad.'}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-[var(--lp-border)] bg-[var(--lp-bg)] p-8">
      <div className="grid gap-4 sm:grid-cols-2">
        <input required placeholder={en ? 'Your name' : 'Tu nombre'} value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })}
          className="h-11 rounded-lg border border-[var(--lp-border)] px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-blue)]" />
        <input required type="email" placeholder={en ? 'Your email' : 'Tu email'} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
          className="h-11 rounded-lg border border-[var(--lp-border)] px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-blue)]" />
        <input placeholder={en ? 'Building name' : 'Nombre del edificio'} value={form.edificio} onChange={(e) => setForm({ ...form, edificio: e.target.value })}
          className="h-11 rounded-lg border border-[var(--lp-border)] px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-blue)]" />
        <input placeholder={en ? 'Number of parking spaces' : 'Cantidad de cocheras'} value={form.cocheras} onChange={(e) => setForm({ ...form, cocheras: e.target.value })}
          className="h-11 rounded-lg border border-[var(--lp-border)] px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-blue)]" />
        <input placeholder={en ? 'Location' : 'Ubicación'} value={form.ubicacion} onChange={(e) => setForm({ ...form, ubicacion: e.target.value })}
          className="h-11 rounded-lg border border-[var(--lp-border)] px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-blue)] sm:col-span-2" />
        <textarea placeholder={en ? 'Tell us a little more (optional)' : 'Contanos un poco más (opcional)'} value={form.mensaje} onChange={(e) => setForm({ ...form, mensaje: e.target.value })}
          rows={3} className="rounded-lg border border-[var(--lp-border)] px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-blue)] sm:col-span-2" />
      </div>
      {status === 'error' && <p className="mt-3 text-sm text-red-600">{en ? 'We could not send your enquiry. Please try again.' : 'No pudimos enviar tu consulta. Probá de nuevo.'}</p>}
      <button type="submit" disabled={status === 'sending'}
        className="mt-5 inline-flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-[var(--lp-blue)] text-sm font-semibold text-white transition-colors hover:bg-[#0052cc] disabled:opacity-50 sm:w-auto sm:px-8">
        {status === 'sending' ? (en ? 'Sending…' : 'Enviando…') : (en ? 'Request a technical visit' : 'Solicitar una visita técnica')}
      </button>
    </form>
  );
}

function FinalCta() {
  const { language } = useLanguage(); const en = language === 'en';
  return (
    <section id="contacto" className="px-6 py-24">
      <div className="mx-auto max-w-3xl text-center">
        <Reveal>
          <h2 className="lp-heading text-3xl font-bold tracking-tight text-[var(--lp-fg)] md:text-4xl">
            {en ? 'Prepare your building today for the mobility of tomorrow.' : 'Prepará hoy tu edificio para la movilidad del futuro.'}
          </h2>
          <p className="mt-4 leading-relaxed text-[var(--lp-muted)]">
            {en ? 'The number of electric vehicles will grow year after year. Buildings that prepare today will avoid technical issues and much higher future costs.' : 'La cantidad de vehículos eléctricos crecerá año tras año. Los edificios que comiencen a prepararse hoy evitarán problemas técnicos y costos mucho mayores en el futuro.'}
          </p>
        </Reveal>
        <Reveal delay={0.1} className="mt-10">
          <LeadForm />
        </Reveal>
        <Reveal delay={0.15}>
          <a
            href="https://wa.me/5491167258498"
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex h-11 cursor-pointer items-center gap-2 text-sm font-medium text-[var(--lp-green)] hover:underline"
          >
            <MessageCircle className="h-4 w-4" /> {en ? 'Chat on WhatsApp' : 'Hablar por WhatsApp'}
          </a>
        </Reveal>
      </div>
    </section>
  );
}

// Lucide dropped brand icons (Instagram/LinkedIn/TikTok) from the core
// package - drawn here as simple monoline glyphs matching Lucide's own
// visual language (24x24, 2px round stroke) instead of adding a dependency.
function InstagramIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function LinkedinIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <line x1="7.5" y1="10" x2="7.5" y2="16.5" />
      <circle cx="7.5" cy="6.7" r="0.9" fill="currentColor" stroke="none" />
      <path d="M11 16.5v-4a2.2 2.2 0 0 1 4.5 0v4" />
      <line x1="11" y1="10.5" x2="11" y2="16.5" />
    </svg>
  );
}

function TiktokIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M14 4v9.8a3.4 3.4 0 1 1-3-3.37" />
      <path d="M14 4c.4 2.6 2.2 4.6 5 5" />
    </svg>
  );
}

const SOCIALS = [
  { icon: InstagramIcon, label: 'Instagram', href: 'https://instagram.com/bilonsmart' },
  { icon: TiktokIcon, label: 'TikTok', href: 'https://tiktok.com/@bilonsmartbuildings' },
  { icon: LinkedinIcon, label: 'LinkedIn', href: 'https://linkedin.com/company/bilon-smart-buildings' },
];

function Footer() {
  const { language } = useLanguage();
  return (
    <footer className="border-t border-[var(--lp-border)] px-6 py-12">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col items-center gap-3 sm:items-start">
          <Logo alt="BILON Smart Buildings" className="h-7 w-auto" />
          <p className="text-xs text-[var(--lp-muted)]">Av. San Martin 5060</p>
          <p className="text-xs text-[var(--lp-muted)]">
            <a href="mailto:bilonpresupuestos@gmail.com" className="hover:underline">bilonpresupuestos@gmail.com</a>
          </p>
          <p className="text-xs text-[var(--lp-muted)]">© {new Date().getFullYear()} BILON. {language === 'en' ? 'Smart infrastructure for electric mobility.' : 'Infraestructura inteligente para movilidad eléctrica.'}</p>
        </div>
        <div className="flex items-center gap-3">
          {SOCIALS.map((s) => (
            <a
              key={s.label}
              href={s.href}
              target="_blank"
              rel="noreferrer"
              aria-label={s.label}
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-[var(--lp-border)] text-[var(--lp-muted)] transition-colors hover:border-[var(--lp-blue)] hover:text-[var(--lp-blue)]"
            >
              <s.icon className="h-4 w-4" />
            </a>
          ))}
        </div>
      </div>
    </footer>
  );
}

function ChatWidget() {
  const { language } = useLanguage();
  const en = language === 'en';
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hola! Soy Jimena de Bilon, ¿en qué te puedo ayudar?' },
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
      setMessages([...next, { role: 'assistant', content: data.reply || (en ? 'I could not answer that. Please try again.' : 'No pude responder eso, probá de nuevo.') }]);
    } catch {
      setMessages([...next, { role: 'assistant', content: en ? 'There was a problem. Please try again shortly, or contact us on WhatsApp.' : 'Hubo un problema. Probá de nuevo en un rato, o escribinos por WhatsApp.' }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 sm:bottom-6 sm:right-6">
      {open && (
        <div className="mb-3 flex h-[min(28rem,70dvh)] w-[min(20rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-[var(--lp-border)] bg-[var(--lp-bg)] shadow-2xl">
          <div className="flex items-center justify-between border-b border-[var(--lp-border)] bg-[var(--lp-fg)] px-4 py-3">
            <span className="text-sm font-semibold text-white">{en ? 'BILON assistant' : 'Asistente BILON'}</span>
            <button type="button" onClick={() => setOpen(false)} className="cursor-pointer text-white/80 hover:text-white" aria-label={en ? 'Close chat' : 'Cerrar chat'}>
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
            {loading && <div className="w-fit rounded-xl bg-[var(--lp-surface)] px-3 py-2 text-sm text-[var(--lp-muted)]">{en ? 'Typing…' : 'Escribiendo…'}</div>}
          </div>
          <div className="flex items-center gap-2 border-t border-[var(--lp-border)] p-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
              placeholder={en ? 'Write your question…' : 'Escribí tu consulta…'}
              className="h-10 flex-1 rounded-lg border border-[var(--lp-border)] px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-blue)]"
            />
            <button type="button" onClick={send} disabled={loading} className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-[var(--lp-blue)] text-white disabled:opacity-50" aria-label={en ? 'Send' : 'Enviar'}>
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-14 w-14 cursor-pointer items-center justify-center rounded-full bg-[var(--lp-blue)] text-white shadow-lg transition-transform duration-200 hover:scale-105"
        aria-label={en ? 'Open chat' : 'Abrir chat'}
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>
    </div>
  );
}

export default function Landing() {
  useEffect(() => {
    const canonical = document.createElement('link');
    canonical.rel = 'canonical';
    canonical.href = 'https://bilon.com.ar/';
    const schema = document.createElement('script');
    schema.type = 'application/ld+json';
    schema.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'BILON Smart Buildings',
      url: 'https://bilon.com.ar/',
      logo: 'https://bilon.com.ar/logo.png',
      email: 'bilonpresupuestos@gmail.com',
      sameAs: SOCIALS.map(({ href }) => href),
    });
    document.head.append(canonical, schema);
    return () => { canonical.remove(); schema.remove(); };
  }, []);
  return (
    <div className="landing min-h-dvh">
      <Nav />
      <Hero />
      <Problem />
      <MarketGrowth />
      <Solution />
      <LiveDemo />
      <HowItWorks />
      <Benefits />
      <Platform />
      <WhoPays />
      <BrandsWall />
      <Compatibility />
      {/* Videos oculto por el momento - reactivar cuando haya contenido real */}
      <FinalCta />
      <Footer />
      <ChatWidget />
    </div>
  );
}
