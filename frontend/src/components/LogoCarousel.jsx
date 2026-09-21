import React from 'react';

const evBrands = [
  { name: 'BAIC', slug: 'baic' },
  { name: 'BYD', slug: 'byd' },
  { name: 'Renault', slug: 'renault' },
  { name: 'Nissan', slug: 'nissan' },
  { name: 'Volvo', slug: 'volvo' },
  { name: 'BMW', slug: 'bmw' },
  { name: 'Mercedes-Benz', slug: 'mercedes-benz' },
  { name: 'Audi', slug: 'audi' },
  { name: 'Ford', slug: 'ford' },
  { name: 'Peugeot', slug: 'peugeot' },
  { name: 'Toyota', slug: 'toyota' },
  { name: 'Chery', slug: 'chery' },
  { name: 'Coradir', slug: 'coradir' },
  { name: 'Volt Motors', slug: 'volt-motors' },
  { name: 'Sero Electric', slug: 'sero-electric' },
  { name: 'Hyundai', slug: 'hyundai' },
  { name: 'Porsche', slug: 'porsche' },
];

export default function LogoCarousel({ speed = 35, variant = 'white' }) {
  const folder = variant === 'color' ? '/marketing/logos_marcas_ev/color/' : '/marketing/logos_marcas_ev/';
  const doubledLogos = [...evBrands, ...evBrands];

  return (
    <div className="w-full bg-slate-950 py-10 overflow-hidden relative border-y border-slate-800/80 select-none">
      {/* Edge gradient overlays for smooth fade effect */}
      <div className="absolute top-0 bottom-0 left-0 w-28 z-10 bg-gradient-to-r from-slate-950 to-transparent pointer-events-none" />
      <div className="absolute top-0 bottom-0 right-0 w-28 z-10 bg-gradient-to-l from-slate-950 to-transparent pointer-events-none" />

      {/* Title Header */}
      <div className="text-center mb-6">
        <h3 className="text-xs uppercase tracking-widest font-bold text-emerald-400">
          Compatibilidad Multimarca EV & PHEV en Argentina
        </h3>
      </div>

      {/* Carousel Track (Izquierda a Derecha) */}
      <div className="flex w-full overflow-hidden">
        <div
          className="flex min-w-full shrink-0 gap-8 items-center justify-around animate-scroll-ltr hover:[animation-play-state:paused]"
          style={{ animationDuration: `${speed}s` }}
        >
          {doubledLogos.map((brand, idx) => (
            <div
              key={`${brand.slug}-${idx}`}
              className="flex items-center justify-center h-20 w-44 px-5 py-3 rounded-2xl bg-slate-900/60 border border-slate-800/60 backdrop-blur-md hover:border-emerald-500/60 hover:bg-slate-800/80 hover:shadow-lg hover:shadow-emerald-500/10 transition-all duration-300 group"
            >
              <img
                src={`${folder}${brand.slug}.png`}
                alt={`Logo ${brand.name}`}
                className="max-h-10 max-w-[85%] object-contain filter group-hover:scale-105 transition-transform duration-300"
                loading="lazy"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Keyframe animation for continuous left-to-right infinite loop */}
      <style>{`
        @keyframes scrollLtr {
          0% {
            transform: translateX(-50%);
          }
          100% {
            transform: translateX(0%);
          }
        }
        .animate-scroll-ltr {
          animation: scrollLtr linear infinite;
        }
      `}</style>
    </div>
  );
}
