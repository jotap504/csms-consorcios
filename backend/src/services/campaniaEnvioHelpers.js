const fs = require('fs');
const path = require('path');

const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads', 'comercial');

// Las imagenes propias (subidas al editor de campanias, servidas desde
// /api/comercial/archivos/:filename) se mandan como adjunto inline (CID) en
// vez de <img src="https://..."> remoto: la mayoria de los clientes de mail
// (Gmail incluido) bloquean imagenes externas por defecto en la primera
// vista ("mostrar imagenes"), pero un adjunto inline viaja con el mail y se
// ve siempre. Se calcula una sola vez, es igual para todos los destinatarios.
//
// Elastic Email NO tiene un campo ContentID en su API (confirmado contra el
// schema oficial: BinaryContent/Name/ContentType/Size, nada de ContentID) -
// derivan el Content-ID del propio "Name" del adjunto. Por eso el cid tiene
// que ser el nombre de archivo real (ya es un UUID generado por multer, unico
// de por si), no un string inventado - un cid que no matchea con ningun Name
// hace que la imagen llegue como adjunto suelto en vez de mostrarse inline.
function prepararImagenesInline(cuerpoHtml) {
  const attachmentsBase = [];
  let cuerpoConImagenesInline = cuerpoHtml;
  const imgRegex = /<img([^>]*)\ssrc=["']([^"']*\/api\/comercial\/archivos\/([a-zA-Z0-9._-]+))["']([^>]*)>/gi;
  let imgMatch;
  // eslint-disable-next-line no-cond-assign
  while ((imgMatch = imgRegex.exec(cuerpoHtml)) !== null) {
    const [full, before, , filename, after] = imgMatch;
    const nombreArchivo = path.basename(filename);
    const filePath = path.join(UPLOADS_DIR, nombreArchivo);
    if (fs.existsSync(filePath)) {
      attachmentsBase.push({ filename: nombreArchivo, path: filePath, cid: nombreArchivo });
      cuerpoConImagenesInline = cuerpoConImagenesInline.replace(full, `<img${before} src="cid:${nombreArchivo}"${after}>`);
    }
  }
  return { cuerpoConImagenesInline, attachmentsBase };
}

// Reemplazo de marcadores por contacto - la IA que redacta la campania
// escribe estos placeholders (ver campaniaSystemPrompt) esperando que se
// completen por destinatario; sin esto llegaban literales ("Hola [Nombre],").
// Agrega tambien el footer de baja con el link personalizado del contacto.
// Reescribe los <a href="http(s)://..."> del cuerpo para que pasen por el
// redirect de tracking (/comercial/click/:destId) en vez de ir directo al
// destino - asi se puede contar el click antes de mandar al link real. Se
// aplica ANTES de agregar el footer de baja, para no trackear ese link (la
// baja tiene que ser directa y confiable, sin depender de un redirect mas).
function reescribirLinksParaTracking(html, clickBaseUrl) {
  if (!clickBaseUrl) return html;
  return html.replace(/(<a[^>]*\shref=["'])(https?:\/\/[^"']+)(["'])/gi, (full, pre, url, post) => (
    `${pre}${clickBaseUrl}&u=${encodeURIComponent(url)}${post}`
  ));
}

function personalizarCuerpo({
  cuerpoConImagenesInline, contacto, bajaUrl, pixelUrl, clickBaseUrl,
}) {
  const nombreCompleto = `${contacto.nombre || ''} ${contacto.apellido || ''}`.trim();
  const cuerpoPersonalizado = reescribirLinksParaTracking(cuerpoConImagenesInline, clickBaseUrl)
    .replace(/\[Nombre Completo\]/gi, nombreCompleto || 'estimado/a')
    .replace(/\[Nombre\]/gi, contacto.nombre || 'estimado/a')
    .replace(/\[Apellido\]/gi, contacto.apellido || '');
  const footerHtml = `<p style="margin-top:24px;font-size:11px;color:#999;">Si no queres recibir mas mails nuestros, <a href="${bajaUrl}" style="color:#999;">hace click aca para darte de baja</a>.</p>`;
  // Pixel de 1x1 invisible, solo en el html (nunca en el text plano) - asi se
  // detecta la apertura cuando el cliente de mail carga imagenes remotas. No
  // es 100% confiable (Gmail/Apple a veces precargan igual, o el destinatario
  // bloquea imagenes), pero es la señal estandar de la industria.
  const pixelHtml = pixelUrl ? `<img src="${pixelUrl}" width="1" height="1" alt="" style="display:none;width:1px;height:1px;border:0;" />` : '';
  const html = cuerpoPersonalizado + footerHtml + pixelHtml;
  const text = `${(cuerpoPersonalizado + footerHtml).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}\n\nDarte de baja: ${bajaUrl}`;
  return { html, text };
}

module.exports = { prepararImagenesInline, personalizarCuerpo };
