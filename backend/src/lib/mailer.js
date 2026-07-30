// Stub mailer: no SMTP credentials configured yet. Logs the email instead of
// sending it so the rest of the reset/invite flow can be built and tested now.
// Swap this function's body for a real nodemailer transport once SMTP
// credentials (host/user/pass or an API key) are available — nothing else
// in the app needs to change.
async function sendMail({ to, subject, html }) {
  console.log('--- EMAIL STUB (SMTP no configurado) ---');
  console.log(`Para: ${to}`);
  console.log(`Asunto: ${subject}`);
  console.log(html);
  console.log('-----------------------------------------');
}

module.exports = { sendMail };
