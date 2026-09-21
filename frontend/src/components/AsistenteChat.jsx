import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Sparkles, X, Send, ArrowRight, Loader2, Wrench, FileText,
} from 'lucide-react';
import { api } from '@/lib/api';

export default function AsistenteChat() {
  const [open, setOpen] = useState(false);
  const [modo, setModo] = useState('ayuda'); // 'ayuda' | 'agente'
  const [ayudaMessages, setAyudaMessages] = useState([]);
  const [agenteMessages, setAgenteMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const scrollRef = useRef(null);

  const enComercial = location.pathname.startsWith('/comercial');
  const modoActivo = enComercial ? modo : 'ayuda';
  const messages = modoActivo === 'agente' ? agenteMessages : ayudaMessages;
  const setMessages = modoActivo === 'agente' ? setAgenteMessages : setAyudaMessages;

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [ayudaMessages, agenteMessages, open, modoActivo]);

  async function handleSend(e) {
    e.preventDefault();
    const mensaje = input.trim();
    if (!mensaje || loading) return;
    setInput('');
    const historial = messages.map(({ role, content }) => ({ role, content }));
    setMessages((prev) => [...prev, { role: 'user', content: mensaje }]);
    setLoading(true);
    try {
      const endpoint = modoActivo === 'agente' ? '/comercial/agente/tarea' : '/asistente/chat';
      const { data } = await api.post(endpoint, { mensaje, historial });
      setMessages((prev) => [...prev, {
        role: 'assistant', content: data.respuesta, navegar_a: data.navegar_a ?? null, informe_id: data.informe_id ?? null,
      }]);
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'No pude responder ahora, proba de nuevo en un rato.' }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed bottom-5 right-5 z-[100] flex flex-col items-end gap-3">
      {open && (
        <div className="flex h-[520px] w-[380px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
          <div className="flex items-center justify-between border-b border-border bg-primary px-4 py-3 text-primary-foreground">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="h-4 w-4" />{modoActivo === 'agente' ? 'Agente de tareas' : 'Asistente'}
            </div>
            <button type="button" onClick={() => setOpen(false)} className="cursor-pointer opacity-80 hover:opacity-100">
              <X className="h-4 w-4" />
            </button>
          </div>

          {enComercial && (
            <div className="flex gap-1 border-b border-border bg-muted/40 p-1.5">
              <button
                type="button"
                onClick={() => setModo('ayuda')}
                className={`flex-1 cursor-pointer rounded-lg px-2 py-1.5 text-xs font-medium ${modo === 'ayuda' ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}
              >
                Ayuda
              </button>
              <button
                type="button"
                onClick={() => setModo('agente')}
                className={`flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium ${modo === 'agente' ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}
              >
                <Wrench className="h-3 w-3" />Agente de tareas
              </button>
            </div>
          )}

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3">
            {messages.length === 0 && (
              <p className="mt-4 text-center text-sm text-muted-foreground">
                {modoActivo === 'agente'
                  ? 'Pedime que busque contactos, te resuma uno, o genere un reporte del embudo.'
                  : 'Preguntame donde hacer algo, o pedime que te explique un paso a paso.'}
              </p>
            )}
            <div className="flex flex-col gap-2">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] whitespace-pre-line rounded-xl px-3 py-2 text-sm ${
                      m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
                    }`}
                  >
                    {m.content}
                    {m.navegar_a && (
                      <button
                        type="button"
                        onClick={() => navigate(m.navegar_a)}
                        className="mt-2 flex cursor-pointer items-center gap-1 rounded-lg bg-card/90 px-2 py-1 text-xs font-medium text-primary hover:bg-card"
                      >
                        Ir ahora <ArrowRight className="h-3 w-3" />
                      </button>
                    )}
                    {m.informe_id && (
                      <button
                        type="button"
                        onClick={() => { navigate('/comercial/informes-generados'); setOpen(false); }}
                        className="mt-2 flex cursor-pointer items-center gap-1 rounded-lg bg-card/90 px-2 py-1 text-xs font-medium text-primary hover:bg-card"
                      >
                        <FileText className="h-3 w-3" />Ver informes generados
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2 text-sm text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />Pensando...
                  </div>
                </div>
              )}
            </div>
          </div>

          <form onSubmit={handleSend} className="flex items-center gap-2 border-t border-border p-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Escribi tu pregunta..."
              className="h-10 flex-1 rounded-lg border border-border px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-14 w-14 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105"
        aria-label="Asistente"
      >
        {open ? <X className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
      </button>
    </div>
  );
}
