import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Gauge as GaugeIcon, Cpu, ChevronDown, Car } from 'lucide-react';

const LOW = 22;
const HIGH = 88;
const CYCLE_MS = 4200;

function lerpColor(a, b, t) {
  const pa = [parseInt(a.slice(1, 3), 16), parseInt(a.slice(3, 5), 16), parseInt(a.slice(5, 7), 16)];
  const pb = [parseInt(b.slice(1, 3), 16), parseInt(b.slice(3, 5), 16), parseInt(b.slice(5, 7), 16)];
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

function FlowLine({ vertical = false }) {
  return (
    <div className={vertical ? 'relative h-10 w-0.5 bg-[var(--lp-border)]' : 'relative h-0.5 flex-1 bg-[var(--lp-border)]'}>
      <div
        className={
          vertical
            ? 'absolute inset-x-0 top-0 h-4 w-full bg-gradient-to-b from-transparent via-[var(--lp-blue)] to-transparent'
            : 'absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-transparent via-[var(--lp-blue)] to-transparent'
        }
        style={{
          animation: vertical ? 'lp-flow-v 1.4s linear infinite' : 'lp-flow-h 1.4s linear infinite',
        }}
      />
    </div>
  );
}

function Node({ icon: Icon, label, sub }) {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-[var(--lp-border)] bg-white shadow-sm">
        <Icon className="h-6 w-6 text-[var(--lp-fg)]" />
      </div>
      <div>
        <p className="text-xs font-semibold text-[var(--lp-fg)]">{label}</p>
        {sub && <p className="text-[10px] text-[var(--lp-muted)]">{sub}</p>}
      </div>
    </div>
  );
}

function CarLane({ demand, index }) {
  const t = demand / 100;
  const duration = 0.7 + t * 2.1;
  const color = lerpColor('#10b981', '#ef4444', t);
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex h-16 w-8 flex-col items-center justify-start gap-0.5 overflow-hidden rounded-full border border-[var(--lp-border)] bg-[var(--lp-surface)] py-1.5">
        {[0, 1, 2].map((i) => (
          <ChevronDown
            key={i}
            className="h-3.5 w-3.5"
            style={{
              color,
              animation: `lp-chevron-drop ${duration}s ease-in-out infinite`,
              animationDelay: `${i * (duration / 3) + index * 0.15}s`,
            }}
          />
        ))}
      </div>
      <Car className="h-6 w-6 text-[var(--lp-fg)]" />
      <span className="text-[10px] font-medium text-[var(--lp-muted)]">Cochera {index + 1}</span>
    </div>
  );
}

export default function EnergyFlowDiagram() {
  const [demand, setDemand] = useState(LOW);

  useEffect(() => {
    let toggle = false;
    setDemand(LOW);
    const id = setInterval(() => {
      toggle = !toggle;
      setDemand(toggle ? HIGH : LOW);
    }, CYCLE_MS);
    return () => clearInterval(id);
  }, []);

  const t = (demand - LOW) / (HIGH - LOW);
  const gaugeColor = lerpColor('#10b981', '#ef4444', t);
  const isHigh = demand === HIGH;

  return (
    <div className="rounded-3xl border border-[var(--lp-border)] bg-white p-6 shadow-[0_20px_60px_rgb(0,0,0,0.06)] sm:p-10">
      {/* Source chain */}
      <div className="flex items-center justify-center gap-2 sm:gap-4">
        <Node icon={Zap} label="Suministro" />
        <FlowLine />
        <Node icon={GaugeIcon} label="Medidor" />
        <FlowLine />
        <Node icon={Cpu} label="EVMS" sub="cerebro" />
      </div>

      {/* Demand gauge */}
      <div className="mx-auto mt-8 max-w-md">
        <div className="mb-2 flex items-center justify-between text-xs font-medium text-[var(--lp-muted)]">
          <span>Demanda del edificio</span>
          <AnimatePresence mode="wait">
            <motion.span
              key={isHigh ? 'alta' : 'baja'}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.3 }}
              style={{ color: gaugeColor }}
              className="font-bold"
            >
              {isHigh ? 'ALTA' : 'BAJA'}
            </motion.span>
          </AnimatePresence>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--lp-surface)]">
          <motion.div
            className="h-full w-full origin-left rounded-full"
            animate={{ scaleX: demand / 100, backgroundColor: gaugeColor }}
            transition={{ duration: CYCLE_MS / 1000 - 0.3, ease: 'easeInOut' }}
          />
        </div>
      </div>

      {/* Cars */}
      <div className="mt-10 flex justify-center gap-6 sm:gap-10">
        {[0, 1, 2, 3].map((i) => (
          <CarLane key={i} demand={demand} index={i} />
        ))}
      </div>

      {/* Explainer text, crossfades with state */}
      <div className="mx-auto mt-8 h-10 max-w-lg text-center">
        <AnimatePresence mode="wait">
          <motion.p
            key={isHigh ? 'alta' : 'baja'}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.35 }}
            className="text-sm leading-relaxed text-[var(--lp-muted)]"
          >
            {isHigh
              ? 'El EVMS detecta alta demanda y reduce automaticamente el ritmo de carga de cada auto para proteger la instalacion.'
              : 'Con baja demanda, el EVMS entrega mas potencia disponible y los autos cargan a mayor velocidad.'}
          </motion.p>
        </AnimatePresence>
      </div>

      {/* Legend */}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-[var(--lp-border)] pt-6 text-[11px] text-[var(--lp-muted)]">
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-[var(--lp-blue)]" /> Energia (potencia)</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full" style={{ background: gaugeColor }} /> Demanda del edificio</span>
        <span className="flex items-center gap-1.5"><ChevronDown className="h-3.5 w-3.5" /> Ritmo de carga entregado</span>
      </div>
    </div>
  );
}
