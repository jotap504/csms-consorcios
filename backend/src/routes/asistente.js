// Asistente de navegacion/ayuda, disponible para cualquier usuario logueado
// en toda la web. Solo sugiere rutas reales (filtradas por rol) y explica
// pasos - no ejecuta ninguna accion sobre la base de datos. El agente de
// tareas mas complejo (que si actua sobre datos) vive aparte, en
// /comercial, con su propio set acotado de herramientas.

const express = require('express');
const { authenticate } = require('../auth/middleware');

const router = express.Router();
router.use(authenticate);

const RUTAS = [
  { ruta: '/superadmin', roles: ['superadmin'], desc: 'Dashboard general: resumen de instalaciones, cargadores conectados, accesos rapidos a todos los modulos.' },
  { ruta: '/superadmin/edificios', roles: ['superadmin'], desc: 'Locaciones: alta y gestion de consorcios/edificios/instalaciones.' },
  { ruta: '/superadmin/cargadores', roles: ['superadmin'], desc: 'Vista global de todos los cargadores OCPP en tiempo real (online/offline, estado de carga).' },
  { ruta: '/superadmin/fabricas', roles: ['superadmin'], desc: 'Fabricantes probando sus equipos OCPP (cuentas de testing, no son clientes reales).' },
  { ruta: '/superadmin/proveedores', roles: ['superadmin'], desc: 'Proveedores comerciales reales: empresas de las que se compra material, historial de compras.' },
  { ruta: '/superadmin/stock', roles: ['superadmin', 'instalador'], desc: 'Stock de productos y materiales: ingresos, movimientos, disponibilidad.' },
  { ruta: '/superadmin/catalogo', roles: ['superadmin'], desc: 'Catalogo de abonos: plantillas de items para facturacion recurrente a consorcios.' },
  { ruta: '/superadmin/contabilidad', roles: ['superadmin'], desc: 'Contabilidad interna del negocio: cuentas bancarias/caja, gastos, movimientos, estado de resultado, balance.' },
  { ruta: '/comercial', roles: ['superadmin', 'comercial'], desc: 'Dashboard comercial (CRM de ventas): embudo de ventas, alertas de seguimiento pendiente.' },
  { ruta: '/comercial/contactos', roles: ['superadmin', 'comercial'], desc: 'Lista de contactos comerciales/leads: crear uno nuevo, buscar, filtrar por estado, importar desde excel o con IA, seleccionar y mandar campañas.' },
  { ruta: '/comercial/bandeja', roles: ['superadmin', 'comercial'], desc: 'Bandeja de entrada de mail (tipo Gmail): ver, responder, reenviar y borrar mails recibidos, con resumen automatico por IA.' },
  { ruta: '/comercial/campanias', roles: ['superadmin', 'comercial'], desc: 'Campañas de mail guardadas: crearlas con el asistente de IA (texto enriquecido + imagenes), editarlas y ver cuantas veces se enviaron.' },
  { ruta: '/comercial/catalogo', roles: ['superadmin', 'comercial'], desc: 'Catalogo de materiales/servicios reutilizables para armar presupuestos comerciales.' },
  { ruta: '/instalador', roles: ['instalador'], desc: 'Panel del instalador: locaciones asignadas.' },
  { ruta: '/consorcio', roles: ['consorcio_admin'], desc: 'Panel del administrador de consorcio.' },
  { ruta: '/residente', roles: ['residente'], desc: 'Panel del residente: su cargador y su consumo.' },
  { ruta: '/proveedor', roles: ['proveedor'], desc: 'Dashboard de fabricante para probar su equipo por OCPP.' },
];

function systemPrompt(rol) {
  const disponibles = RUTAS.filter((r) => r.roles.includes(rol));
  return `Sos el asistente de ayuda y navegacion de BILON Smart Buildings, un sistema de gestion de edificios y carga de vehiculos electricos.
Tu trabajo es ayudar al usuario a encontrar DONDE hacer algo dentro del sistema, o explicarle PASO A PASO como hacerlo si lo pide. No ejecutas ninguna accion, solo guias.

El usuario tiene el rol "${rol}". Estas son las UNICAS secciones a las que tiene acceso (nunca sugieras ni inventes otra ruta):
${disponibles.map((r) => `- ${r.ruta}: ${r.desc}`).join('\n')}

Reglas:
- Si la pregunta es sobre DONDE hacer algo, respondes con una explicacion breve y el campo navegar_a con la ruta exacta de la lista de arriba.
- Si la pregunta es COMO hacer algo paso a paso, das los pasos numerados en el campo respuesta (podes ademas sugerir navegar_a si corresponde a una ruta de la lista).
- Si la tarea no corresponde a ninguna ruta de la lista (el usuario no tiene acceso, o no existe en el sistema), decilo con honestidad en vez de inventar.
- Si la pregunta no tiene relacion con el sistema, respondes amablemente que solo podes ayudar con el uso de la plataforma.
- Respondes siempre en español, tono directo y breve.
- Nunca uses markdown (nada de **negrita**, #titulos, ni backticks) - el chat solo muestra texto plano.

Devolve EXCLUSIVAMENTE un objeto JSON valido (sin markdown, sin backticks, sin texto adicional) con estos campos:
- respuesta (string)
- navegar_a (string con una ruta EXACTA de la lista de arriba, o null)`;
}

router.post('/chat', async (req, res) => {
  if (!process.env.OPENROUTER_API_KEY) {
    return res.status(500).json({ error: 'Falta configurar OPENROUTER_API_KEY en el servidor.' });
  }
  const { mensaje, historial } = req.body ?? {};
  if (!mensaje || typeof mensaje !== 'string') {
    return res.status(400).json({ error: 'mensaje es requerido.' });
  }

  const historialSeguro = Array.isArray(historial)
    ? historial.slice(-8).filter((h) => h && (h.role === 'user' || h.role === 'assistant') && typeof h.content === 'string')
    : [];

  const messages = [
    { role: 'system', content: systemPrompt(req.user.rol) },
    ...historialSeguro.map((h) => ({ role: h.role, content: h.content })),
    { role: 'user', content: mensaje.slice(0, 2000) },
  ];

  try {
    const aiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: 'deepseek/deepseek-chat', messages, temperature: 0.2 }),
    });
    const data = await aiRes.json();
    if (!aiRes.ok) {
      console.error('Error de OpenRouter (asistente):', data);
      return res.status(502).json({ error: 'El asistente no esta disponible en este momento.' });
    }
    let text = (data.choices?.[0]?.message?.content ?? '').trim();
    text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/, '');
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { respuesta: text, navegar_a: null };
    }
    const rutaValida = RUTAS.find((r) => r.ruta === parsed.navegar_a && r.roles.includes(req.user.rol));
    res.json({ respuesta: parsed.respuesta ?? '', navegar_a: rutaValida ? rutaValida.ruta : null });
  } catch (err) {
    console.error('Error llamando a OpenRouter (asistente):', err);
    res.status(502).json({ error: 'No se pudo comunicar con el asistente.' });
  }
});

module.exports = router;
