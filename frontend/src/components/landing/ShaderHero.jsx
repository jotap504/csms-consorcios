import { useRef, useEffect } from 'react';

// Hero background: the provided blue circuit-pattern image sits behind a
// transparent WebGL2 canvas that renders only the moving "energy particle"
// streaks (the cloud/fog noise from the original shader was dropped - it's
// still used as a seed for the glow term below, just never painted as an
// opaque background wash). touch-action is pan-y, not none - a full-
// viewport canvas with touch-none would swallow the vertical swipe and
// re-lock mobile scroll (this page already shipped that bug once).
const vertexSrc = `#version 300 es
precision highp float;
in vec4 position;
void main(){gl_Position=position;}`;

const fragmentSrc = `#version 300 es
/*********
* made by Matthias Hurrle (@atzedent)
* adapted: transparent background, blue palette, particles only (BILON)
*/
precision highp float;
out vec4 O;
uniform vec2 resolution;
uniform float time;
#define FC gl_FragCoord.xy
#define T time
#define R resolution
#define MN min(R.x,R.y)
float rnd(vec2 p) {
  p=fract(p*vec2(12.9898,78.233));
  p+=dot(p,p+34.56);
  return fract(p.x*p.y);
}
float noise(in vec2 p) {
  vec2 i=floor(p), f=fract(p), u=f*f*(3.-2.*f);
  float
  a=rnd(i),
  b=rnd(i+vec2(1,0)),
  c=rnd(i+vec2(0,1)),
  d=rnd(i+1.);
  return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);
}
float fbm(vec2 p) {
  float t=.0, a=1.; mat2 m=mat2(1.,-.5,.2,1.2);
  for (int i=0; i<5; i++) {
    t+=a*noise(p);
    p*=2.*m;
    a*=.5;
  }
  return t;
}
float clouds(vec2 p) {
    float d=1., t=.0;
    for (float i=.0; i<3.; i++) {
        float a=d*fbm(i*10.+p.x*.2+.2*(1.+i)*p.y+d+i*i+p);
        t=mix(t,d,a);
        d=a;
        p*=2./(i+1.);
    }
    return t;
}
void main(void) {
    vec2 uv=(FC-.5*R)/MN,st=uv*vec2(2,1);
    vec3 col=vec3(0);
    float bg=clouds(vec2(st.x+T*.5,-st.y));
    uv*=1.-.3*(sin(T*.2)*.5+.5);
    for (float i=1.; i<12.; i++) {
        uv+=.1*cos(i*vec2(.1+.01*i, .8)+i*i+T*.5+.1*uv.x);
        vec2 p=uv;
        float d=length(p);
        col+=.0011/d*(vec3(.15,.45,.95)+.12*cos(sin(i)*vec3(0,1,2)));
        float b=noise(i+p+bg*1.731);
        col+=.0016*b/length(max(p,vec2(b*p.x*.02,p.y)));
    }
    float a=clamp(max(col.r,max(col.g,col.b))*1.4,0.0,1.0);
    O=vec4(col,a);
}`;

class WebGLRenderer {
  constructor(canvas, scale) {
    this.canvas = canvas;
    this.scale = scale;
    this.program = null;
    this.vs = null;
    this.fs = null;
    this.buffer = null;
    this.vertices = [-1, 1, -1, -1, 1, 1, 1, -1];
    this.mouseMove = [0, 0];
    this.mouseCoords = [0, 0];
    this.pointerCoords = [0, 0];
    this.nbrOfPointers = 0;
    this.gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: false });
    if (!this.gl) throw new Error('WebGL2 not supported');
    this.gl.viewport(0, 0, canvas.width * scale, canvas.height * scale);
    this.gl.enable(this.gl.BLEND);
    this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
  }

  updateMove(deltas) { this.mouseMove = deltas; }
  updateMouse(coords) { this.mouseCoords = coords; }
  updatePointerCoords(coords) { this.pointerCoords = coords; }
  updatePointerCount(nbr) { this.nbrOfPointers = nbr; }

  updateScale(scale) {
    this.scale = scale;
    this.gl.viewport(0, 0, this.canvas.width * scale, this.canvas.height * scale);
  }

  compile(shader, source) {
    const gl = this.gl;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compilation error:', gl.getShaderInfoLog(shader));
    }
  }

  reset() {
    const gl = this.gl;
    if (this.program && !gl.getProgramParameter(this.program, gl.DELETE_STATUS)) {
      if (this.vs) { gl.detachShader(this.program, this.vs); gl.deleteShader(this.vs); }
      if (this.fs) { gl.detachShader(this.program, this.fs); gl.deleteShader(this.fs); }
      gl.deleteProgram(this.program);
    }
  }

  setup() {
    const gl = this.gl;
    this.vs = gl.createShader(gl.VERTEX_SHADER);
    this.fs = gl.createShader(gl.FRAGMENT_SHADER);
    this.compile(this.vs, vertexSrc);
    this.compile(this.fs, fragmentSrc);
    this.program = gl.createProgram();
    gl.attachShader(this.program, this.vs);
    gl.attachShader(this.program, this.fs);
    gl.linkProgram(this.program);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(this.program));
    }
  }

  init() {
    const gl = this.gl;
    const program = this.program;
    this.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.vertices), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    program.resolution = gl.getUniformLocation(program, 'resolution');
    program.time = gl.getUniformLocation(program, 'time');
    program.move = gl.getUniformLocation(program, 'move');
    program.touch = gl.getUniformLocation(program, 'touch');
    program.pointerCount = gl.getUniformLocation(program, 'pointerCount');
    program.pointers = gl.getUniformLocation(program, 'pointers');
  }

  render(now = 0) {
    const gl = this.gl;
    const program = this.program;
    if (!program || gl.getProgramParameter(program, gl.DELETE_STATUS)) return;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.uniform2f(program.resolution, this.canvas.width, this.canvas.height);
    gl.uniform1f(program.time, now * 1e-3);
    gl.uniform2f(program.move, ...this.mouseMove);
    gl.uniform2f(program.touch, ...this.mouseCoords);
    gl.uniform1i(program.pointerCount, this.nbrOfPointers);
    gl.uniform2fv(program.pointers, this.pointerCoords);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}

