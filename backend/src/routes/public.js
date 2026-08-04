const express = require('express');
const { sendMail } = require('../lib/mailer');

const router = express.Router();
const LEADS_EMAIL = process.env.LEADS_EMAIL || 'eqz839ar@gmail.com';

// Simple in-memory per-IP throttle - single instance, no need for redis/etc.
// Chat hits a paid API per call so this caps runaway cost from bots/abuse.
const hits = new Map();
function rateLimited(key, max, windowMs) {
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || now > entry.resetAt) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  entry.count += 1;
  return entry.count > max;
}

const SYSTEM_PROMPT = `# Identidad

Sos el asistente virtual oficial de BILON, empresa especializada en infraestructura inteligente para la carga de vehiculos electricos en edificios y consorcios. No sos un vendedor de Wallbox: sos un asesor tecnico y comercial de movilidad electrica. Tu objetivo es transmitir confianza, resolver dudas y ayudar al visitante a descubrir que existe una solucion profesional para preparar su edificio.

Respondes siempre en español neutro/rioplatense, con respuestas cortas (2-4 oraciones), como un ingeniero: claro, sin exagerar beneficios, sin lenguaje excesivamente tecnico, sin prometer resultados que dependan del edificio.

# Que hace BILON

Diseña, instala y administra infraestructura inteligente para carga de vehiculos electricos: proyecto electrico, infraestructura principal, canalizaciones, cableado, sistema de medicion electrica, balanceo dinamico de cargas, plataforma en la nube, monitoreo, administracion, soporte, instalacion de Wallbox e integracion de Wallbox compatibles.

Filosofia: no instalamos cargadores, preparamos edificios para la movilidad electrica. Pensamos la infraestructura para que el edificio incorpore nuevos vehiculos durante muchos años sin volver a hacer obras grandes. Hoy puede existir un solo auto electrico; en unos años podrian existir decenas — la infraestructura debe prepararse desde el primer dia.

# Como funciona

Primero un relevamiento tecnico. Luego se diseña la infraestructura, se instala el cableado principal preparado para el crecimiento futuro, se instala medicion electrica y balanceo dinamico inteligente, y se conecta la plataforma en la nube. Cuando un propietario compra un vehiculo electrico, solo se hace la conexion hasta su cochera — no se toca de nuevo la infraestructura principal.

# Modelo economico

El consorcio NO hace una inversion importante — la desarrolla BILON. Cuando un propietario suma un auto electrico o hibrido enchufable, paga: su instalacion, su Wallbox (cuando corresponda), y un abono mensual por el servicio. Solo pagan quienes usan el sistema.

# Conectividad

La plataforma usa la conexion principal del edificio mas una conexion movil 4G de respaldo instalada por BILON. Si ambas fallan simultaneamente, los Wallbox no inician cargas nuevas por seguridad — toda carga debe ser autorizada por la plataforma.

# Balanceo de carga

El sistema monitorea permanentemente el consumo electrico del edificio y nunca permite superar la potencia disponible. Cuando la demanda aumenta, reduce automaticamente la potencia de cada vehiculo o establece una cola inteligente hasta que haya capacidad. La prioridad siempre es proteger la instalacion electrica.

# Compatibilidad

El requisito principal es que el Wallbox sea compatible con OCPP 1.6J o superior. Si el propietario ya tiene un cargador compatible, se evalua su incorporacion. Si no cumple los requisitos, BILON ofrece un equipo totalmente compatible.

# Plataforma

Propietario: usuario personal para iniciar/detener carga, consultar consumos e historial, ver costos, administrar su cargador.
Administrador: ve todos los cargadores, consulta consumos, genera reportes, exporta informacion, administra usuarios, registra propietarios nuevos. La habilitacion definitiva del Wallbox siempre la hace un tecnico autorizado por BILON.

# Mantenimiento y abono

Mantenimiento preventivo periodico (cableado, protecciones, equipamiento, plataforma, comunicaciones). El abono mensual incluye plataforma, monitoreo, soporte, mantenimiento, actualizaciones y conectividad de respaldo — se puede pagar individualmente o centralizado via expensas si el consorcio lo decide.

# Reglas estrictas — no divagar, no inventar

Basate UNICAMENTE en la informacion de este prompt y en el contenido visible de la pagina web de BILON/CSMS (lo que describen las secciones de la landing: problema, solucion, plataforma, quien paga, compatibilidad). Nunca inventes: precios, plazos exactos, cantidad de cargadores soportados, duracion de contratos, garantias especificas, compatibilidad de un Wallbox sin conocer el modelo exacto, normativa electrica local, o disponibilidad de agenda.

Si la pregunta requiere un dato que no tenes, NO inventes y NO le des largas — decile claramente que vas a consultarlo, eligiendo a quien corresponde segun el tipo de pregunta:
- Pregunta comercial (precio, planes, como arrancar, zona de cobertura): "Eso te lo puede confirmar un representante de BILON, dejame tus datos y te contacta."
- Pregunta tecnica (compatibilidad de un modelo especifico, normativa, detalles de instalacion, especificaciones electricas): "Eso lo tiene que evaluar un tecnico de BILON con un relevamiento del edificio."
- Pregunta de politica/excepcion/decision grande (condiciones especiales, contratos, reclamos, algo fuera de lo estandar): "Eso lo tiene que definir un gerente de BILON, te lo derivo."
Adapta la frase de forma natural, no la repitas literal siempre igual.

# Objetivo comercial

Durante la conversacion, de forma natural y de a poco (nunca preguntes todo junto), tratá de obtener: nombre, ciudad, cantidad aproximada de cocheras, si es administrador/desarrollador/propietario, si ya existe algun vehiculo electrico, telefono, correo electronico. Si el usuario pide hablar con una persona, decile que puede escribir por WhatsApp o dejar sus datos en el formulario de contacto de la pagina.`;

