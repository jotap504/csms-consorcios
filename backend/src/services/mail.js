// Envio de cotizaciones/informes 1 a 1 y lectura/resumen de la bandeja de
// entrada comercial (comercial@bilon.com.ar via Zoho Mail - contraseña o
// app password + SMTP/IMAP estandar, sin OAuth). Antes era Gmail
// (ventasbilonsmart@gmail.com); se migro para centralizar todo el mail
// comercial (campanias, cotizaciones, informes, respuestas) en una sola
// casilla que se revisa. Ver marketing/preguntas_modulo_ventas.md.

const nodemailer = require('nodemailer');
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const { pool } = require('../db');

const MAIL_USER = process.env.MAIL_USER;
const MAIL_PASSWORD = process.env.MAIL_PASSWORD;
const MAIL_HOST_SMTP = process.env.MAIL_HOST_SMTP || 'smtp.zoho.com';
const MAIL_HOST_IMAP = process.env.MAIL_HOST_IMAP || 'imap.zoho.com';

function mailConfigurado() {
  return Boolean(MAIL_USER && MAIL_PASSWORD);
}

function transporter() {
  return nodemailer.createTransport({
    host: MAIL_HOST_SMTP,
    port: 465,
    secure: true,
    auth: { user: MAIL_USER, pass: MAIL_PASSWORD },
  });
}

async function enviarMail({
  to, subject, html, text, attachments = [],
}) {
  if (!mailConfigurado()) throw new Error('Mail no configurado (falta MAIL_USER/MAIL_PASSWORD).');
  return transporter().sendMail({
    from: `BILON Smart Buildings <${MAIL_USER}>`, to, subject, html, text, attachments,
  });
}

// Envia un mail y ademas lo guarda en comercial_mails (bandeja tipo Gmail),
// para que aparezca como "saliente" junto a los mails entrantes en la UI.
async function enviarYRegistrarMail({
  to, subject, html, text, contactoId = null, responsableNombre = null, inReplyTo = null, attachments = [],
}) {
  const info = await enviarMail({
    to, subject, html, text, attachments,
  });
  await pool.query(
    `INSERT INTO comercial_mails
       (direccion, contacto_id, de_email, de_nombre, para_email, asunto, cuerpo_texto, cuerpo_html, message_id, in_reply_to, leido, responsable_nombre)
     VALUES ('saliente', $1, $2, 'BILON Smart Buildings', $3, $4, $5, $6, $7, $8, TRUE, $9)`,
    [contactoId, MAIL_USER, to, subject, text ?? null, html ?? null, info?.messageId ?? null, inReplyTo, responsableNombre],
  );
  return info;
}

async function resumirConIA(texto) {
  if (!process.env.OPENROUTER_API_KEY || !texto?.trim()) return null;
  try {
    const aiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek/deepseek-chat',
        messages: [{
          role: 'user',
          content: `Resumi en 1-2 oraciones, en español, de que trata este mail de un cliente/lead comercial (que pidio, que necesita, cualquier dato accionable). Sin markdown, texto plano.\n\nMail:\n${texto.slice(0, 6000)}`,
        }],
        temperature: 0,
      }),
    });
    const data = await aiRes.json();
    return data.choices?.[0]?.message?.content?.trim() ?? null;
  } catch (err) {
    console.error('Error resumiendo mail con IA:', err);
    return null;
  }
}

// Revisa la bandeja de entrada, matchea remitentes contra comercial_contactos
// por email, y crea un seguimiento con resumen por cada mail nuevo de un
// contacto conocido. Los mails de remitentes no reconocidos se listan aparte
// para que alguien los revise a mano (no se crean contactos solos).
async function revisarBandeja() {
  if (!mailConfigurado()) throw new Error('Mail no configurado (falta MAIL_USER/MAIL_PASSWORD).');

  const client = new ImapFlow({
    host: MAIL_HOST_IMAP, port: 993, secure: true, auth: { user: MAIL_USER, pass: MAIL_PASSWORD }, logger: false,
  });

  const procesados = [];
  const sinMatch = [];

  await client.connect();
  try {
    const lock = await client.getMailboxLock('INBOX');
    try {
      const uids = await client.search({ seen: false });
      for (const uid of uids ?? []) {
        // eslint-disable-next-line no-await-in-loop
        const msg = await client.fetchOne(uid, { source: true });
        if (!msg?.source) continue;
        // Marcar como leido apenas se procesa, sin importar el resultado -
        // si no, un mail sin contacto conocido (o cualquier error despues)
        // se re-procesa en cada revision para siempre.
        // eslint-disable-next-line no-await-in-loop
        await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true }).catch(() => {});
        // eslint-disable-next-line no-await-in-loop
        const parsed = await simpleParser(msg.source);
        const desde = parsed.from?.value?.[0]?.address?.toLowerCase();
        const deNombre = parsed.from?.value?.[0]?.name || desde || '(desconocido)';
        const asunto = parsed.subject || '(sin asunto)';
        const texto = parsed.text || parsed.html || '';

        if (!desde) { continue; }

        // eslint-disable-next-line no-await-in-loop
        const contacto = await pool.query('SELECT id, apellido, nombre FROM comercial_contactos WHERE LOWER(email) = $1 LIMIT 1', [desde]);
        const contactoId = contacto.rowCount > 0 ? contacto.rows[0].id : null;

        // Resumen con IA para todos los entrantes (tengan o no contacto
        // asociado), asi la bandeja siempre muestra de que trata el mail
        // sin tener que abrirlo.
        // eslint-disable-next-line no-await-in-loop
        const resumenIA = await resumirConIA(texto);

        // Se guarda en la bandeja (comercial_mails) tenga o no contacto
        // asociado, para que la UI tipo Gmail muestre todo lo que llega.
        // eslint-disable-next-line no-await-in-loop
        await pool.query(
          `INSERT INTO comercial_mails
             (direccion, contacto_id, de_email, de_nombre, para_email, asunto, cuerpo_texto, cuerpo_html, resumen_ia, message_id, in_reply_to, leido, fecha)
           VALUES ('entrante', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, FALSE, $11)`,
          [
            contactoId, desde, deNombre, MAIL_USER, asunto,
            parsed.text ?? null, parsed.html || null, resumenIA, parsed.messageId ?? null, parsed.inReplyTo ?? null,
            parsed.date ?? new Date(),
          ],
        );

        if (contactoId === null) {
          sinMatch.push({ desde, asunto });
          continue;
        }

        const resumen = resumenIA || asunto;
        // eslint-disable-next-line no-await-in-loop
        await pool.query(
          `INSERT INTO comercial_seguimientos (contacto_id, fecha, canal, tipo_actividad, resultado_resumen, mail_completo, responsable_nombre)
           VALUES ($1, CURRENT_DATE, 'Email', $2, $3, $4, 'Bandeja automatica')`,
          [contactoId, `Respuesta recibida: ${asunto}`, resumen, texto.slice(0, 20000)],
        );
        // eslint-disable-next-line no-await-in-loop
        await pool.query(
          `UPDATE comercial_contactos SET ultimo_contacto = CURRENT_DATE, actualizado_en = NOW() WHERE id = $1`,
          [contactoId],
        );
        procesados.push({
          contacto_id: contactoId, contacto: `${contacto.rows[0].apellido}, ${contacto.rows[0].nombre}`, asunto, resumen,
        });
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }

  return { procesados, sin_match: sinMatch };
}

module.exports = {
  mailConfigurado, enviarMail, enviarYRegistrarMail, revisarBandeja,
};
