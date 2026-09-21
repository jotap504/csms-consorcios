const BRANDS = [
  'byd', 'baic', 'renault', 'nissan', 'volvo', 'bmw',
  'mercedes-benz', 'audi', 'ford', 'peugeot', 'toyota', 'chery',
  'coradir', 'volt-motors', 'sero-electric', 'hyundai', 'porsche',
];

// Carrusel infinito de logos de marcas EV/PHEV (adaptado de
// marketing/carousel_demo.html) - loop CSS puro (sin JS por frame), la
// lista se duplica una vez y el keyframe recorre solo el primer 50% del
// ancho para que el "corte" quede invisible.
export default function BrandsCarousel() {
  const doubled = [...BRANDS, ...BRANDS];
  return (
    <div className="relative overflow-hidden rounded-2xl border border-[var(--lp-border)] bg-[var(--lp-surface)] py-8">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-[var(--lp-surface)] to-transparent sm:w-36" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-[var(--lp-surface)] to-transparent sm:w-36" />
      <div className="lp-carousel-track flex w-max gap-6">
        {doubled.map((b, i) => (
          <div
            // eslint-disable-next-line react/no-array-index-key
            key={`${b}-${i}`}
            className="flex h-20 w-40 shrink-0 items-center justify-center rounded-xl border border-[var(--lp-border)] bg-white px-5 py-3 transition-transform hover:-translate-y-1"
          >
            <img src={`/logos-marcas-ev/${b}.png`} alt={`Logo ${b}`} loading="lazy" className="max-h-full max-w-full object-contain" />
          </div>
        ))}
      </div>
    </div>
  );
}
