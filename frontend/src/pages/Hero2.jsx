import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Zap } from 'lucide-react';

// Reemplaza el subrayado animado debajo de "un solo cerebro": un wallbox de
// 7kW del que sale un cable que se dibuja de izquierda a derecha (mismo
// truco de pathLength que el FlowLine de la version anterior del hero) y
// termina en un cargador Type2 (Mennekes) estilizado, que aparece cuando
// el cable termina de dibujarse.
function CablePlug({ delay = 1.1, duration = 1.1 }) {
  return (
    <svg viewBox="0 0 300 52" className="mx-auto h-10 w-64 sm:h-12 sm:w-80" fill="none">
      <defs>
        <linearGradient id="cablePlugGradient" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#34d399" />
        </linearGradient>
      </defs>

      <g>
        <rect x="2" y="4" width="34" height="44" rx="8" fill="#0a0f1a" stroke="#38bdf8" strokeWidth="2" />
        <rect x="8" y="10" width="22" height="11" rx="2.5" fill="none" stroke="#34d399" strokeOpacity="0.6" strokeWidth="1.2" />
        <path d="M20.5 12 L16.5 17.5 L19 17.5 L17.5 20.5 L22 15.5 L19.5 15.5 Z" fill="#34d399" fillOpacity="0.85" />
        <text x="19" y="41" textAnchor="middle" fontSize="9" fontWeight="700" fill="#7dd3fc" letterSpacing="0.3">7kW</text>
        <circle cx="36" cy="26" r="2" fill="#38bdf8" />
      </g>

      <motion.path
        d="M38 26 C80 26 90 38 130 38 C170 38 180 24 220 24 C235 24 235 30 235 30"
        stroke="url(#cablePlugGradient)"
        strokeWidth="4"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration, delay, ease: 'easeInOut' }}
      />

      <motion.g
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, delay: delay + duration - 0.1, ease: 'backOut' }}
        style={{ transformOrigin: '258px 26px' }}
      >
        <rect x="252" y="1" width="15" height="9" rx="2.5" fill="#0a0f1a" stroke="#34d399" strokeWidth="1.5" />
        <rect x="233" y="8" width="50" height="38" rx="11" fill="#0a0f1a" stroke="#38bdf8" strokeWidth="2" />
        <rect x="241" y="15" width="34" height="24" rx="7" fill="none" stroke="#38bdf8" strokeOpacity="0.5" strokeWidth="1.2" />
        <circle cx="258" cy="22" r="2.4" fill="#38bdf8" />
        <circle cx="249" cy="30" r="2" fill="#38bdf8" />
        <circle cx="267" cy="30" r="2" fill="#38bdf8" />
        <circle cx="251" cy="35.5" r="1.6" fill="#34d399" />
        <circle cx="265" cy="35.5" r="1.6" fill="#34d399" />
      </motion.g>
    </svg>
  );
}

// Cuarta version del hero (ruta aparte /hero2, no reemplaza la actual).
// Sin animacion 3D de fondo - solo tipografia grande + el wallbox con cable
// y enchufe Type2 (CablePlug) como unico elemento grafico.
export default function Hero2() {
  return (
    <div className="relative h-screen w-full overflow-hidden bg-[#05070d]">
      <Link
        to="/"
        className="fixed left-4 top-4 z-50 flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-md transition-colors hover:bg-white/20"
      >
        <ArrowLeft className="h-3.5 w-3.5" />Volver al sitio
      </Link>
      <span className="fixed right-4 top-4 z-50 rounded-full bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-300 backdrop-blur-md">
        Hero2 - version de prueba
      </span>

      <div className="absolute inset-0 bg-gradient-to-t from-[#05070d] via-transparent to-[#05070d]/40" />
      <div className="absolute left-1/4 top-1/4 h-96 w-96 rounded-full bg-sky-500/5 blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 h-64 w-64 rounded-full bg-emerald-500/5 blur-3xl" />

      <div className="relative z-10 mx-auto flex h-full max-w-5xl flex-col items-center justify-center space-y-10 px-6 py-12 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="space-y-8"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="inline-flex items-center gap-3 rounded-full border border-sky-400/30 bg-sky-400/10 px-6 py-3 backdrop-blur-xl"
          >
            <span className="h-2 w-2 animate-ping rounded-full bg-sky-400" />
            <span className="text-sm font-bold uppercase tracking-wider text-sky-300">Red de carga inteligente</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.3 }}
            className="select-none text-4xl font-black leading-[0.95] tracking-tighter text-white md:text-6xl lg:text-7xl"
          >
            <span className="mb-2 block text-3xl font-light text-white/70 md:text-5xl">
              Toda tu red de carga,
            </span>
            <span className="block bg-gradient-to-br from-sky-300 via-sky-400 to-emerald-400 bg-clip-text text-transparent">
              un solo cerebro
            </span>
          </motion.h1>

          <CablePlug />

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.8 }}
            className="mx-auto max-w-2xl space-y-3"
          >
            <p className="text-lg leading-relaxed text-slate-300 md:text-xl">
              Balanceo dinamico de carga, medicion en tiempo real y respaldo de conectividad -
              {' '}
              <span className="rounded-md bg-sky-400/10 px-2 py-1 font-semibold text-white">
                todo desde una misma plataforma
              </span>
            </p>
            <p className="text-sm text-slate-400 md:text-base">
              Preparado para decenas de vehiculos electricos cargando al mismo tiempo, sin superar nunca la capacidad electrica del edificio.
            </p>
          </motion.div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 1 }}
          className="flex flex-col items-center justify-center gap-4 pt-2 sm:flex-row"
        >
          <Link
            to="/"
            className="group inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-400 to-sky-500 px-8 py-4 text-base font-semibold text-[#05070d] shadow-xl shadow-sky-500/20 transition-transform hover:scale-105"
          >
            Solicitar asesoramiento
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
          <Link
            to="/"
            className="group inline-flex items-center gap-2 rounded-xl border-2 border-white/25 bg-white/5 px-8 py-4 text-base font-semibold text-white backdrop-blur-xl transition-colors hover:border-sky-400/50 hover:bg-white/10"
          >
            <Zap className="h-4 w-4 transition-transform group-hover:scale-110" />
            Ver como funciona
          </Link>
        </motion.div>
      </div>
    </div>
  );
}
