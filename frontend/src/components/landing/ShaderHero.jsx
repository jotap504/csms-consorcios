// Hero background: the provided blue circuit-pattern image, panned slowly
// via CSS (lp-hero-bg-pan). No WebGL overlay - just the image plus a
// gradient wash so the text panel stays legible.
export default function ShaderHero({ stages, buttons, className = '' }) {
  return (
    <div className={`relative w-full min-h-dvh overflow-hidden bg-[#050b16] ${className}`}>
      <div
        className="lp-hero-bg-pan absolute inset-0 h-full w-full bg-cover bg-center"
        style={{ backgroundImage: 'url(/hero-bg.png)' }}
        aria-hidden="true"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-[#050b16]/40 via-transparent to-[#050b16]/70" aria-hidden="true" />

      <div className="relative z-10 flex min-h-dvh flex-col items-center justify-center px-6 py-24 text-white">
        <div className="mx-auto max-w-4xl text-center">
          <div className="space-y-3">
            {stages.map((stage, i) => (
              <div key={i} className={`lp-hero-fade-up lp-hero-delay-${i + 1}`}>
                <span className="inline-block rounded-2xl bg-[#050b16]/70 px-4 py-1.5 shadow-lg shadow-black/30 backdrop-blur-sm md:px-6 md:py-2">
                  <span
                    className={`lp-heading bg-gradient-to-r bg-clip-text font-bold text-transparent ${
                      stage.emphasis
                        ? 'from-emerald-200 via-cyan-200 to-sky-200 text-2xl md:text-4xl lg:text-5xl'
                        : 'from-sky-200 via-blue-300 to-cyan-200 text-xl md:text-3xl lg:text-4xl'
                    }`}
                  >
                    {stage.text}
                  </span>
                </span>
              </div>
            ))}
          </div>

          {buttons && (
            <div className="lp-hero-fade-up lp-hero-delay-5 mt-8 flex flex-col justify-center gap-4 sm:flex-row">
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
