// Envio masivo de campanias via Elastic Email (API v4), separado de Gmail
// (services/mail.js) para no arriesgar la cuenta personal con volumen alto.
// Ver schema_comercial_envios.sql y services/campaniaRamp.js.

const fs = require('fs');
const path = require('path');

const ELASTIC_EMAIL_API_KEY = process.env.ELASTIC_EMAIL_API_KEY;
const ELASTIC_EMAIL_FROM = process.env.ELASTIC_EMAIL_FROM;
const ELASTIC_EMAIL_API_URL = 'https://api.elasticemail.com/v4/emails';

const MIME_POR_EXTENSION = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

function elasticEmailConfigurado() {
  return Boolean(ELASTIC_EMAIL_API_KEY && ELASTIC_EMAIL_FROM);
}

// Error "permanente": esta direccion en particular no sirve (invalida,
// rechazada) - se marca fallido y se sigue con el resto del lote. Cualquier
// otro error (red, 5xx, rate limit) es "transitorio": no se marca el
// destinatario, se aborta el lote entero y se reintenta en el proximo tick.
class ElasticEmailPermanentError extends Error {}

async function enviarViaElasticEmail({
  to, subject, html, text, attachments = [],
}) {
  if (!elasticEmailConfigurado()) throw new Error('Elastic Email no configurado (falta ELASTIC_EMAIL_API_KEY/ELASTIC_EMAIL_FROM).');

  const body = {
    Recipients: [{ Email: to }],
    Content: {
      From: ELASTIC_EMAIL_FROM,
      // Las campanias salen desde el dominio de Elastic Email, pero las
      // respuestas ("me interesa") tienen que caer en la misma casilla que
      // ya revisa revisarBandeja() (services/mail.js) - sin esto se pierden.
      ...(process.env.MAIL_USER ? { ReplyTo: process.env.MAIL_USER } : {}),
      Subject: subject,
      Body: [
        { ContentType: 'HTML', Content: html },
        { ContentType: 'PlainText', Content: text },
      ],
      // Sin campo ContentID en la API de Elastic Email (schema oficial:
      // BinaryContent/Name/ContentType/Size) - el Content-ID lo derivan
      // ellos del propio Name, por eso Name tiene que ser exactamente el cid
      // usado en el <img src="cid:..."> del HTML (ver campaniaEnvioHelpers.js).
      // ContentType con el mime real de la imagen (no octet-stream): sin esto
      // los clientes de mail lo tratan como adjunto binario generico en vez
      // de renderizarlo inline en el cuerpo.
      Attachments: attachments.map((a) => ({
        BinaryContent: fs.readFileSync(a.path).toString('base64'),
        Name: a.cid,
        ContentType: MIME_POR_EXTENSION[path.extname(a.filename).toLowerCase()] || 'application/octet-stream',
      })),
    },
  };

  let response;
  try {
    response = await fetch(ELASTIC_EMAIL_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-ElasticEmail-ApiKey': ELASTIC_EMAIL_API_KEY,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error(`Elastic Email: error de red (${err.message})`);
  }

  if (response.status >= 400 && response.status < 500) {
    const detalle = await response.text().catch(() => '');
    throw new ElasticEmailPermanentError(`Elastic Email rechazo el envio a ${to}: ${response.status} ${detalle}`);
  }
  if (!response.ok) {
    throw new Error(`Elastic Email: error del servidor (${response.status})`);
  }

  const data = await response.json();
  const messageId = data?.TransactionID || data?.MessageID || data?.messageid;
  return { messageId };
}

module.exports = { elasticEmailConfigurado, enviarViaElasticEmail, ElasticEmailPermanentError };
