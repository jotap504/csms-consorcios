import { useEffect, useRef, useState } from 'react';
import { motion, useInView } from 'framer-motion';
import {
  Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { TrendingUp } from 'lucide-react';

// Patentamientos PHEV + BEV (electricos enchufables/100% electricos, excluye HEV/MHEV
// no enchufables) en Argentina. 2026 es parcial (primer semestre) - se muestra
// distinto y aclarado a proposito, nunca como año completo.
// Fuente: ACARA (Asociacion de Concesionarios de Automotores de la Republica
// Argentina), informes de patentamientos por electromovilidad.
const DATA = [
  {
    year: '2024', value: 709, tramo: 'Año completo', parcial: false,
  },
  {
    year: '2025', value: 1864, tramo: 'Año completo', parcial: false,
  },
  {
    year: '2026', value: 12856, tramo: 'Primer semestre (ene-jun)', parcial: true,
  },
];

const COUNT_DURATION_MS = 3200;

function CountUp({ to, active, duration = COUNT_DURATION_MS }) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!active) return undefined;
    const start = performance.now();
    let raf;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      setValue(Math.round(to * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, to, duration]);

  return <span>{value.toLocaleString('es-AR')}</span>;
}

function TooltipContent({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-[var(--lp-border)] bg-[var(--lp-bg)] px-3 py-2 text-xs shadow-md">
      <p className="font-semibold text-[var(--lp-fg)]">{d.year}</p>
      <p className="text-[var(--lp-muted)]">{d.tramo}</p>
      <p className="mt-1 font-semibold text-[var(--lp-blue)]">{d.value.toLocaleString('es-AR')} unidades</p>
    </div>
  );
}

function CurvaDot({ cx, cy, payload }) {
  if (payload.parcial) {
    return (
      <circle cx={cx} cy={cy} r={7} fill="var(--lp-green)" stroke="white" strokeWidth={2.5} />
    );
  }
  return <circle cx={cx} cy={cy} r={5} fill="var(--lp-blue)" stroke="white" strokeWidth={2} />;
}

export default function MarketGrowthChart() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-100px' });

  return (
    <div ref={ref}>
      <div className="grid gap-4 sm:grid-cols-3">
        {DATA.map((d, i) => (
          <motion.div
            key={d.year}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.5, delay: i * 0.1 }}
            className="rounded-2xl border border-[var(--lp-border)] bg-[var(--lp-bg)] p-6"
          >
            <p className="lp-heading text-sm font-semibold text-[var(--lp-muted)]">
              {d.year}
              {d.parcial && <span className="ml-1.5 rounded-full bg-[var(--lp-blue)]/10 px-2 py-0.5 text-[10px] font-semibold text-[var(--lp-blue)]">EN CURSO</span>}
            </p>
            <p className="lp-heading mt-1 text-4xl font-bold tabular-nums tracking-tight text-[var(--lp-fg)]">
              <CountUp to={d.value} active={inView} />
            </p>
            <p className="mt-1 text-xs text-[var(--lp-muted)]">{d.tramo}</p>
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-60px' }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="mt-8 rounded-2xl border border-[var(--lp-border)] bg-[var(--lp-bg)] p-6"
      >
        <div className="h-64 w-full sm:h-80">
          <ResponsiveContainer width="100%" height="100%">
            {inView ? (
              <AreaChart data={DATA} margin={{
                top: 12, right: 16, left: -12, bottom: 0,
              }}
              >
                <defs>
                  <linearGradient id="mgFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--lp-blue)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="var(--lp-blue)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--lp-border)" />
                <XAxis dataKey="year" tickLine={false} axisLine={false} tick={{ fill: 'var(--lp-muted)', fontSize: 13 }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fill: 'var(--lp-muted)', fontSize: 12 }} width={56} />
                <Tooltip content={<TooltipContent />} cursor={{ stroke: 'var(--lp-border)', strokeWidth: 1 }} />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="var(--lp-blue)"
                  strokeWidth={3}
                  fill="url(#mgFill)"
                  dot={<CurvaDot />}
                  activeDot={{ r: 7 }}
                  isAnimationActive
                  animationDuration={COUNT_DURATION_MS}
                  animationEasing="ease-out"
                />
              </AreaChart>
            ) : <div />}
          </ResponsiveContainer>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--lp-border)] pt-4 text-xs text-[var(--lp-muted)]">
          <span className="flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5 text-[var(--lp-green)]" />
            2026 ya supera 6,9x el total patentado en todo 2025, con seis meses de datos.
          </span>
          <span>Fuente: ACARA - patentamientos PHEV + 100% electricos. 2026: enero-junio, año en curso.</span>
        </div>
      </motion.div>
    </div>
  );
}