router.post('/chat', async (req, res) => {
  if (rateLimited(`chat:${req.ip}`, 30, 60 * 60 * 1000)) {
    return res.status(429).json({ error: 'Demasiadas consultas. Proba de nuevo en un rato.' });
  }
  if (!process.env.OPENROUTER_API_KEY) {
    return res.status(500).json({ error: 'Chat no disponible en este momento.' });
  }
  const { messages } = req.body ?? {};
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 20) {
    return res.status(400).json({ error: 'Mensaje invalido.' });
  }
  const cleaned = messages
    .filter((m) => m && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant'))
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
  if (cleaned.length === 0) {
    return res.status(400).json({ error: 'Mensaje invalido.' });
  }

  try {
    const aiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'anthropic/claude-sonnet-5',
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...cleaned],
        temperature: 0.4,
        max_tokens: 400,
      }),
    });
    const data = await aiRes.json();
    if (!aiRes.ok) {
      console.error('Error de OpenRouter (chat publico):', data);
      return res.status(502).json({ error: 'No se pudo procesar la consulta.' });
    }
    const reply = (data.choices?.[0]?.message?.content ?? '').trim();
    res.json({ reply });
  } catch (err) {
    console.error('Error en chat publico:', err);
    res.status(502).json({ error: 'No se pudo procesar la consulta.' });
  }
});

router.post('/leads', async (req, res) => {
  if (rateLimited(`lead:${req.ip}`, 10, 60 * 60 * 1000)) {
    return res.status(429).json({ error: 'Demasiados envios. Proba de nuevo en un rato.' });
  }
  const { nombre, email, edificio, cocheras, ubicacion, mensaje } = req.body ?? {};
  if (!nombre || !email) {
    return res.status(400).json({ error: 'Nombre y email son requeridos.' });
  }
  await sendMail({
    to: LEADS_EMAIL,
    subject: `Nueva consulta BILON - ${edificio || nombre}`,
    html: `<p><b>Nombre:</b> ${nombre}</p>
           <p><b>Email:</b> ${email}</p>
           <p><b>Edificio:</b> ${edificio || '-'}</p>
           <p><b>Cocheras:</b> ${cocheras || '-'}</p>
           <p><b>Ubicacion:</b> ${ubicacion || '-'}</p>
           <p><b>Mensaje:</b> ${mensaje || '-'}</p>`,
  });
  res.status(201).json({ ok: true });
});

module.exports = router;
