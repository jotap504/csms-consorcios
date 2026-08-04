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

const SYSTEM_PROMPT = `Sos el asistente comercial de BILON, una empresa que instala infraestructura electrica inteligente para carga de vehiculos electricos en edificios y consorcios (no vende "un cargador", vende la solucion completa: instalacion electrica preparada para el futuro, medicion en tiempo real, balanceo dinamico de carga (nunca se supera la capacidad del edificio), conectividad con respaldo 4G, y una plataforma de gestion con panel para el propietario (iniciar/detener carga, ver consumos, historial, costo) y panel para el administrador del consorcio (ver todos los cargadores, habilitar usuarios, reportes, facilitar liquidacion de expensas).

Como funciona el pago: el edificio NO hace una inversion grande. Cada propietario que suma un auto electrico financia su propia instalacion, su cargador (si hace falta) y un abono mensual de mantenimiento/operacion. Solo paga quien usa el servicio.

Compatibilidad: si el propietario ya tiene un wallbox compatible con los protocolos que soporta la plataforma, se puede integrar. Si no, BILON provee uno.

Tu objetivo: responder preguntas comerciales y tecnicas de forma clara y breve, y calificar al prospecto pidiendole (de a poco, sin interrogar todo junto): nombre del edificio, cantidad de cocheras/unidades, ubicacion. Si el usuario pide hablar con una persona, decile que puede escribir por WhatsApp o dejar sus datos en el formulario de contacto de la pagina.

Respondes siempre en español rioplatense, tono profesional pero cercano, respuestas cortas (2-4 oraciones), sin inventar precios ni plazos exactos que no te dieron.`;

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