class PointerHandler {
  constructor(element, scale) {
    this.scale = scale;
    this.active = false;
    this.pointers = new Map();
    this.lastCoords = [0, 0];
    this.moves = [0, 0];

    const map = (el, s, x, y) => [x * s, el.height - y * s];

    element.addEventListener('pointerdown', (e) => {
      this.active = true;
      this.pointers.set(e.pointerId, map(element, this.scale, e.clientX, e.clientY));
    });
    element.addEventListener('pointerup', (e) => {
      if (this.count === 1) this.lastCoords = this.first;
      this.pointers.delete(e.pointerId);
      this.active = this.pointers.size > 0;
    });
    element.addEventListener('pointerleave', (e) => {
      if (this.count === 1) this.lastCoords = this.first;
      this.pointers.delete(e.pointerId);
      this.active = this.pointers.size > 0;
    });
    element.addEventListener('pointermove', (e) => {
      if (!this.active) return;
      this.lastCoords = [e.clientX, e.clientY];
      this.pointers.set(e.pointerId, map(element, this.scale, e.clientX, e.clientY));
      this.moves = [this.moves[0] + e.movementX, this.moves[1] + e.movementY];
    });
  }

  updateScale(scale) { this.scale = scale; }
  get count() { return this.pointers.size; }
  get move() { return this.moves; }
  get coords() { return this.pointers.size > 0 ? Array.from(this.pointers.values()).flat() : [0, 0]; }
  get first() { return this.pointers.values().next().value || this.lastCoords; }
}

function useShaderBackground() {
  const canvasRef = useRef(null);
  const animationFrameRef = useRef();
  const rendererRef = useRef(null);
  const pointersRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dpr = Math.max(1, 0.5 * window.devicePixelRatio);

    function resize() {
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      rendererRef.current?.updateScale(dpr);
    }

    let renderer;
    try {
      renderer = new WebGLRenderer(canvas, dpr);
    } catch {
      return; // no WebGL2 - the background image behind the canvas stays visible on its own
    }
    rendererRef.current = renderer;
    pointersRef.current = new PointerHandler(canvas, dpr);
    renderer.setup();
    renderer.init();
    resize();

    function loop(now) {
      if (!rendererRef.current || !pointersRef.current) return;
      rendererRef.current.updateMouse(pointersRef.current.first);
      rendererRef.current.updatePointerCount(pointersRef.current.count);
      rendererRef.current.updatePointerCoords(pointersRef.current.coords);
      rendererRef.current.updateMove(pointersRef.current.move);
      rendererRef.current.render(now);
      if (!reducedMotion) animationFrameRef.current = requestAnimationFrame(loop);
    }
    loop(0);

    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('resize', resize);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      rendererRef.current?.reset();
    };
  }, []);

  return canvasRef;
}

export default function ShaderHero({ headline, subtitle, buttons, className = '' }) {
  const canvasRef = useShaderBackground();

  return (
    <div className={`relative w-full min-h-dvh overflow-hidden bg-[#050b16] ${className}`}>
      <div
        className="lp-hero-bg-pan absolute inset-0 h-full w-full bg-cover bg-center"
        style={{ backgroundImage: 'url(/hero-bg.png)' }}
        aria-hidden="true"
      />
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full object-cover"
        style={{ touchAction: 'pan-y' }}
        aria-hidden="true"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-[#050b16]/40 via-transparent to-[#050b16]/70" aria-hidden="true" />

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
