import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, useInView } from 'framer-motion';
import { ArrowLeft, ArrowRight } from 'lucide-react';

// Quinta version del hero (ruta aparte /hero3, no reemplaza la actual).
// Adaptado del componente "PrismaHero" pegado por el usuario en
// public/hero3.txt: video de fondo a pantalla completa, marca gigante con
// animacion "word pull up" palabra por palabra, nav en pastilla flotante
// arriba, descripcion + CTA abajo a la derecha. El video de fondo es el que
// el usuario dejo en public/hero3.mp4.
function WordsPullUp({ text, className = '', style }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true });
  const words = text.split(' ');

  return (
    <div ref={ref} className={`inline-flex flex-wrap ${className}`} style={style}>
      {words.map((word, i) => {
        const isLast = i === words.length - 1;
        return (
          <motion.span
            key={word}
            initial={{ y: 20, opacity: 0 }}
            animate={isInView ? { y: 0, opacity: 1 } : {}}
            transition={{ duration: 0.6, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
            className="relative inline-block"
            style={{ marginRight: isLast ? 0 : '0.25em' }}
          >
            {word}
          </motion.span>
        );
      })}
    </div>
  );
}

const NAV_ITEMS = [
  { href: '#', label: 'Inicio' },
  { href: '#', label: 'Solucion' },
  { href: '#', label: 'Plataforma' },
  { href: '#', label: 'Videos' },
  { href: '#', label: 'Contacto' },
];

export default function Hero3() {
  return (
    <div className="bg-black">
      <Link
        to="/"
        className="fixed left-4 top-4 z-50 flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-md transition-colors hover:bg-white/20"
      >
        <ArrowLeft className="h-3.5 w-3.5" />Volver al sitio
      </Link>
      <span className="fixed right-4 top-4 z-50 rounded-full bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-300 backdrop-blur-md">
        Hero3 - version de prueba
      </span>

      <section className="h-screen w-full">
        <div className="relative h-full w-full overflow-hidden">
          <video
            autoPlay
            loop
            muted
            playsInline
            className="absolute inset-0 h-full w-full object-cover"
            src="/hero3.mp4"
          />

          <div className="noise-overlay pointer-events-none absolute inset-0 opacity-[0.7] mix-blend-overlay" />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/60" />

          <nav className="absolute left-1/2 top-0 z-20 -translate-x-1/2">
            <div className="flex items-center gap-3 rounded-b-2xl bg-black px-4 py-2 sm:gap-6 md:gap-12 md:rounded-b-3xl md:px-8 lg:gap-14">
              {NAV_ITEMS.map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  className="text-[10px] transition-colors sm:text-xs md:text-sm"
                  style={{ color: 'rgba(225, 224, 204, 0.8)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#E1E0CC'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(225, 224, 204, 0.8)'; }}
                >
                  {item.label}
                </a>
              ))}
            </div>
          </nav>

          <div className="absolute bottom-0 left-0 right-0 px-4 pb-6 sm:px-6 md:px-10">
            <div className="grid grid-cols-12 items-end gap-4">
              <div className="col-span-12 lg:col-span-8">
                <h1
                  className="font-medium leading-[0.85] tracking-[-0.07em] text-[26vw] sm:text-[24vw] md:text-[22vw] lg:text-[20vw] xl:text-[19vw] 2xl:text-[20vw]"
                  style={{ color: '#E1E0CC' }}
                >
                  <WordsPullUp text="BILON" />
                </h1>
              </div>

              <div className="col-span-12 flex flex-col gap-5 pb-6 lg:col-span-4 lg:pb-10">
                <motion.p
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ duration: 0.8, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  className="text-xs sm:text-sm md:text-base"
                  style={{ lineHeight: 1.2, color: 'rgba(225, 224, 204, 0.7)' }}
                >
                  Infraestructura inteligente para la carga de vehiculos electricos en edificios. Balanceo
                  dinamico de carga, medicion en tiempo real y respaldo de conectividad - todo en una misma
                  plataforma.
                </motion.p>

                <motion.button
                  type="button"
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ duration: 0.8, delay: 0.7, ease: [0.16, 1, 0.3, 1] }}
                  className="group inline-flex items-center gap-2 self-start rounded-full py-1 pl-5 pr-1 text-sm font-medium text-black transition-all hover:gap-3 sm:text-base"
                  style={{ backgroundColor: '#E1E0CC' }}
                >
                  Solicitar asesoramiento
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black transition-transform group-hover:scale-110 sm:h-10 sm:w-10">
                    <ArrowRight className="h-4 w-4" style={{ color: '#E1E0CC' }} />
                  </span>
                </motion.button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
