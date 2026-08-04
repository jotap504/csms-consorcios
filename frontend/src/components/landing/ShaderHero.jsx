// Hero background: static blue "circuit board" energy-pattern image (client
// asset) instead of the earlier WebGL2 fragment-shader clouds. Much simpler
// and lighter than the shader version - no canvas, no GL context, nothing to
// fail silently on older browsers/GPUs. A slow, subtle pan+zoom keeps the
// hero feeling alive without touching layout-affecting CSS properties (see
// the horizontal-overflow bug this page already shipped once from an
// animation that did).
export default function ShaderHero({ headline, subtitle, buttons, className = '' }) {
  return (
    <div className={`relative w-full min-h-dvh overflow-hidden bg-[#050b16] ${className}`}>
      <div
        className="lp-hero-bg-pan absolute inset-0 h-full w-full bg-cover bg-center"
        style={{ backgroundImage: 'url(/hero-bg.png)' }}
        aria-hidden="true"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-[#050b16]/70 via-[#050b16]/40 to-[#050b16]/80" aria-hidden="true" />

      <div className="relative z-10 flex min-h-dvh flex-col items-center justify-center px-6 py-24 text-white">
        <div className="mx-auto max-w-5xl space-y-6 text-center">
          <div className="space-y-1">
            <h1 className="lp-hero-fade-up lp-hero-delay-1 lp-heading bg-gradient-to-r from-sky-200 via-blue-300 to-cyan-200 bg-clip-text text-4xl font-bold text-transparent md:text-6xl lg:text-7xl">
              {headline.line1}
            </h1>
            <h1 className="lp-hero-fade-up lp-hero-delay-2 lp-heading bg-gradient-to-r from-blue-300 via-cyan-300 to-sky-200 bg-clip-text text-4xl font-bold text-transparent md:text-6xl lg:text-7xl">
              {headline.line2}
            </h1>
          </div>

          <div className="lp-hero-fade-up lp-hero-delay-3 mx-auto max-w-2xl">
            <p className="text-lg leading-relaxed font-light text-sky-100/80 md:text-xl">
              {subtitle}
            </p>
          </div>

          {buttons && (
            <div className="lp-hero-fade-up lp-hero-delay-4 mt-8 flex flex-col justify-center gap-4 sm:flex-row">
              {buttons.primary && (
                <button
                  type="button"
                  onClick={buttons.primary.onClick}
                  className="cursor-pointer rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 px-8 py-4 text-lg font-semibold text-white transition-all duration-300 hover:scale-105 hover:from-blue-600 hover:to-cyan-600 hover:shadow-xl hover:shadow-blue-500/25"
                >
                  {buttons.primary.text}
                </button>
              )}
              {buttons.secondary && (
                <button
                  type="button"
                  onClick={buttons.secondary.onClick}
                  className="cursor-pointer rounded-full border border-sky-300/30 bg-sky-950/50 px-8 py-4 text-lg font-semibold text-sky-100 transition-all duration-300 hover:scale-105 hover:border-sky-300/50 hover:bg-sky-900/60"
                >
                  {buttons.secondary.text}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
