// Logo con variante para cada tema: /logo.png (marca oscura, para fondos
// claros) y /logo-dark.png (version recortada de "marketing/logo bilon
// negro.png", marca blanca/celeste, para fondos oscuros). El swap es puro
// CSS (dark:/light: ya configurado via @custom-variant en index.css), asi
// que sigue al toggle de tema sin JS extra ni parpadeo.
//
// className (tamano + visibilidad responsive, ej. "hidden h-7 w-auto
// md:block") va en el wrapper; los <img> adentro solo heredan la altura y
// se ocultan/muestran entre si segun el tema - separarlo asi evita mezclar
// 3 variantes (responsive + tema) en un mismo elemento, que es fragil.
export default function Logo({ className = '', alt = 'Bilon Smart Buildings' }) {
  return (
    <span className={`inline-flex ${className}`}>
      <img src="/logo.png" alt={alt} className="h-full w-auto dark:hidden" />
      <img src="/logo-dark.png" alt={alt} className="hidden h-full w-auto dark:block" />
    </span>
  );
}
