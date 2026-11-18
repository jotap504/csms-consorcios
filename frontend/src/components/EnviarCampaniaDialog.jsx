import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Send, Megaphone, Trash2, Plus, Zap, Gauge, Turtle, Settings2, ArrowLeft, ArrowRight,
} from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import {
  Button, Input,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui';

const RAMP_NORMAL = [200, 200, 400, 400, 600, 600, 1000, 1000];

function buildFlat(rate, total) {
  const dias = Math.max(Math.ceil(total / Math.max(rate, 1)), 1);
  return Array(dias).fill(rate);
}

function velocidades(total) {
  return [
    { id: 'lento', label: 'Lento', icon: Turtle, desc: '100/día. Más seguro para dominios nuevos.', build: () => buildFlat(100, total) },
    { id: 'normal', label: 'Normal', icon: Gauge, desc: 'Sube de a poco, de 200 a 1000/día.', build: () => RAMP_NORMAL },
    { id: 'rapido', label: 'Rápido', icon: Zap, desc: 'Todo junto, dentro del horario elegido.', build: () => [Math.max(total, 1)] },
    { id: 'personalizado', label: 'Personalizado', icon: Settings2, desc: 'Elegís vos cuánto mandar cada día.', build: null },
  ];
}

export default function EnviarCampaniaDialog({ open, onOpenChange, contactoIds, campaniaInicialId, onEnviado }) {
  const total = contactoIds.length;
  const [step, setStep] = useState('campania');
  const [campanias, setCampanias] = useState([]);
  const [filtroCampania, setFiltroCampania] = useState('');
  const [campaniasLoading, setCampaniasLoading] = useState(false);
  const [campaniasError, setCampaniasError] = useState(false);
  const [campaniaElegidaId, setCampaniaElegidaId] = useState(null);
  const [velocidad, setVelocidad] = useState('normal');
  const [rampSchedule, setRampSchedule] = useState(RAMP_NORMAL);
  const [horaInicio, setHoraInicio] = useState('09:00');
  const [horaFin, setHoraFin] = useState('19:00');
  const [cuando, setCuando] = useState('ahora');
  const [iniciaEn, setIniciaEn] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFiltroCampania('');
    setVelocidad('normal');
    setRampSchedule(RAMP_NORMAL);
    setHoraInicio('09:00');
    setHoraFin('19:00');
    setCuando('ahora');
    setIniciaEn('');
    setCampaniaElegidaId(campaniaInicialId || null);
    setStep(campaniaInicialId ? 'config' : 'campania');
    setCampaniasLoading(true);
    setCampaniasError(false);
    api.get('/comercial/campanias')
      .then(({ data }) => setCampanias(data))
      .catch(() => { setCampaniasError(true); toast.error('No se pudieron cargar las campañas.'); })
      .finally(() => setCampaniasLoading(false));
  }, [open, campaniaInicialId]);

  function elegirVelocidad(id) {
    setVelocidad(id);
    const preset = velocidades(total).find((v) => v.id === id);
    if (preset?.build) setRampSchedule(preset.build());
  }

  function actualizarDia(idx, valor) {
    const n = Number(valor);
    setRampSchedule((prev) => prev.map((v, i) => (i === idx ? (Number.isFinite(n) && n > 0 ? n : 0) : v)));
  }
  function agregarDia() { setRampSchedule((prev) => [...prev, 100]); }
  function quitarDia(idx) { setRampSchedule((prev) => prev.filter((_, i) => i !== idx)); }

  const totalProgramado = rampSchedule.reduce((a, b) => a + (b || 0), 0);
  const campaniaElegida = campanias.find((c) => c.id === campaniaElegidaId);
  const campaniasFiltradas = campanias.filter((c) => (
    !filtroCampania || `${c.asunto} ${c.resumen || ''}`.toLowerCase().includes(filtroCampania.toLowerCase())
  ));

  async function handleEnviar() {
    if (!campaniaElegidaId) return;
    setEnviando(true);
    try {
      const { data } = await api.post(`/comercial/campanias/${campaniaElegidaId}/envios`, {
        contacto_ids: contactoIds,
        ramp_schedule: rampSchedule.filter((n) => n > 0),
        hora_inicio: horaInicio,
        hora_fin: horaFin,
        inicia_en: cuando === 'programado' && iniciaEn ? new Date(iniciaEn).toISOString() : undefined,
      });
      onEnviado(data);
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo enviar la campaña.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        {step === 'campania' && (
          <>
            <DialogHeader>
              <DialogTitle>1. Elegir campaña</DialogTitle>
              <DialogDescription>Se va a mandar a {total} contacto(s) seleccionado(s) (se omiten los marcados &quot;No contactar&quot; o sin email).</DialogDescription>
            </DialogHeader>
            {campaniasLoading && <p className="text-sm text-muted-foreground">Cargando...</p>}
            {!campaniasLoading && campaniasError && (
              <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-destructive">
                <Megaphone className="h-8 w-8 opacity-40" />
                No se pudieron cargar las campañas (error de red o sesion vencida).
              </div>
            )}
            {!campaniasLoading && !campaniasError && campanias.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
                <Megaphone className="h-8 w-8 opacity-40" />
                Todavia no creaste ninguna campaña.
                <Link to="/comercial/campanias" className="font-medium text-accent hover:underline">Crear una campaña →</Link>
              </div>
            )}
            {!campaniasLoading && !campaniasError && campanias.length > 0 && (
              <div className="flex flex-col gap-3">
                {campanias.length > 5 && (
                  <Input placeholder="Buscar campaña..." value={filtroCampania} onChange={(e) => setFiltroCampania(e.target.value)} />
                )}
                <div className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
                  {campaniasFiltradas.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setCampaniaElegidaId(c.id)}
                      className={`rounded-lg border p-2.5 text-left text-sm transition-colors ${c.id === campaniaElegidaId ? 'border-accent bg-accent/10' : 'border-border hover:bg-muted/50'}`}
                    >
                      <p className="font-medium">{c.asunto}</p>
                      <p className="truncate text-xs text-muted-foreground">{c.resumen}</p>
                    </button>
                  ))}
                </div>
                <Link to="/comercial/campanias" className="text-xs font-medium text-accent hover:underline">+ Crear otra campaña</Link>
                <Button className="self-end" disabled={!campaniaElegidaId} onClick={() => setStep('config')}>
                  Siguiente<ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </>
        )}

        {step === 'config' && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                {!campaniaInicialId && (
                  <Button size="sm" variant="ghost" className="h-7 px-1.5" onClick={() => setStep('campania')}>
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                )}
                <DialogTitle>2. Configurar envío</DialogTitle>
              </div>
              <DialogDescription>&quot;{campaniaElegida?.asunto}&quot; a {total} contacto(s).</DialogDescription>
            </DialogHeader>

            <div className="flex max-h-[65vh] flex-col gap-4 overflow-y-auto pr-1">
              <div>
                <p className="mb-1.5 text-sm font-medium">Velocidad de envío</p>
                <div className="grid grid-cols-2 gap-2">
                  {velocidades(total).map((v) => {
                    const Icon = v.icon;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => elegirVelocidad(v.id)}
                        className={`flex flex-col gap-1 rounded-lg border p-2.5 text-left transition-colors ${velocidad === v.id ? 'border-accent bg-accent/10' : 'border-border hover:bg-muted/50'}`}
                      >
                        <span className="flex items-center gap-1.5 text-sm font-medium"><Icon className="h-3.5 w-3.5" />{v.label}</span>
                        <span className="text-xs text-muted-foreground">{v.desc}</span>
                      </button>
                    );
                  })}
                </div>
                {velocidad === 'personalizado' ? (
                  <div className="mt-2 flex flex-col gap-2 rounded-lg border border-border p-3">
                    {rampSchedule.map((cantidad, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="w-14 shrink-0 text-xs text-muted-foreground">Día {i + 1}</span>
                        <Input type="number" min={1} value={cantidad} onChange={(e) => actualizarDia(i, e.target.value)} className="h-8 w-24" />
                        <Button size="sm" variant="ghost" onClick={() => quitarDia(i)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    ))}
                    <Button size="sm" variant="outline" onClick={agregarDia} className="self-start"><Plus className="h-3.5 w-3.5" />Agregar día</Button>
                    <p className="text-xs text-muted-foreground">
                      Programados: {totalProgramado} de {total}.
                      {totalProgramado < total && ` El resto (${total - totalProgramado}) se manda el día ${rampSchedule.length + 1}.`}
                    </p>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Se reparte en {rampSchedule.length} día(s): {rampSchedule.join(' · ')}.
                  </p>
                )}
              </div>

              <div>
                <p className="mb-1.5 text-sm font-medium">Horario de envío (Argentina)</p>
                <div className="flex items-center gap-2">
                  <Input type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} className="h-9 w-28" />
                  <span className="text-xs text-muted-foreground">a</span>
                  <Input type="time" value={horaFin} onChange={(e) => setHoraFin(e.target.value)} className="h-9 w-28" />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">El lote de cada día se reparte dentro de esa ventana en vez de mandarse todo junto.</p>
              </div>

              <div>
                <p className="mb-1.5 text-sm font-medium">¿Cuándo arranca?</p>
                <div className="flex gap-2">
                  <Button size="sm" variant={cuando === 'ahora' ? 'default' : 'outline'} onClick={() => { setCuando('ahora'); setIniciaEn(''); }}>Ahora</Button>
                  <Button size="sm" variant={cuando === 'programado' ? 'default' : 'outline'} onClick={() => setCuando('programado')}>Programar fecha</Button>
                </div>
                {cuando === 'programado' && (
                  <Input type="datetime-local" value={iniciaEn} onChange={(e) => setIniciaEn(e.target.value)} className="mt-2 h-9 w-auto" />
                )}
              </div>

              <Button
                loading={enviando}
                disabled={total === 0 || (cuando === 'programado' && !iniciaEn)}
                onClick={handleEnviar}
              >
                <Send className="h-4 w-4" />
                {cuando === 'programado' ? 'Programar envío' : `Enviar a ${total} contacto(s)`}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
