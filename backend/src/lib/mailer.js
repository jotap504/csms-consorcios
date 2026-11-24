// Mails de sistema (reset de contrasena, invitaciones, contacto publico) -
// usa el mismo SMTP que services/mail.js (Zoho, comercial@bilon.com.ar). Si
// no esta configurado (ej. desarrollo local sin credenciales), cae al stub
// de log para no romper esos flujos.
const { mailConfigurado, enviarMail } = require('../services/mail');

async function sendMail({ to, subject, html }) {
  if (!mailConfigurado()) {
    console.log('--- EMAIL STUB (SMTP no configurado) ---');
    console.log(`Para: ${to}`);
    console.log(`Asunto: ${subject}`);
    console.log(html);
    console.log('-----------------------------------------');
    return;
  }
  await enviarMail({ to, subject, html });
}

module.exports = { sendMail };
