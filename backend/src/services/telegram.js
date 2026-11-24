// Bot de Telegram para el modulo de organizacion (ver schema_gestion.sql y
// schema_gestion_telegram.sql). Varios usuarios distintos pueden hablarle al
// MISMO bot desde sus propios chats - cada chat_id se resuelve a un usuario
// via telegram_vinculos (ver routes/gestion.js, comando /vincular).

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API_BASE = () => `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

function telegramConfigurado() {
  return Boolean(TELEGRAM_BOT_TOKEN);
}

async function enviarMensajeTelegram(chatId, text) {
  if (!telegramConfigurado()) return;
  try {
    await fetch(`${API_BASE()}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  } catch (err) {
    console.error('[telegram] Error mandando mensaje:', err.message);
  }
}

// Descarga un file_id de Telegram (foto o documento) y devuelve el buffer +
// un nombre de archivo razonable (Telegram no manda nombre para fotos).
async function descargarArchivoTelegram(fileId, nombreSugerido) {
  const infoRes = await fetch(`${API_BASE()}/getFile?file_id=${fileId}`);
  const info = await infoRes.json();
  if (!info.ok) throw new Error(`Telegram getFile fallo: ${info.description || infoRes.status}`);
  const filePath = info.result.file_path;
  const fileRes = await fetch(`https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${filePath}`);
  if (!fileRes.ok) throw new Error(`Telegram descarga de archivo fallo: ${fileRes.status}`);
  const buffer = Buffer.from(await fileRes.arrayBuffer());
  const nombre = nombreSugerido || filePath.split('/').pop();
  return { buffer, nombre };
}

module.exports = { telegramConfigurado, enviarMensajeTelegram, descargarArchivoTelegram };
