import { useEffect, useState } from 'react';
import { motion, useMotionValue, useTransform, useSpring, useMotionValueEvent } from 'framer-motion';

// Perilla visual de progreso de carga - version de solo lectura, adaptada de
// un knob interactivo: sin drag/pointer, la posicion la maneja el prop
// `value` (0-100, ver residente.js: utilizacion_pct = potencia actual / cupo
// de amperios asignado por el balanceador DLM).
const MIN_DEG = -135;
const MAX_DEG = 135;
const TOTAL_TICKS = 40;

export default function ChargeGauge({ value = 0, size = 176 }) {
  const rotation = useMotionValue(MIN_DEG);
  const smoothRotation = useSpring(rotation, { stiffness: 260, damping: 28, mass: 0.7 });

  useEffect(() => {
    const clamped = Math.max(0, Math.min(100, value));
    rotation.set(MIN_DEG + (clamped / 100) * (MAX_DEG - MIN_DEG));
  }, [value, rotation]);

  const displayValue = useTransform(smoothRotation, [MIN_DEG, MAX_DEG], [0, 100]);
  const glowOpacity = useTransform(smoothRotation, [MIN_DEG, MAX_DEG], [0.08, 0.4]);
  const needleGlow = useTransform(smoothRotation, (r) => `0 0 ${Math.max(3, (r + 135) / 14)}px var(--color-accent)`);

  const ticks = Array.from({ length: TOTAL_TICKS + 1 });
  const knobSize = size * 0.62;
  const capSize = size * 0.44;

  return (
    <div className="relative select-none" style={{ width: size, height: size }}>
      <motion.div
        className="absolute inset-0 rounded-full bg-accent blur-2xl"
        style={{ opacity: glowOpacity }}
      />

      <div className="absolute inset-0 pointer-events-none">
        {ticks.map((_, i) => {
          const angle = (i / TOTAL_TICKS) * (MAX_DEG - MIN_DEG) + MIN_DEG;
          return (
            <div
              key={i}
              className="absolute top-0 left-1/2 w-1 h-full -translate-x-1/2"
              style={{ transform: `rotate(${angle}deg)` }}
            >
              <TickMark currentRotation={smoothRotation} angle={angle} />
            </div>
          );
        })}
      </div>

      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{ width: knobSize, height: knobSize }}
      >
        <motion.div className="relative w-full h-full rounded-full z-20" style={{ rotate: smoothRotation }}>
          <div className="w-full h-full rounded-full bg-neutral-900 shadow-[0_10px_30px_rgba(0,0,0,0.6),inset_0_1px_1px_rgba(255,255,255,0.1)] border border-neutral-800 flex items-center justify-center relative overflow-hidden">
            <div className="absolute inset-0 opacity-40 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.1),transparent_50%)]" />
            <div
              className="relative rounded-full bg-neutral-950 shadow-[inset_0_2px_5px_rgba(0,0,0,1)] border border-neutral-800/50 flex items-center justify-center"
              style={{ width: capSize, height: capSize }}
            >
              <motion.div className="absolute top-2.5 w-1 h-3.5 bg-accent rounded-full" style={{ boxShadow: needleGlow }} />
            </div>
          </div>
        </motion.div>
      </div>

      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <DisplayValue value={displayValue} />
        <span className="mt-0.5 text-[9px] text-muted-foreground tracking-[0.2em]">POTENCIA</span>
      </div>
    </div>
  );
}

function TickMark({ currentRotation, angle }) {
  const opacity = useTransform(currentRotation, (r) => (r >= angle ? 1 : 0.2));
  const color = useTransform(currentRotation, (r) => (r >= angle ? 'var(--color-accent)' : '#d4d8dd'));

  return (
    <motion.div
      style={{ backgroundColor: color, opacity }}
      className="w-0.5 h-2 rounded-full transition-colors duration-75"
    />
  );
}

function DisplayValue({ value }) {
  const [display, setDisplay] = useState(0);
  useMotionValueEvent(value, 'change', (latest) => setDisplay(Math.round(latest)));

  return (
    <span className="font-mono text-2xl font-bold tabular-nums text-accent">
      {display}
      <span className="text-xs text-muted-foreground ml-0.5">%</span>
    </span>
  );
}
